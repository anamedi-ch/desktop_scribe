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
import { defaultSummarySchema, executeAnamediTranscription } from '~/lib/anamediApi'
import * as transcript from '~/lib/transcript'
import { useConfirmExit } from '~/lib/useConfirmExit'
import { NamedPath, ls, openPath, pathToNamedPath, startKeepAwake, stopKeepAwake } from '~/lib/utils'
import { getX86Features } from '~/lib/x86Features'
import { ErrorModalContext } from '~/providers/ErrorModal'
import { useFilesContext } from '~/providers/FilesProvider'
import { ModelOptions, usePreferenceProvider } from '~/providers/Preference'
import { useToastProvider } from '~/providers/Toast'
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
	const abortRef = useRef<boolean>(false)
	const [isAborting, setIsAborting] = useState(false)
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [summarizeSegments, setSummarizeSegments] = useState<transcript.Segment[] | null>(null)
	const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
	const [progress, setProgress] = useState<number | null>(0)
	const { t } = useTranslation()
	const toast = useToastProvider()
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
		await listen('record_started', () => {
			setIsRecording(true)
		})
	}

	async function handleRecordStop() {
		await listen('record_stopped', () => {
			setIsRecording(false)
		})
	}

	async function handleRecordFinish() {
		await listen<{ path: string; name: string }>('record_finish', (event) => {
			const { name, path } = event.payload
			preference.setHomeTabIndex(1)
			setFiles([{ name, path }])
			setIsRecording(false)
			transcribe(path)
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
				`Your GPU is unsupported in this version of Anamedi. Please download vibe_2.4.0_x64-setup.exe. Click OK to open the download page.`,
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
		emit('stop_record')
	}

	async function copyAndPasteSummary(summaryText: string): Promise<void> {
		try {
			await clipboard.writeText(summaryText)
			await new Promise((resolve) => setTimeout(resolve, 50))
			await invoke('simulate_paste')
		} catch (error) {
			console.error('Failed to copy and paste summary:', error)
		}
	}

	async function transcribe(path: string) {
		startKeepAwake()

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

			// For now use Anamedi cloud API by default instead of local model.
			const anamediResponse = await executeAnamediTranscription({
				audioPath: path,
				schema: defaultSummarySchema,
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

			// Try to extract a summary from structuredData if present
			const structured = anamediResponse.structuredData as unknown
			if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
				console.info('[Anamedi] structuredData', structured)

				let summaryText: string | null = null

				// Helper function to format JSON nicely
				function formatStructuredData(obj: unknown): string {
					if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
						return String(obj)
					}

					const entries = Object.entries(obj)
					if (entries.length === 0) {
						return ''
					}

					const parts: string[] = []
					for (const [key, value] of entries) {
						const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
						if (value === null || value === undefined) {
							continue
						}
						if (typeof value === 'string' && value.trim().length > 0) {
							parts.push(`${formattedKey}:\n${value.trim()}`)
						} else if (Array.isArray(value) && value.length > 0) {
							const arrayItems = value
								.filter((item) => item !== null && item !== undefined)
								.map((item) => (typeof item === 'string' ? item.trim() : String(item)))
								.filter((item) => item.length > 0)
							if (arrayItems.length > 0) {
								parts.push(`${formattedKey}:\n${arrayItems.map((item) => `• ${item}`).join('\n')}`)
							}
						} else if (typeof value === 'object' && value !== null) {
							const nested = formatStructuredData(value)
							if (nested.trim().length > 0) {
								parts.push(`${formattedKey}:\n${nested.split('\n').map((line) => `  ${line}`).join('\n')}`)
							}
						} else if (typeof value === 'number' || typeof value === 'boolean') {
							parts.push(`${formattedKey}: ${String(value)}`)
						}
					}
					return parts.join('\n\n')
				}

				// 1) If the endpoint returned a direct `summary` field, use it.
				const directSummary = (structured as { summary?: unknown }).summary
				if (typeof directSummary === 'string' && directSummary.trim().length > 0) {
					summaryText = directSummary
				} else {
					// 2) Try to detect a SOAP-style structure and format it nicely.
					const maybeSoap = structured as {
						subjective?: unknown
						objective?: unknown
						assessment?: unknown
						plan?: unknown
					}

					const subjective = typeof maybeSoap.subjective === 'string' ? maybeSoap.subjective.trim() : ''
					const objective = typeof maybeSoap.objective === 'string' ? maybeSoap.objective.trim() : ''
					const assessment = typeof maybeSoap.assessment === 'string' ? maybeSoap.assessment.trim() : ''
					const plan = typeof maybeSoap.plan === 'string' ? maybeSoap.plan.trim() : ''

					const hasSoapContent = subjective || objective || assessment || plan
					if (hasSoapContent) {
						const parts: string[] = []
						if (subjective) {
							parts.push(`Subjective:\n${subjective}`)
						}
						if (objective) {
							parts.push(`Objective:\n${objective}`)
						}
						if (assessment) {
							parts.push(`Assessment:\n${assessment}`)
						}
						if (plan) {
							parts.push(`Plan:\n${plan}`)
						}
						summaryText = parts.join('\n\n')
					} else {
						// 3) Fallback: format the entire structured data nicely.
						summaryText = formatStructuredData(structured)
					}
				}

				if (summaryText && summaryText.trim().length > 0) {
					const lastStop = newSegments.length ? newSegments[newSegments.length - 1].stop : 0
					setSummarizeSegments([
						{
							start: 0,
							stop: lastStop,
							text: summaryText,
						},
					])
					await copyAndPasteSummary(summaryText)
					hasSummary = true
				}
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
					await copyAndPasteSummary(answer)
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
		updateApp,
		segments,
		setSegments,
		transcribe,
		onAbort,
	}
}
