use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, Stream};
use eyre::{bail, eyre, Context, ContextCompat, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Listener, Manager};
use vibe_core::get_vibe_temp_folder;

#[cfg(target_os = "macos")]
use crate::screen_capture_kit;

use crate::utils::{get_local_time, random_string, LogError};

type WavWriterHandle = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

static IS_RECORDING: AtomicBool = AtomicBool::new(false);
static IS_TOGGLING: AtomicBool = AtomicBool::new(false);
static LAST_DEVICES: Mutex<Option<Vec<AudioDevice>>> = Mutex::new(None);
static LAST_STORE_IN_DOCUMENTS: Mutex<Option<bool>> = Mutex::new(None);

fn show_recording_notification(app_handle: &AppHandle) -> Result<()> {
    // Emit event to frontend to show notification
    // Frontend will use Web Notification API which is more reliable than overlay windows
    app_handle.emit("show_recording_notification", json!({"status": "started"}))?;
    Ok(())
}

fn hide_recording_notification(app_handle: &AppHandle) -> Result<()> {
    // Emit event to frontend to show notification
    app_handle.emit("show_recording_notification", json!({"status": "stopped"}))?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub is_default: bool,
    pub is_input: bool,
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let mut audio_devices = Vec::new();

    let default_in = host.default_input_device().map(|e| e.name()).context("name")?;
    let default_out = host.default_output_device().map(|e| e.name()).context("name")?;
    tracing::debug!("Default Input Device:\n{:?}", default_in);
    tracing::debug!("Default Output Device:\n{:?}", default_out);

    let devices = host.devices()?;
    tracing::debug!("Devices: ");
    for (device_index, device) in devices.enumerate() {
        let name = device.name()?;
        let is_default_in = default_in.as_ref().is_ok_and(|d| d == &name);
        let is_default_out = if cfg!(target_os = "macos") {
            false
        } else {
            default_out.as_ref().is_ok_and(|d| d == &name)
        };

        let is_input = device.default_input_config().is_ok();

        let audio_device = AudioDevice {
            is_default: is_default_in || is_default_out,
            is_input,
            id: device_index.to_string(),
            name,
        };
        audio_devices.push(audio_device);
    }

    #[cfg(target_os = "macos")]
    audio_devices.push(AudioDevice {
        is_default: true,
        is_input: false,
        id: "screencapturekit".to_string(),
        name: "Speakers".into(),
    });

    Ok(audio_devices)
}

struct StreamHandle(Stream);
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

