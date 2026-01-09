import '@fontsource/roboto'
import { event, path } from '@tauri-apps/api'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { basename } from '@tauri-apps/api/path'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-shell'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { useContext, useEffect, useRef, useState } from 'react'
import { toast as hotToast } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from 'usehooks-ts'
import successSound from '~/assets/success.mp3'
import { TextFormat } from '~/components/FormatSelect'
import { AudioDevice } from '~/lib/audio'
import * as config from '~/lib/config'
import { Claude, Llm, Ollama } from '~/lib/llm'
import { executeAnamediTranscription, summaryTemplates } from '~/lib/anamediApi'
import * as transcript from '~/lib/transcript'
import { useConfirmExit } from '~/lib/useConfirmExit'
import { NamedPath, ls, openPath, pathToNamedPath, startKeepAwake, stopKeepAwake } from '~/lib/utils'
import { getX86Features } from '~/lib/x86Features'
import { ErrorModalContext } from '~/providers/ErrorModal'
import { useFilesContext } from '~/providers/FilesProvider'
import { ModelOptions, usePreferenceProvider } from '~/providers/Preference'
import { UpdaterContext } from '~/providers/Updater'

export interface BatchOptions {
	files: NamedPath[]
	format: TextFormat
	modelOptions: ModelOptions
}

