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

export type AnamediTranscriptionRequest<_TStructured extends AnamediJsonValue = AnamediJsonValue> = {
	audioPath: string
	schema: AnamediJsonSchema
	instructions?: string
	contactEmail?: string
	apiKey?: string
	baseUrl?: string
}

export type DefaultSummaryStructure = {
	title: string
	summary: string
}

export const defaultSummarySchema: AnamediJsonSchema = {
	type: 'object',
	properties: {
		title: { type: 'string', default: '' },
		summary: { type: 'string', default: '' },
	},
	required: ['title', 'summary'],
}

export const defaultSoapInstructions = `Das Folgende ist eine wörtliche Abschrift eines ärztlichen Gesprächs in der hausärztlichen Versorgung. Erstellen Sie daraus ein parsebares JSON-Objekt mit folgendem Format:

{
  "title": "Name des Patienten - Grund des Besuchs",
  "summary": "Subjektiv:\\n• ...\\n\\nObjektiv:\\n• ...\\n\\nUntersuchung:\\n• ...\\n\\nBeurteilung:\\n• ...\\n\\nProcedere:\\n• ...",
}

### WICHTIGE STILREGELN:

1. **Fachsprache & Ausdruck**
   – Verwenden Sie medizinische Terminologie, wo immer möglich (z. B. "Dyspnoe" statt "Atemnot", "Hypertonus" statt "Bluthochdruck").
   – Verwenden Sie typische ärztliche Floskeln wie "es imponiert...", "klinisch unauffällig", "anamnestisch", "im Rahmen der Differenzialdiagnose" etc.
   – Verwenden Sie Passivkonstruktionen und Nominalstil (z. B. "es erfolgte die Durchführung einer..." statt "wir haben ... gemacht").
   – Der Text soll den Ton eines überakademisierten, hyperpräzisen Klinikers haben, der jeden Befund dokumentiert.

2. **Struktur im summary-Feld**
   – Verwenden Sie exakt diese fünf Abschnitte: **Subjektiv**, **Objektiv**, **Untersuchung**, **Beurteilung**, **Procedere**.
   – Jeder Abschnitt beginnt mit seiner Überschrift (ohne Doppelpunkt), gefolgt von Aufzählungspunkten ("• ").
   – Zwischen Abschnitten stehen jeweils zwei Zeilenumbrüche ("\\n\\n")

3. **Inhaltlicher Fokus**
   – NUR Befunde und Informationen verwenden, die EXPLIZIT im Transkript erwähnt werden.
   – KEINE Informationen erfinden oder hinzufügen, die nicht im Gespräch vorkommen.
   – Negative Befunde nur erwähnen, wenn sie TATSÄCHLICH im Gespräch dokumentiert wurden.
   – Verwenden Sie exakte Einheiten und Normbereichsangaben nur, wenn diese im Transkript verfügbar sind.

4. **KRITISCHE DATENTREUE-REGELN**
   – ABSOLUT KEINE Halluzinationen oder erfundene Informationen.
   – Verwenden Sie AUSSCHLIESSLICH Informationen aus dem bereitgestellten Transkript.
   – Erfinden Sie KEINE medizinischen Befunde, Symptome oder Untersuchungsergebnisse.
   – Wenn für einen Abschnitt keine Informationen im Transkript vorhanden sind, schreiben Sie: "• Keine spezifischen Informationen dokumentiert"
   – Wiederholungen sind zulässig, wenn sie dem medizinischen Dokumentationsstil dienen, aber ALLE Inhalte müssen aus dem Transkript stammen.

5. **title**
   – Verwenden Sie das Format: "Nachname des Patienten – Leitsymptomatik oder Konsultationsanlass"
   – Verwenden Sie NUR die im Transkript erwähnten Informationen für Titel und Konsultationsgrund.

---
KERNPRINZIP: Verwenden Sie AUSSCHLIESSLICH Informationen aus dem bereitgestellten Transkript. Erfinden Sie NICHTS hinzu, auch nicht aus medizinischem "Allgemeinwissen" oder typischen Untersuchungsroutinen.`

export interface ExecuteAnamediTranscriptionOptions<TStructured extends AnamediJsonValue = AnamediJsonValue>
	extends AnamediTranscriptionRequest<TStructured> {}

export async function executeAnamediTranscription<
	TStructured extends AnamediJsonValue = AnamediJsonValue,
>(options: ExecuteAnamediTranscriptionOptions<TStructured>): Promise<AnamediTranscriptionResponse<TStructured>> {
	const { audioPath, schema, instructions, contactEmail, apiKey, baseUrl } = options
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

		const headers: Record<string, string> = {}
		if (apiKey) {
			headers['x-api-key'] = apiKey
		}
		const response = await fetch(url, {
			method: 'POST',
			body: formData,
			headers,
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