#[tauri::command]
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
/// Record audio from the given devices, store to wav, merge with ffmpeg, and return path
pub async fn start_record(app_handle: AppHandle, devices: Vec<AudioDevice>, store_in_documents: bool) -> Result<()> {
    // Check if already recording to prevent double-starts
    let was_recording = IS_RECORDING.swap(true, Ordering::SeqCst);
    if was_recording {
        tracing::warn!("start_record called but already recording, ignoring");
        return Ok(());
    }

    // Store devices and preferences for global shortcut
    {
        let mut last_devices = LAST_DEVICES
            .lock()
            .map_err(|e| eyre!("Failed to lock LAST_DEVICES: {:?}", e))?;
        *last_devices = Some(devices.clone());
        let mut last_store = LAST_STORE_IN_DOCUMENTS
            .lock()
            .map_err(|e| eyre!("Failed to lock LAST_STORE_IN_DOCUMENTS: {:?}", e))?;
        *last_store = Some(store_in_documents);
    }

    // Notify frontend that recording has started
    app_handle.emit("record_started", ())?;
    // Show recording notification (more reliable than overlay window)
    show_recording_notification(&app_handle)
        .map_err(|e| {
            tracing::warn!("Failed to show recording notification: {:?}", e);
            e
        })
        .ok();
    let host = cpal::default_host();

    let mut wav_paths: Vec<(PathBuf, u32)> = Vec::new();
    let mut stream_handles = Vec::new();
    let mut stream_writers = Vec::new();

    #[cfg(target_os = "macos")]
    let mut screencapture_stream: Option<_> = None;

    for device in devices {
        tracing::debug!("Recording from device: {}", device.name);
        tracing::debug!("Device ID: {}", device.id);

        let is_input = device.is_input;
        if device.id == "screencapturekit" {
            #[cfg(target_os = "macos")]
            {
                let stream = screen_capture_kit::init()?;
                let stream = Arc::new(stream);
                screencapture_stream = Some(stream.clone());
                screen_capture_kit::start_capture(&stream)?;
            }
        } else {
            let device_id: usize = device.id.parse().context("Failed to parse device ID")?;
            let device = host.devices()?.nth(device_id).context("Failed to get device by ID")?;
            let config = if is_input {
                device.default_input_config().context("Failed to get default input config")?
            } else {
                device.default_output_config().context("Failed to get default input config")?
            };
            let spec = wav_spec_from_config(&config);

            let path = get_vibe_temp_folder().join(format!("{}.wav", random_string(10)));
            tracing::debug!("WAV file path: {:?}", path);
            wav_paths.push((path.clone(), 0));

            let writer = hound::WavWriter::create(path.clone(), spec)?;
            let writer = Arc::new(Mutex::new(Some(writer)));
            stream_writers.push(writer.clone());
            let writer_2 = writer.clone();

            let err_fn = move |err| {
                tracing::error!("An error occurred on stream: {}", err);
            };

            let stream = match config.sample_format() {
                cpal::SampleFormat::I8 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::trace!("Writing input data (I8)");
                        write_input_data::<i8, i8>(data, &writer_2)
                    },
                    err_fn,
                    None,
                )?,
                cpal::SampleFormat::I16 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::trace!("Writing input data (I16)");
                        write_input_data::<i16, i16>(data, &writer_2)
                    },
                    err_fn,
                    None,
                )?,
                cpal::SampleFormat::I32 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::trace!("Writing input data (I32)");
                        write_input_data::<i32, i32>(data, &writer_2)
                    },
                    err_fn,
                    None,
                )?,
                cpal::SampleFormat::F32 => device.build_input_stream(
                    &config.into(),
                    move |data, _: &_| {
                        tracing::trace!("Writing input data (F32)");
                        write_input_data::<f32, f32>(data, &writer_2)
                    },
                    err_fn,
                    None,
                )?,
                sample_format => {
                    bail!("Unsupported sample format '{}'", sample_format)
                }
            };
            stream.play()?;
            tracing::debug!("Stream started playing");

            let stream_handle = Arc::new(Mutex::new(Some(StreamHandle(stream))));
            stream_handles.push(stream_handle.clone());
            tracing::debug!("Stream handle created");
        }
    }

    let app_handle_clone = app_handle.clone();
    app_handle.once("stop_record", move |_event| {
        IS_RECORDING.store(false, Ordering::SeqCst);
        // Show recording stopped notification
        hide_recording_notification(&app_handle_clone).map_err(|e| {
            tracing::warn!("Failed to show recording stopped notification: {:?}", e);
            e
        }).ok();
        for (i, stream_handle) in stream_handles.iter().enumerate() {
            let stream_handle = stream_handle.lock().map_err(|e| eyre!("{:?}", e)).log_error();
            if let Some(mut stream_handle) = stream_handle {
                let stream = stream_handle.take();
                let writer = stream_writers[i].clone();
                if let Some(stream) = stream {
                    tracing::debug!("Pausing stream");
                    stream.0.pause().map_err(|e| eyre!("{:?}", e)).log_error();
                    tracing::debug!("Finalizing writer");
                    let writer = writer.lock().expect("lock").take().expect("writer");
                    let written = writer.len();
                    wav_paths[i] = (wav_paths[i].0.clone(), written);
                    writer.finalize().map_err(|e| eyre!("{:?}", e)).log_error();
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Some(stream) = screencapture_stream {
                screen_capture_kit::stop_capture(&stream).map_err(|e| eyre!("{:?}", e)).log_error();
                let output_path = get_vibe_temp_folder().join(format!("{}.wav", random_string(5)));
                screen_capture_kit::screencapturekit_to_wav(output_path.clone()).map_err(|e| eyre!("{e:?}")).log_error();
                tracing::debug!("output path is {}", output_path.display());
                wav_paths.push((output_path, 1));
            }
        }

        let dst = if wav_paths.len() == 1 {
            wav_paths[0].0.clone()
        } else if wav_paths[0].1 > 0 && wav_paths[1].1 > 0 {
            let dst = get_vibe_temp_folder().join(format!("{}.wav", random_string(10)));
            tracing::debug!("Merging WAV files");
            vibe_core::audio::merge_wav_files(wav_paths[0].0.clone(), wav_paths[1].0.clone(), dst.clone()).map_err(|e| eyre!("{e:?}")).log_error();
            dst
        } else if wav_paths[0].1 > wav_paths[1].1 {
            // First WAV file has a larger sample count, choose it
            wav_paths[0].0.clone()
        } else {
            // Second WAV file has a larger sample count or both have non-positive sample counts,
            // choose the second WAV file or fallback to the first one
            wav_paths[1].0.clone()
        };

        tracing::debug!("Emitting record_finish event");
        let mut normalized = get_vibe_temp_folder().join(format!("{}.wav", get_local_time()));
        vibe_core::audio::normalize(dst.clone(), normalized.clone(), None).map_err(|e| eyre!("{e:?}")).log_error();

        if store_in_documents {
            if let Some(file_name) = normalized.file_name() {
                let documents_path = app_handle_clone.path().document_dir().map_err(|e| eyre!("{e:?}")).log_error();
                if let Some(documents_path) = documents_path {
                    let target_path = documents_path.join(file_name);
                    if std::fs::rename(&normalized, &target_path).context("Failed to move file to documents directory").map_err(|e| eyre!("{e:?}")).is_err() {
                        // if it's different filesystem
                        std::fs::copy(&normalized, &target_path).context("Failed to copy file to documents directory").map_err(|e| eyre!("{e:?}")).log_error();
                    }
                    normalized = target_path;
                }
            } else {
                tracing::error!("Failed to retrieve file name from destination path");
            }
        }

        // Clean files
        for (path, _) in wav_paths {
            if path.exists() {
                std::fs::remove_file(path).map_err(|e| eyre!("{e:?}")).log_error();
            }
        }
        // Ensure state is false when recording finishes (in case it wasn't already)
        IS_RECORDING.store(false, Ordering::SeqCst);
        // Emit record_stopped again to ensure frontend state is updated
        app_handle_clone.emit("record_stopped", ()).map_err(|e| eyre!("{e:?}")).log_error();
        // Then emit record_finish
        app_handle_clone.emit(
            "record_finish",
            json!({"path": normalized.to_string_lossy(), "name": normalized.file_name().map(|n| n.to_str().unwrap_or_default()).unwrap_or_default()}),
        ).map_err(|e| eyre!("{e:?}")).log_error();
    });

    Ok(())
}

fn sample_format(format: cpal::SampleFormat) -> hound::SampleFormat {
    if format.is_float() {
        hound::SampleFormat::Float
    } else {
        hound::SampleFormat::Int
    }
}

fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> hound::WavSpec {
    hound::WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate().0 as _,
        bits_per_sample: (config.sample_format().sample_size() * 8) as _,
        sample_format: sample_format(config.sample_format()),
    }
}