export function viewModel() {
	const location = useLocation()
	const [settingsVisible, setSettingsVisible] = useState(location.hash === '#settings')
	const navigate = useNavigate()
	const [loading, setLoading] = useState(false)
	const [isRecording, setIsRecording] = useState(false)
	const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)
	const [recordingDuration, setRecordingDuration] = useState<string>('00:00')
	const abortRef = useRef<boolean>(false)
	const [isAborting, setIsAborting] = useState(false)
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [summarizeSegments, setSummarizeSegments] = useState<transcript.Segment[] | null>(null)
	const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
	const [progress, setProgress] = useState<number | null>(0)
	const { t } = useTranslation()
	const [llm, setLlm] = useState<Llm | null>(null)
	const [transcriptTab, setTranscriptTab] = useLocalStorage<'transcript' | 'summary'>('prefs_transcript_tab', 'transcript')
	useConfirmExit((segments?.length ?? 0) > 0 || loading)

	const { files, setFiles } = useFilesContext()
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)
	const [devices, setDevices] = useState<AudioDevice[]>([])
	const [inputDevice, setInputDevice] = useState<AudioDevice | null>(null)
	const [outputDevice, setOutputDevice] = useState<AudioDevice | null>(null)

	const { updateApp, availableUpdate } = useContext(UpdaterContext)
	const { setState: setErrorModal } = useContext(ErrorModalContext)

	async function onFilesChanged() {
		if (files.length === 1) {
			setAudio(new Audio(convertFileSrc(files[0].path)))
		}
	}

	async function checkIfCrashedRecently() {
		const isCrashed = await invoke<boolean>('is_crashed_recently')
		if (isCrashed) {
			preference.setUseGpu(false)
			dialog.message(t('common.crashed-recently'))
			await invoke('rename_crash_file')
		}
	}

	useEffect(() => {
		setFiles([])
		if (!(files.length === 1)) {
			setAudio(null)
		}
	}, [location])

	useEffect(() => {
		checkIfCrashedRecently()
	}, [])

	useEffect(() => {
		onFilesChanged()
	}, [files])

	useEffect(() => {
		if (preference.llmConfig?.platform === 'ollama') {
			const llmInstance = new Ollama(preference.llmConfig)
			setLlm(llmInstance)
		} else {
			const llmInstance = new Claude(preference.llmConfig)
			setLlm(llmInstance)
		}
	}, [preference.llmConfig])


	useEffect(() => {
		preferenceRef.current = preference
	}, [preference])

	// Register global shortcut from preferences on mount and when preferences change
	useEffect(() => {
		async function registerShortcut() {
			try {
				await invoke('register_global_shortcut', {
					modifiers: preference.globalShortcutModifiers || 'Alt+Shift',
					key: preference.globalShortcutKey || 'R',
				})
				console.log('Global shortcut registered:', preference.globalShortcutModifiers, '+', preference.globalShortcutKey)
			} catch (error) {
				console.error('Failed to register global shortcut:', error)
			}
		}
		registerShortcut()
	}, [preference.globalShortcutModifiers, preference.globalShortcutKey])

	// Update recording duration timer
	useEffect(() => {
		if (!isRecording || !recordingStartTime) {
			setRecordingDuration('00:00')
			return
		}

		const interval = setInterval(() => {
			const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000)
			const minutes = Math.floor(elapsed / 60)
			const seconds = elapsed % 60
			setRecordingDuration(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
		}, 1000)

		return () => clearInterval(interval)
	}, [isRecording, recordingStartTime])

	async function handleNewSegment() {
		await listen('transcribe_progress', (event) => {
			const value = event.payload as number
			if (value >= 0 && value <= 100) {
				setProgress(value)
			}
		})
		await listen<transcript.Segment>('new_segment', (event) => {
			const { payload } = event
			setSegments((prev) => (prev ? [...prev, payload] : [payload]))
		})
	}

	async function handleRecordStart() {
		// Create persistent listener - listen returns a Promise that resolves to an unlisten function
		// We keep the listener active by not calling the unlisten function
		listen('record_started', () => {
			console.log('Received record_started event')
			setIsRecording(true)
			setRecordingStartTime(Date.now())
		}).catch((error) => {
			console.error('Error setting up record_started listener:', error)
		})
	}

	async function handleRecordStop() {
		// Create persistent listener
		listen('record_stopped', () => {
			console.log('Received record_stopped event, setting isRecording to false')
			setIsRecording(false)
			setRecordingStartTime(null)
			setRecordingDuration('00:00')
		}).catch((error) => {
			console.error('Error setting up record_stopped listener:', error)
		})
	}

	async function handleRecordFinish() {
		// Create persistent listener
		listen<{ path: string; name: string }>('record_finish', (event) => {
			const { name, path } = event.payload
			console.log('Received record_finish event, setting isRecording to false', { name, path })
			// Ensure recording state is false before starting transcription
			// Use setTimeout to ensure state update happens
			setIsRecording(false)
			// Double-check after a brief delay
			setTimeout(() => {
				setIsRecording(false)
			}, 100)
			preference.setHomeTabIndex(1)
			setFiles([{ name, path }])
			transcribe(path)
		}).catch((error) => {
			console.error('Error setting up record_finish listener:', error)
		})
	}

	async function handleRecordingNotification() {
		await listen<{ status: string }>('show_recording_notification', async (event) => {
			const { status } = event.payload
			if ('Notification' in window && Notification.permission === 'granted') {
				const title = status === 'started' ? '🔴 Recording Started' : '⏹️ Recording Stopped'
				const body = status === 'started' 
					? 'Anamedi is now recording audio. Press Opt+Shift+R to stop.'
					: 'Recording stopped. Transcribing...'
				new Notification(title, { body, icon: '/logo.png' })
			} else if ('Notification' in window && Notification.permission !== 'denied') {
				// Request permission
				Notification.requestPermission().then((permission) => {
					if (permission === 'granted') {
						const title = status === 'started' ? '🔴 Recording Started' : '⏹️ Recording Stopped'
						const body = status === 'started' 
							? 'Anamedi is now recording audio. Press Opt+Shift+R to stop.'
							: 'Recording stopped. Transcribing...'
						new Notification(title, { body, icon: '/logo.png' })
					}
				})
			}
		})
	}

	async function loadAudioDevices() {
		let newDevices = await invoke<AudioDevice[]>('get_audio_devices')
		const defaultInput = newDevices.find((d) => d.isDefault && d.isInput)
		const defaultOutput = newDevices.find((d) => d.isDefault && !d.isInput)
		if (defaultInput) {
			setInputDevice(defaultInput)
		}
		if (defaultOutput) {
			setOutputDevice(defaultOutput)
		}
		setDevices(newDevices)
	}

	async function onAbort() {
		setIsAborting(true)
		abortRef.current = true
		event.emit('abort_transcribe')
	}

	async function selectFiles() {
		const selected = await dialog.open({
			multiple: true,
			filters: [
				{
					name: 'Audio or Video files',
					extensions: [...config.audioExtensions, ...config.videoExtensions],
				},
			],
		})
		if (selected) {
			const newFiles: NamedPath[] = []
			for (const path of selected) {
				const name = await basename(path)
				newFiles.push({ path, name })
			}
			setFiles(newFiles)

			if (newFiles.length > 1) {
				navigate('/batch', { state: { files: newFiles } })
			}
		}
	}

	async function checkModelExists() {
		try {
			const configPath = await invoke<string>('get_models_folder')
			const entries = await ls(configPath)
			const filtered = entries.filter((e) => e.name?.endsWith('.bin'))
			if (filtered.length === 0) {
				// Download new model if no models and it's not manual installation
				if (!preference.skippedSetup) {
					navigate('/setup')
				}
			} else {
				if (!preference.modelPath || !(await fs.exists(preference.modelPath))) {
					// if model path not found set another one as default
					const absPath = await path.join(configPath, filtered[0].name)
					preference.setModelPath(absPath)
				}
			}
		} catch (e) {
			console.error(e)
			navigate('/setup')
		}
	}

	async function handleDrop() {
		listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
			const newFiles: NamedPath[] = []
			for (const path of event.payload.paths) {
				const file = await pathToNamedPath(path)
				newFiles.push({ name: file.name, path: file.path })
			}
			setFiles(newFiles)
			if (newFiles.length > 1) {
				navigate('/batch', { state: { files: newFiles } })
			}
		})
	}

	async function checkVulkanOk() {
		try {
			await invoke('check_vulkan')
		} catch (error) {
			console.error(error)
			await dialog.message(
				`Your GPU is unsupported in this version of Anamedi. Please download anamedi_2.4.0_x64-setup.exe. Click OK to open the download page.`,
				{
					kind: 'error',
				}
			)
			open(config.latestVersionWithoutVulkan)
		}
	}

	async function CheckCpuAndInit() {
		const features = await getX86Features()
		if (features) {
			const unsupported = Object.entries(features || {})
				.filter(([_, feature]) => feature.enabled && !feature.support)
				.map(([name]) => name)
			if (unsupported.length > 0) {
				// Found unsupported features
				await dialog.message(
					`Your CPU is old and doesn't support some features (${unsupported.join(
						','
					)}). Please click OK and read the readme that will open for more information.`,
					{
						kind: 'error',
					}
				)
				open(config.unsupportedCpuReadmeURL)
				return // Don't run anything
			}
		}

		handleDrop()
		checkModelExists()
		handleNewSegment()
		handleRecordStart()
		handleRecordStop()
		handleRecordFinish()
		handleRecordingNotification()
		loadAudioDevices()
	}

	useEffect(() => {
		checkVulkanOk()
		CheckCpuAndInit()
	}, [])

	async function startRecord() {
		startKeepAwake()
		setSegments(null)
		setSummarizeSegments(null)
		setTranscriptTab('transcript')

		setIsRecording(true)
		let devices: AudioDevice[] = []
		if (inputDevice) {
			devices.push(inputDevice)
		}
		if (outputDevice) {
			devices.push(outputDevice)
		}
		invoke('start_record', { devices, storeInDocuments: preference.storeRecordInDocuments })
	}

	async function stopRecord() {
		// Immediately set recording state to false when user stops
		setIsRecording(false)
		emit('stop_record')
	}

	/**
	 * Copy summary text to clipboard and automatically paste it.
	 * Shows notification to let user focus target window, then pastes.
	 */
	async function copySummaryToClipboard(text: string): Promise<void> {
		console.log('Auto-paste: Copying summary to clipboard, text length:', text.length)
		
		try {
			// First, copy to clipboard
			await clipboard.writeText(text)
			console.log('✓ Summary copied to clipboard successfully')
			
			// Show notification to give user time to focus target window
			hotToast.success(
				'📋 Zusammenfassung wird in 2 Sekunden eingefügt...',
				{ 
					duration: 2500,
					style: {
						background: '#3B82F6',
						color: 'white',
						fontWeight: 'bold',
						padding: '16px',
						borderRadius: '10px',
					}
				}
			)
			
			// Wait for user to click in target window
			console.log('Waiting 2 seconds for user to focus target window...')
			await new Promise((resolve) => setTimeout(resolve, 2000))
			
			// Try to paste
			console.log('Attempting to simulate paste...')
			try {
				await invoke('simulate_paste')
				console.log('✓ Paste simulation completed')
				hotToast.success(
					'✓ Zusammenfassung eingefügt!',
					{ 
						duration: 2000,
						style: {
							background: '#10B981',
							color: 'white',
							fontWeight: 'bold',
						}
					}
				)
			} catch (pasteError) {
				console.error('Paste simulation failed:', pasteError)
				// Paste failed, but text is still in clipboard
				hotToast.error(
					'Auto-Einfügen fehlgeschlagen. Text wurde in die Zwischenablage kopiert - drücken Sie Cmd+V zum Einfügen.',
					{ duration: 5000 }
				)
			}
		} catch (error) {
			console.error('Failed to copy to clipboard:', error)
			hotToast.error('Fehler beim Kopieren in die Zwischenablage', { duration: 3000 })
		}
	}

	async function transcribe(path: string) {
		startKeepAwake()

		// Ensure recording state is false when transcription starts
		setIsRecording(false)

		setSegments(null)
		setSummarizeSegments(null)
		setTranscriptTab('transcript')

		setLoading(true)
		abortRef.current = false

		let newSegments: transcript.Segment[] = []
		let usedAnamediApi = false
		let hasSummary = false

		try {
			const startTime = performance.now()

			if (!preference.useLocalProcessing) {
				// Get selected template or default to SOAP
				const templateId = preference.summaryTemplate || 'SOAP'
				const template = summaryTemplates.find(t => t.id === templateId) || summaryTemplates[0]
				
				const anamediResponse = await executeAnamediTranscription({
					audioPath: path,
					schema: template.schema,
					instructions: template.instructions,
					apiKey: preference.anamediApiKey ?? undefined,
				})
				usedAnamediApi = true

				const diarizedSegments: transcript.Segment[] = (anamediResponse.diarized ?? []).map((segment) => {
					const [start, stop] = segment.timestamp
					return {
						start,
						stop,
						text: segment.text,
						speaker: segment.speaker,
					}
				})

				newSegments = diarizedSegments.length ? diarizedSegments : [{ start: 0, stop: 0, text: anamediResponse.transcript }]
				setSegments(newSegments)

				const total = Math.round((performance.now() - startTime) / 1000)
				console.info(`Anamedi transcribe took ${total} seconds.`)
				hotToast.success(t('common.transcribe-took', { total: String(total) }), { position: 'bottom-center' })

				const structured = anamediResponse.structuredData as unknown
				if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
					console.info('[Anamedi] structuredData', structured)

					const soapData = structured as {
						title?: unknown
						summary?: unknown
					}

					// Extract summary field (contains the formatted German SOAP note)
					const summaryText =
						typeof soapData.summary === 'string' && soapData.summary.trim().length > 0
							? soapData.summary.trim()
							: null

					console.log('Summary text extracted:', summaryText ? `Length: ${summaryText.length}` : 'null/empty')
					console.log('Auto-copy to clipboard enabled:', preferenceRef.current.autoPasteOnFinish)

					if (summaryText) {
						// Optionally prepend title if available
						let finalText = summaryText
						if (typeof soapData.title === 'string' && soapData.title.trim().length > 0) {
							finalText = `${soapData.title.trim()}\n\n${summaryText}`
						}

						const lastStop = newSegments.length ? newSegments[newSegments.length - 1].stop : 0
						setSummarizeSegments([
							{
								start: 0,
								stop: lastStop,
								text: finalText,
							},
						])
						// Auto-copy summary to clipboard if enabled
						if (preferenceRef.current.autoPasteOnFinish) {
							console.log('Auto-copying summary to clipboard, text length:', finalText.length)
							await copySummaryToClipboard(finalText)
						} else {
							console.log('Auto-copy is disabled in preferences')
						}
						hasSummary = true
					} else {
						console.log('No summary text found in structuredData')
					}
				}
			} else {
				const diarizeOptions = {
					threshold: preference.diarizeThreshold,
					max_speakers: preference.maxSpeakers,
					enabled: preference.recognizeSpeakers,
				}
				const res: transcript.Transcript = await invoke('transcribe', {
					options: preference.modelOptions,
					modelPath: preference.modelPath,
					diarizeOptions,
					ffmpegOptions: preference.ffmpegOptions,
				})

				newSegments = res.segments ?? []
				setSegments(newSegments)

				const total = Math.round((performance.now() - startTime) / 1000)
				console.info(`Local transcribe took ${total} seconds.`)
				hotToast.success(t('common.transcribe-took', { total: String(total) }), { position: 'bottom-center' })
			}
		} catch (error) {
			if (!abortRef.current) {
				stopKeepAwake()
				console.error('error: ', error)
				setErrorModal?.({ log: String(error), open: true })
				setLoading(false)
			}
		} finally {
			stopKeepAwake()
			setLoading(false)
			setIsAborting(false)
			setProgress(null)
			if (!abortRef.current) {
				// Play sound
				if (preferenceRef.current.soundOnFinish) {
					new Audio(successSound).play()
				}
				// Only focus the window if we didn't paste a summary (to avoid stealing focus)
				if (preferenceRef.current.focusOnFinish && !hasSummary) {
					webview.getCurrentWebviewWindow().unminimize()
					webview.getCurrentWebviewWindow().setFocus()
				}
			}
		}

		// Only run local LLM summarization when using the local pipeline.
		if (!usedAnamediApi && newSegments && llm && preferenceRef.current.llmConfig?.enabled) {
			try {
				const question = `${preferenceRef.current.llmConfig.prompt.replace('%s', transcript.asText(newSegments))}`
				const answerPromise = llm.ask(question)
				hotToast.promise(
					answerPromise,
					{
						loading: t('common.summarize-loading'),
						error: (error) => {
							return String(error)
						},
						success: t('common.summarize-success'),
					},
					{ position: 'bottom-center' }
				)
				const answer = await answerPromise
				if (answer) {
					setSummarizeSegments([{ start: 0, stop: newSegments?.[newSegments?.length - 1].stop ?? 0, text: answer }])
					// Auto-copy summary to clipboard if enabled
					if (preferenceRef.current.autoPasteOnFinish) {
						await copySummaryToClipboard(answer)
					}
					hasSummary = true
				}
			} catch (e) {
				console.error(e)
			}
		}
	}


	return {
		transcriptTab,
		setTranscriptTab,
		summarizeSegments,
		setSummarizeSegments,
		devices,
		setDevices,
		inputDevice,
		setInputDevice,
		outputDevice,
		setOutputDevice,
		isRecording,
		setIsRecording,
		startRecord,
		stopRecord,
		preference: preference,
		openPath,
		selectFiles,
		isAborting,
		settingsVisible,
		setSettingsVisible,
		loading,
		progress,
		audio,
		setAudio,
		files,
		setFiles,
		availableUpdate,
		recordingDuration,
		summaryTemplates,
		updateApp,
		segments,
		setSegments,
		transcribe,
		onAbort,
	}
}
