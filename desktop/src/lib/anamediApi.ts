import { fetch } from '@tauri-apps/plugin-http'
import { readFile } from '@tauri-apps/plugin-fs'

export type AnamediSpeakerSegment = {
	speaker: string
	text: string
	timestamp: [number, number]
}

export type AnamediJsonPrimitive = string | number | boolean | null

export type AnamediJsonValue =
	| AnamediJsonPrimitive
	| AnamediJsonValue[]
	| { [key: string]: AnamediJsonValue }

export type AnamediJsonSchemaType = 'string' | 'number' | 'boolean' | 'array' | 'object'

export type AnamediJsonSchema = {
	readonly type?: AnamediJsonSchemaType
	readonly enum?: readonly AnamediJsonValue[]
	readonly format?: string
	readonly items?: AnamediJsonSchema
	readonly properties?: Record<string, AnamediJsonSchema>
	readonly required?: readonly string[]
	readonly default?: AnamediJsonValue
}

export type AnamediTranscriptionResponse<TStructured extends AnamediJsonValue = AnamediJsonValue> = {
	transcript: string
	diarized: AnamediSpeakerSegment[]
	structuredData: TStructured
}

export type AnamediTranscriptionRequest<TStructured extends AnamediJsonValue = AnamediJsonValue> = {
	audioPath: string
	schema: AnamediJsonSchema
	instructions?: string
	contactEmail?: string
	baseUrl?: string
}

export type DefaultSummaryStructure = {
	summary: string
	keyFindings: string[]
}

export const defaultSummarySchema: AnamediJsonSchema = {
	type: 'object',
	properties: {
		summary: { type: 'string', default: '' },
		keyFindings: {
			type: 'array',
			items: { type: 'string' },
			default: [],
		},
	},
	required: ['summary'],
}

export interface ExecuteAnamediTranscriptionOptions<TStructured extends AnamediJsonValue = AnamediJsonValue>
	extends AnamediTranscriptionRequest<TStructured> {}

export async function executeAnamediTranscription<
	TStructured extends AnamediJsonValue = AnamediJsonValue,
>(options: ExecuteAnamediTranscriptionOptions<TStructured>): Promise<AnamediTranscriptionResponse<TStructured>> {
	const { audioPath, schema, instructions, contactEmail, baseUrl } = options
	const url: string = `${baseUrl ?? 'https://app.anamedi.com'}/api/transcribe-custom-structure`

	try {
		const audioBytes = await readFile(audioPath)

		const formData = new FormData()
		formData.append('file', new Blob([audioBytes]), 'audio.wav')
		formData.append('schema', JSON.stringify(schema))
		if (instructions) {
			formData.append('instructions', instructions)
		}
		if (contactEmail) {
			formData.append('contactEmail', contactEmail)
		}

		console.info('[Anamedi] Sending request', {
			url,
			audioPath,
			audioSize: audioBytes.length,
			hasInstructions: Boolean(instructions),
			hasContactEmail: Boolean(contactEmail),
			schema,
		})

		const response = await fetch(url, {
			method: 'POST',
			body: formData,
		})

		const status = response.status
		const statusText = response.statusText

		if (!response.ok) {
			const errorText = await response.text()
			console.error('[Anamedi] Request failed', {
				url,
				status,
				statusText,
				bodyPreview: errorText.slice(0, 2000),
			})
			throw new Error(`Anamedi API error ${status}: ${statusText}`)
		}

		const json = (await response.json()) as AnamediTranscriptionResponse<TStructured>
		console.info('[Anamedi] Received response', {
			status,
			statusText,
			hasTranscript: Boolean(json.transcript && json.transcript.length > 0),
			diarizedCount: Array.isArray(json.diarized) ? json.diarized.length : 0,
			hasStructuredData: typeof json.structuredData === 'object' && json.structuredData !== null,
		})

		return json
	} catch (error) {
		console.error('[Anamedi] Unexpected error', {
			url,
			audioPath,
			error,
		})
		throw error
	}
}