use std::ops::Mul;

fn write_input_data<T, U>(input: &[T], writer: &WavWriterHandle)
where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T> + Mul<Output = U> + Copy,
{
    if let Ok(mut guard) = writer.try_lock() {
        if let Some(writer) = guard.as_mut() {
            for &sample in input.iter() {
                let sample: U = U::from_sample(sample);
                writer.write_sample(sample).ok();
            }
        }
    }
}

/// Toggle recording: start if not recording, stop if recording
pub async fn toggle_record_internal(app_handle: AppHandle) -> Result<()> {
    // Prevent concurrent toggle attempts
    if IS_TOGGLING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        tracing::warn!("Toggle already in progress, ignoring duplicate request");
        return Ok(());
    }

    // Use SeqCst ordering for consistent state visibility
    let is_recording = IS_RECORDING.load(Ordering::SeqCst);
    tracing::info!("toggle_record_internal called. Current recording state: {}", is_recording);

    let result = if is_recording {
        tracing::info!("Global shortcut: stopping recording");
        // Set state to false immediately to prevent race conditions
        IS_RECORDING.store(false, Ordering::SeqCst);
        // Notify frontend immediately that recording stopped
        app_handle.emit("record_stopped", ())?;
        // Show recording stopped notification
        hide_recording_notification(&app_handle)
            .map_err(|e| {
                tracing::warn!("Failed to show recording stopped notification: {:?}", e);
                e
            })
            .ok();
        // Then trigger the stop process
        app_handle.emit("stop_record", ())?;
        Ok(())
    } else {
        tracing::info!("Global shortcut: starting recording");
        // Don't set IS_RECORDING here - let start_record handle it to avoid race condition

        let devices = {
            let last_devices = LAST_DEVICES
                .lock()
                .map_err(|e| eyre!("Failed to lock LAST_DEVICES: {:?}", e))?;
            last_devices.as_ref().cloned()
        };
        let store_in_documents = {
            let last_store = LAST_STORE_IN_DOCUMENTS
                .lock()
                .map_err(|e| eyre!("Failed to lock LAST_STORE_IN_DOCUMENTS: {:?}", e))?;
            *last_store
        };

        let result = if let Some(devices) = devices {
            if let Some(store_in_documents) = store_in_documents {
                start_record(app_handle.clone(), devices, store_in_documents).await
            } else {
                // Use default devices if no previous recording
                let all_devices = get_audio_devices()?;
                let mut default_devices = Vec::new();
                for device in all_devices {
                    if device.is_default {
                        default_devices.push(device);
                    }
                }
                if default_devices.is_empty() {
                    bail!("No default audio devices found");
                }
                start_record(app_handle.clone(), default_devices, false).await
            }
        } else {
            // Use default devices if no previous recording
            let all_devices = get_audio_devices()?;
            let mut default_devices = Vec::new();
            for device in all_devices {
                if device.is_default {
                    default_devices.push(device);
                }
            }
            if default_devices.is_empty() {
                bail!("No default audio devices found");
            }
            start_record(app_handle.clone(), default_devices, false).await
        };

        // If start_record failed, it will have already reset the state, but we should still emit the event
        if let Err(e) = &result {
            tracing::error!("Failed to start recording: {:?}", e);
            // start_record already handles resetting IS_RECORDING if it fails, but let's make sure
            let was_recording = IS_RECORDING.swap(false, Ordering::SeqCst);
            if was_recording {
                app_handle.emit("record_stopped", ())?;
            }
        }

        result
    };

    // Release the toggle lock
    IS_TOGGLING.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
/// Toggle recording: start if not recording, stop if recording
pub async fn toggle_record(app_handle: AppHandle) -> Result<()> {
    toggle_record_internal(app_handle).await
}

/// Command to set ignore cursor events for a window (click-through mode)
/// This allows the overlay window to be transparent to mouse events
#[tauri::command]
pub fn set_ignore_cursor_events(window: tauri::Window, ignore: bool) -> Result<()> {
    window.set_ignore_cursor_events(ignore).map_err(|e| eyre!("Failed to set ignore cursor events: {:?}", e))?;
    Ok(())
}
