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

export type SummaryTemplate = {
	id: string
	name: string
	schema: AnamediJsonSchema
	instructions: string
}

export const summaryTemplates: SummaryTemplate[] = [
	{
		id: 'SOAP',
		name: 'SOAP Standard (Deutsch)',
		schema: defaultSummarySchema,
		instructions: defaultSoapInstructions,
	},
	{
		id: 'BRIEF',
		name: 'Brief (Sprachnachricht)',
		schema: defaultSummarySchema,
		instructions: `Das Folgende ist eine Abschrift einer Sprachnachricht eines Hausarztes.
Erstellen Sie daraus ein JSON-Objekt mit folgendem Format:

{
  "title": "Name des Patienten - Grund des Besuchs",
  "summary": "Anamnese:\n• ...\n\nBefund:\n• ...\n\nTherapie:\n• ...",
  "actionItems": [
    "Aufgabe 1 für den Arzt",
    "Aufgabe 2 für den Arzt"
  ]
}

**Wichtige Regeln:**
– Verwenden Sie die Abschnitte: Anamnese, Befund, Therapie
– Jeder Abschnitt beginnt mit dem Titel auf einer eigenen Zeile und enthält Aufzählungspunkte (•)
– Alle Informationen müssen aus dem Transkript stammen – nichts erfinden
– Wenn keine Informationen vorliegen, schreiben Sie: • Keine Information verfügbar
– Die Ausgabe muss echtes JSON sein – nicht als Textblock oder Markdown-Format`,
	},
	{
		id: 'LEGACY',
		name: 'Legacy Format (Ausführlich)',
		schema: defaultSummarySchema,
		instructions: `Das Folgende ist eine Abschrift einer Sprachnachricht eines Hausarztes. Erstellen Sie aus diesen Informationen in Deutsch ein JSON-Objekt mit genau diesem Format:

{
  "title": "Name des Patienten - Grund des Besuchs",
  "summary": "Anamnese: [Beschreibung der Situation des Patienten und der Verletzungen/Beschwerden]\n\nAktuelle Beschwerden: [Beschreibung der Beschwerden im Detail]\n\nMedizinische Vorgeschichte: [Vorerkrankungen, Operationen, Medikation, Allergien]\n\nSozialanamnese: [Beruf, Familienanamnese, Lebensstil, Reisen]\n\nBefund: [Beschreibung der Untersuchungsergebnisse]\n\nTherapie und weiteres Vorgehen: [Vorgeschlagene Behandlung, diagnostische Schritte]\n\nEmpfehlung: [Empfohlene Maßnahmen wie Schonung oder zukünftige Vorsichtsmaßnahmen, nur wenn erwähnt]",
  "actionItems": [
    "Aufgabe 1 für den Arzt",
    "Aufgabe 2 für den Arzt",
    "Aufgabe 3 für den Arzt"
  ]
}

Sollten in dem Transkript nicht alle Informationen enthalten sein, ersetzen Sie die fehlenden Informationen durch "Keine Information verfügbar". Es ist WICHTIG, dass alle Felder ausgefüllt sind und das Format exakt eingehalten wird, aber es darf nur das was im Transkript enthalten ist eingefügt werden, nicht mehr und nicht weniger!!!`,
	},
	{
		id: 'PSYCHOLOGY',
		name: 'Psychologie/Therapie (Narrativ)',
		schema: defaultSummarySchema,
		instructions: `Das Folgende ist eine Abschrift einer Sprachnachricht eines Psychologen oder Psychotherapeuten. Erstellen Sie daraus ein JSON-Objekt mit folgendem Format:

{
  "title": "Name des Patienten - Grund der Konsultation",
  "summary": "Psychopathologischer Befund:\\n[Ein detaillierter, narrativer Bericht über den psychischen Zustand des Patienten, einschließlich Bewusstsein, Orientierung, Denkprozesse, Affekt, Antrieb und eventuelle psychotische Symptome. Nur tatsächlich beobachtete oder berichtete Symptome verwenden.]\\n\\nGrund der Therapie:\\n[Eine ausführliche Beschreibung der aktuellen Beschwerden und Auslöser, die den Patienten zur Therapie geführt haben. Nur konkret genannte Informationen verwenden.]\\n\\nPsychiatrische Anamnese:\\n[Eine narrative Darstellung der psychiatrischen Vorgeschichte, einschließlich früherer Behandlungen, Medikation und Verlauf. Nur tatsächlich erwähnte Informationen verwenden.]\\n\\nMedizinische Anamnese:\\n[Eine Beschreibung der körperlichen Gesundheit und eventueller relevanter körperlicher Beschwerden. Nur tatsächlich erwähnte Informationen verwenden.]\\n\\nArbeit:\\n[Eine detaillierte Beschreibung der beruflichen Situation, einschließlich Arbeitsbedingungen, Belastungen und Auswirkungen auf die psychische Gesundheit. Nur tatsächlich erwähnte Informationen verwenden.]\\n\\nBeziehungen und Partnerschaften:\\n[Eine ausführliche Beschreibung der Beziehungssituation, einschließlich Partnerschaft, Familie und sozialem Umfeld. Nur tatsächlich erwähnte Informationen verwenden.]\\n\\nZiele und Erwartungen:\\n[Eine Beschreibung der Therapieziele und Erwartungen des Patienten. Nur konkret genannte Ziele verwenden.]\\n\\nBehandlungsplan:\\n[Ein detaillierter Plan der geplanten therapeutischen Interventionen, einschließlich Methoden, Frequenz und eventueller medikamentöser Behandlung. Nur konkret vereinbarte Maßnahmen verwenden.]",
  "actionItems": [
    "Aufgabe 1 für den Therapeuten",
    "Aufgabe 2 für den Therapeuten",
    "Aufgabe 3 für den Therapeuten"
  ]
}

### WICHTIGE REGELN:

1. **NARRATIVER STIL**
   - Verwenden Sie einen fließenden, narrativen Schreibstil
   - Vermeiden Sie Aufzählungspunkte
   - Schreiben Sie in vollständigen Sätzen
   - Verwenden Sie eine klare, professionelle Sprache

2. **STRUKTUR DER ABSCHNITTE**
   - Jeder Abschnitt beginnt mit seiner Überschrift
   - Zwischen den Abschnitten eine Leerzeile einfügen
   - Abschnitte ohne Informationen WEGLASSEN
   - Die Abschnitte sollen inhaltlich zusammenhängend sein

3. **INHALTLICHE REGELN**
   - Psychopathologischer Befund: Systematische Beschreibung des psychischen Zustands
   - Grund der Therapie: Konkrete Beschwerden und Auslöser
   - Anamnesen: Relevante Vorgeschichte in narrativer Form
   - Behandlungsplan: Konkrete therapeutische Maßnahmen

4. **NUR TATSÄCHLICHE INFORMATIONEN**
   - Verwenden Sie NUR Informationen aus dem Transkript
   - Erfinden Sie KEINE Informationen
   - Lassen Sie Abschnitte WEG, wenn keine Informationen vorhanden sind
   - Verwenden Sie KEINE Platzhalter wie "Keine Information verfügbar"

5. **JSON-STRUKTUR**
   - Die Antwort muss ein gültiges JSON-Objekt sein
   - Alle Strings müssen korrekt escaped sein
   - Die Struktur muss exakt eingehalten werden

6. **KRITISCHE REGELN**
   - Verwenden Sie KEINE Beispiele oder Platzhalter aus dieser Anweisung
   - Erstellen Sie einzigartige Inhalte basierend auf dem Transkript
   - Jeder Satz sollte nur einmal vorkommen
   - Vermeiden Sie Wiederholungen von Sätzen oder Phrasen`,
	},
	{
		id: 'SOAP_SPECIAL',
		name: 'SOAP Erweitert (Lifestyle-Fokus)',
		schema: defaultSummarySchema,
		instructions: `Das Folgende ist eine wörtliche Abschrift eines ärztlichen Gesprächs in der hausärztlichen Versorgung. Erstellen Sie daraus ein parsebares JSON-Objekt mit folgendem Format:

{
  "title": "Name des Patienten - Grund des Besuchs",
  "summary": "Subjektiv:\n• ...\n\nObjektiv:\n• ...\n\nUntersuchung:\n• ...\n\nBeurteilung:\n• ...\n\nProcedere:\n• ...",
  "actionItems": [
    "Aufgabe 1 für den Arzt",
    "Aufgabe 2 für den Arzt"
  ]
}

### WICHTIGE STILREGELN:

1. **Fachsprache & Ausdruck**
   – Verwenden Sie medizinische Terminologie, z. B. "Dyspnoe" statt "Atemnot", "Hypertonus" statt "Bluthochdruck".
   – Verwenden Sie ärztlichen Nominalstil und typische Floskeln wie "es imponiert...", "anamnestisch", "klinisch unauffällig".
   – Der Text soll den Stil eines überpräzisen medizinischen Dokuments widerspiegeln.

2. **Struktur im summary-Feld**
   – Verwenden Sie exakt diese fünf Abschnitte: Subjektiv, Objektiv, Untersuchung, Beurteilung, Procedere.
   – Jeder Abschnitt beginnt mit seiner Überschrift (ohne Doppelpunkt), gefolgt von Aufzählungspunkten ("• ").
   – Zwischen Abschnitten stehen zwei Zeilenumbrüche.

3. **Inhaltlicher Fokus – Zu erfassende Themen (wenn im Gespräch erwähnt):**
   – **Ernährung** (z. B. vegetarisch, Essgewohnheiten): → Beurteilung
   – **Alkoholkonsum** (z. B. Menge, Frequenz): → Beurteilung
   – **Medikation/Supplements** (auch bei gelegentlicher Einnahme): → Beurteilung
   – **Schlafqualität** (z. B. Einschlafprobleme, Schnarchen): → Beurteilung
   – **Aktivität/Sport** (z. B. Joggen, Fitness): → Beurteilung
   – **Persönliche Anamnese** (frühere Krankheiten, OPs): → Beurteilung
   – **Familiäre Anamnese** (z. B. Herzkrankheiten, Krebs): → Beurteilung
   – **Soziale Situation** (z. B. Beruf, familiäre Rolle): → Beurteilung

**WICHTIG:** Wenn ein Satz mehrere Themen berührt, z. B. "Ich esse gesund, kein Fleisch, Alkohol nur am Wochenende", dann splitten und jede Info im passenden Abschnitt dokumentieren.

**BEISPIEL:**  
• Der Patient ernährt sich überwiegend vegetarisch.  
• Der Patient konsumiert am Wochenende gelegentlich Alkohol.

4. **DATENTREUE-REGELN**
   – Verwenden Sie AUSSCHLIESSLICH Informationen aus dem Gespräch.
   – KEINE Halluzinationen oder generalisierte Aussagen ("typisch für das Alter" etc.).
   – Wenn keine Informationen vorliegen, schreiben Sie "• Keine spezifischen Informationen dokumentiert".

5. **actionItems**
   – Nur Aufgaben, die sich direkt aus dem Gespräch ableiten lassen.
   – Fachlich korrekt formuliert, z.B. "Empfehlung zur Reduktion des Teigwarenkonsums".

6. **title**
   – "Nachname – Leitsymptomatik oder Anliegen"
   – Nur aus explizit im Transkript enthaltenen Angaben generieren.

7. **Technische Formatierung**
   – JSON, keine Kommentare, keine Markdown.
   – Alle Strings mit doppelten Anführungszeichen, korrekt escaped.

---
MERKE: Viele Informationen werden beiläufig erwähnt – diese MÜSSEN erkannt und im richtigen Abschnitt strukturiert wiedergegeben werden. Kein Halluzinieren. Keine Auslassungen bei tatsächlich erwähnten Themen.`,
	},
	{
		id: 'SOAP_PROBLEMS',
		name: 'SOAP Problemorientiert (Schweiz)',
		schema: {
			type: 'object',
			properties: {
				title: { type: 'string', default: '' },
				actionItems: {
					type: 'array',
					items: { type: 'string' },
				},
				problems: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							problemId: { type: 'string' },
							title: { type: 'string' },
							standardProblem: { type: 'string' },
							standardProblemCode: { type: 'string' },
							icd10Candidates: {
								type: 'array',
								items: { type: 'string' },
							},
							soap: {
								type: 'object',
								properties: {
									subjective: {
										type: 'array',
										items: { type: 'string' },
									},
									objective: {
										type: 'array',
										items: { type: 'string' },
									},
									assessment: {
										type: 'array',
										items: { type: 'string' },
									},
									plan: {
										type: 'array',
										items: { type: 'string' },
									},
								},
								required: ['subjective', 'objective', 'assessment', 'plan'],
							},
							confidence: { type: 'number' },
						},
					},
				},
				general: {
					type: 'object',
					properties: {
						notes: {
							type: 'array',
							items: { type: 'string' },
						},
					},
				},
				unassigned: {
					type: 'array',
					items: { type: 'string' },
				},
			},
			required: ['title', 'actionItems', 'problems'],
		},
		instructions: `Das Folgende ist eine wörtliche Abschrift eines Arzt-Patienten-Gesprächs in einer Schweizer Hausarztpraxis (Schweizer Hochdeutsch und Dialekt). Strukturieren Sie das Gespräch problemorientiert und geben Sie NUR ein JSON-Objekt im folgenden Format zurück:

{
  "title": "<Nachname> – <Leitsymptomatik oder Anliegen>",
  "actionItems": ["…"],
  "problems": [
    {
      "problemId": "EINER_DER_41_STANDARDISIERTEN_CODES",
      "title": "z. B. Hautfleck am linken Unterarm",
      "standardProblem": "Haut",
      "standardProblemCode": "S27",
      "soap": {
        "subjective": ["…"],
        "objective": ["…"],
        "assessment": ["…"],
        "plan": ["…"]
      },
      "confidence": 0.0
    }
  ],
  "general": { "notes": ["…"] },
  "unassigned": ["…"]
}

STANDARDISIERTE PROBLEMKATEGORIEN (41 Kategorien):
T82=Adipositas, A97=Aktenstudium/Administration, P16=Alkohol, A92=Allergie, K85=arterielle Hypertonie, F99=Augen, D02=Bauchproblem, P03=Depression, T90=Diabetes mellitus, T89=Diabetisches Fussyndrom, B80=Eisenmangel, T93=Fettstoffwechsel, A98=Gesundheit/Prävention, T92=Gicht, X99=Gynäkologie, S27=Haut, K22=Herz, B90=HIV/Infektiologie, H29=HNO Problem, Z08=IV, N01=Kopfschmerzen, D97=Leber, R04=Lunge, A04=Müdigkeit, L99=Muskuloskelettale Beschwerden, N99=Neurologie, U14=Nierenprobleme, A79=Onkologie, L95=Osteoporose, Y06=Prostata, P99=Psychiatrische Probleme, L03=Rückenproblem, T86=Schilddrüse, P06=Schlaf, N17=Schwindel/Benommenheit, Z29=Soziales, K99=Thoraxschmerzen, L81=Unfall, U99=Urinprobleme, A77=viraler Infekt, D19=Zahnprobleme

WICHTIGE REGELN:
1) Erkennen Sie 2–6 klinische Probleme und ordnen Sie JEDES Problem einer der 41 standardisierten Kategorien zu. Verwenden Sie den exakten Code (z.B. "S27") und die exakte Bezeichnung (z.B. "Haut"). Vermischen Sie keine Probleme. Wenn eine Aussage unklar ist, legen Sie sie unter "unassigned" ab.
2) Verwenden Sie schweizerische Fachsprache wo passend (z. B. "Dyspnoe", "Hypertonie", "Hausarzt", "Notfall"). Verstehen Sie Schwiizerdütsch und übertragen Sie es korrekt ins Deutsche (ohne Halluzinationen).
3) SOAP je Problem: kurze, präzise Bulletpoints. Nur Informationen aus dem Transkript. Keine zusätzlichen Annahmen. Negative Befunde nur, wenn explizit genannt.
4) Titel: "Nachname – Leitsymptomatik oder Anliegen" aus dem Gespräch.
5) actionItems: Konkrete, ärztliche To-dos, abgeleitet aus den Plänen der einzelnen Probleme.
6) JSON-only, keine Erklärtexte, keine Markdown.`,
	},
	{
		id: 'SOAP_POLISH',
		name: 'SOAP Standard (Polski)',
		schema: defaultSummarySchema,
		instructions: `Poniżej znajduje się dosłowny zapis rozmowy lekarskiej w opiece podstawowej. Utwórz z tego obiekt JSON w następującym formacie:

{
  "title": "Imię i nazwisko pacjenta - Powód wizyty",
  "summary": "Subiektywne:\n• ...\n\nObiektywne:\n• ...\n\nBadanie:\n• ...\n\nOcena:\n• ...\n\nPlan:\n• ...",
  "actionItems": [
    "Zadanie 1 dla lekarza",
    "Zadanie 2 dla lekarza",
    "Zadanie 3 dla lekarza"
  ]
}

### WAŻNE ZASADY STYLU:

1. **Język medyczny i formuły**
   – Używaj terminologii medycznej, gdzie to możliwe (np. "duszność" zamiast "brak powietrza", "nadciśnienie" zamiast "wysokie ciśnienie").
   – Używaj typowych zwrotów medycznych, takich jak: "pacjent zgłasza...", "klinicznie bez odchyleń", "wywiad", "w zakresie diagnostyki różnicowej" itp.
   – Używaj konstrukcji biernych i stylu nominalnego (np. "przeprowadzono..." zamiast "zrobiliśmy...").
   – Tekst powinien mieć ton nadmiernie akademicki, hiperprecyzyjnego klinicysty dokumentującego każdy objaw.

2. **Struktura w polu summary**
   – Używaj dokładnie tych pięciu sekcji: **Subiektywne**, **Obiektywne**, **Badanie**, **Ocena**, **Plan**.
   – Każda sekcja zaczyna się od nagłówka (bez dwukropka), po którym następują wypunktowania ("• ").
   – Między sekcjami są dwa podziały linii ("\\n\\n").

3. **Skupienie na treści**
   – WYKORZYSTUJ TYLKO objawy i informacje, które SĄ WYRAŹNIE wymienione w transkrypcji.
   – NIE wymyślaj ani NIE dodawaj informacji, których NIE MA w rozmowie.
   – Wspominaj o negatywnych wynikach TYLKO wtedy, gdy zostały TAK NAPRAWDĘ udokumentowane w rozmowie.
   – Używaj dokładnych jednostek i przedziałów norm TYLKO jeśli są dostępne w transkrypcji.

4. **KRYTYCZNE ZASADY WIERNOŚCI DANYCH**
   – ABSOLUTNIE ŻADNE halucynacje ani wymyślone informacje.
   – WYKORZYSTUJ WYŁĄCZNIE informacje z dostarczonej transkrypcji.
   – NIE wymyślaj ŻADNYCH medycznych objawów, symptomów ani wyników badań.
   – Jeśli dla danej sekcji nie ma informacji w transkrypcji, napisz: "• Nie udokumentowano żadnych konkretnych informacji".
   – Powtórzenia są dozwolone, jeśli służą medycznemu stylowi dokumentacji, ale WSZYSTKIE treści muszą pochodzić z transkrypcji.

5. **actionItems**
   – Używaj formalnego medycznego języka dla zadań.
   – Pochodź zadania TYLKO z informacji wyraźnie wymienionych w rozmowie.
   – NIE wymyślaj DODATKOWYCH środków diagnostycznych ani terapeutycznych.

6. **title**
   – Użyj formatu: "Nazwisko Pacjenta – Objaw wiodący lub powód konsultacji"
   – Użyj TYLKO informacji wymienionych w transkrypcji dla tytułu i powodu konsultacji.

7. **Formatowanie techniczne**
   – Wynik MUSI być obiektem JSON, bez komentarzy, Markdowna ani tekstu wyjaśniającego.
   – Używaj prawidłowej składni JSON (podwójne cudzysłowy, escapowane podziały linii itp.).

---
ZASADA KERNOWA: Wykorzystuj WYŁĄCZNIE informacje z dostarczonej transkrypcji. NIE wymyślaj niczego, także z medycznej "wiedzy ogólnej" ani typowych procedur badań.`,
	},
	{
		id: 'SOAP_NEPHROLOGY',
		name: 'SOAP Nephrologie (Systematisch)',
		schema: defaultSummarySchema,
		instructions: `Das Folgende ist eine wörtliche Abschrift eines ärztlichen Gesprächs in der hausärztlichen Versorgung. Erstellen Sie daraus ein parsebares JSON-Objekt mit folgendem Format:

{
  "title": "Name des Patienten - Grund des Besuchs",
  "summary": "Subjektiv:\n• ...\n\nObjektiv:\n• ...\n\nUntersuchung:\n• ...\n\nBeurteilung:\n• ...\n\nProcedere:\n• ...",
  "actionItems": [
    "Aufgabe 1 für den Arzt",
    "Aufgabe 2 für den Arzt"
  ]
}

### WICHTIGE STILREGELN:

1. **Fachsprache & Ausdruck**
   – Verwenden Sie medizinische Terminologie, z.B. "Dyspnoe" statt "Atemnot", "Hypertonus" statt "Bluthochdruck".
   – Verwenden Sie ärztlichen Nominalstil und typische Floskeln wie "es imponiert...", "anamnestisch", "klinisch unauffällig".
   – Der Text soll den Stil eines überpräzisen medizinischen Dokuments widerspiegeln.

2. **Struktur im summary-Feld**
   – Verwenden Sie exakt diese fünf Abschnitte: Subjektiv, Objektiv, Untersuchung, Beurteilung, Procedere.
   – Jeder Abschnitt beginnt mit seiner Überschrift (ohne Doppelpunkt), gefolgt von Aufzählungspunkten ("• ").
   – Zwischen Abschnitten stehen zwei Zeilenumbrüche ("\n\n").

   → Für den Abschnitt **Untersuchung** gilt folgende **top-down Struktur** (falls im Gespräch enthalten):
     • Kopf/Hals: z.B. Pupillen, Karotiden, Jugularvenen  
     • Thorax: Herztöne, Auskultation, Atemgeräusche  
     • Abdomen: Darmgeräusche, Palpation, Leber/Milz  
     • Genital/DRU: z.B. Prostata, äußere Genitalien  
     • Extremitäten: z.B. Ödeme, Pulse, Reflexe  

   – Dokumentieren Sie die Befunde **in dieser Reihenfolge**, um die Untersuchung systematisch von Kopf bis Fuß abzubilden.

   Zusätzlich gilt:
– Die körperliche Untersuchung MUSS nach dem Schema Kopf → Thorax → Abdomen → Genitalbereich → Extremitäten strukturiert sein.
– Bitte dokumentieren Sie Kreislaufsituation und Flüssigkeitsstatus (z.B. Ödeme, Hautturgor) so präzise wie möglich, sofern erwähnt.
– Laborwerte (Kreatinin, GFR, Kalium etc.) nur aufführen, wenn im Gespräch genannt.
– Bei nephrologischen Diagnosen: Verwenden Sie exakte Begriffe wie "nephrotisches Syndrom", "chronische Niereninsuffizienz Stadium 3a", "Proteinurie", etc.

3. **Inhaltlicher Fokus**
   – NUR Befunde und Informationen verwenden, die EXPLIZIT im Transkript erwähnt werden.
   – KEINE Informationen erfinden oder hinzufügen, die nicht im Gespräch vorkommen.
   – Negative Befunde nur erwähnen, wenn sie TATSÄCHLICH im Gespräch dokumentiert wurden.
   – Verwenden Sie exakte Einheiten und Normbereichsangaben nur, wenn diese im Transkript verfügbar sind.

4. **DATENTREUE-REGELN**
   – Verwenden Sie AUSSCHLIESSLICH Informationen aus dem Gespräch.
   – KEINE Halluzinationen oder generalisierte Aussagen ("typisch für das Alter" etc.).
   – Wenn keine Informationen vorliegen, schreiben Sie "• Keine spezifischen Informationen dokumentiert".

5. **actionItems**
   – Nur Aufgaben für den Arzt, die sich direkt aus dem Gespräch ableiten lassen.
   – Fachlich korrekt formuliert, z.B. "Empfehlung zur Reduktion des Teigwarenkonsums".

6. **title**
   – "Nachname – Leitsymptomatik oder Anliegen"
   – Nur aus explizit im Transkript enthaltenen Angaben generieren.

7. **Technische Formatierung**
   – JSON, keine Kommentare, keine Markdown.
   – Alle Strings mit doppelten Anführungszeichen, korrekt escaped.

---
MERKE: Viele Informationen werden beiläufig erwähnt – diese MÜSSEN erkannt und im richtigen Abschnitt strukturiert wiedergegeben werden. Kein Halluzinieren. Keine Auslassungen bei tatsächlich erwähnten Themen.`,
	},
	{
		id: 'CLINICAL',
		name: 'Clinical Format (English)',
		schema: defaultSummarySchema,
		instructions: `The following is a verbatim transcript of a clinical encounter. Create a parseable JSON object with the following format:

{
  "title": "Patient Name - Reason for Visit",
  "summary": "Subjective:\n\n[Current issues, reasons for visit, history of presenting complaints etc (if applicable)]\n\n[Past medical history, previous surgeries (if applicable)]\n\n[Medications (if applicable)]\n\n[Social history (if applicable)]\n\n[Allergies (if applicable)]\n\nReview of Systems:\n\n[Review of systems findings (if applicable)]\n\nObjective:\n\n[Physical or mental state examination findings, including vitals and system specific examination (if applicable)]\n\n[Investigations with results (if applicable)]\n\nAssessment: [Diagnosis - status (stable, critical, improving)]\n\nPlan:\n\n[1. Issue, problem or request 1 (issue, request or condition name only)]\n\n[Investigations planned for Issue 1 (only if applicable)]\n\n[Treatment planned for Issue 1 (only if applicable)]\n\n[Relevant referrals for Issue 1 (only if applicable)]\n\n[2. Issue, problem or request 2 (issue, request or condition name only)]\n\n[Investigations planned for Issue 2 (only if applicable)]\n\n[Treatment planned for Issue 2 (only if applicable)]\n\n[Relevant referrals for Issue 2 (only if applicable)]",
  "actionItems": [
    "Task 1 for the physician",
    "Task 2 for the physician",
    "Task 3 for the physician"
  ]
}

### CRITICAL FORMATTING RULES:

1. **Structure in summary field**
   – Use EXACTLY these sections in this order: **Subjective**, **Review of Systems**, **Objective**, **Assessment**, **Plan**.
   – Each section begins with its heading (without colon), followed by the content.
   – Between sections, use two line breaks ("\\n\\n").
   – Within Subjective, organize information into subsections as shown in the format above.
   – Within Plan, number each issue/problem (1., 2., etc.) and include sub-items for investigations, treatment, and referrals only if applicable.

2. **Subjective Section Structure**
   – Current issues, reasons for visit, history of presenting complaints (if applicable)
   – Past medical history, previous surgeries (if applicable)
   – Medications (if applicable)
   – Social history (if applicable)
   – Allergies (if applicable)
   – If a subsection has no information, omit it entirely (do not write "if applicable" or placeholders).

3. **Review of Systems**
   – Document only if information is available in the transcript.
   – If no information, omit this section entirely.

4. **Objective Section**
   – Physical or mental state examination findings, including vitals and system-specific examination (if applicable)
   – Investigations with results (if applicable)
   – Use bullet points or structured format for clarity.

5. **Assessment**
   – Format: "[Diagnosis - status (stable, critical, improving)]"
   – Include diagnosis and status only if mentioned in the transcript.
   – Use medical terminology where appropriate.

6. **Plan Section**
   – Number each issue/problem (1., 2., etc.)
   – For each issue, include:
     • Issue/problem/request name only
     • Investigations planned (only if applicable)
     • Treatment planned (only if applicable)
     • Relevant referrals (only if applicable)
   – If a sub-item (investigations, treatment, referrals) is not mentioned, omit it entirely.

7. **Data Fidelity Rules**
   – Use ONLY information explicitly mentioned in the transcript.
   – NO hallucinations or invented information.
   – NO assumptions or typical clinical routines.
   – If a section has no information, omit it entirely (do not write placeholders like "if applicable" or "none documented").

8. **Medical Terminology**
   – Use appropriate medical terminology where possible.
   – Maintain professional clinical documentation style.
   – Use clear, concise language.

9. **actionItems**
   – Use formal medical language for tasks.
   – Derive tasks ONLY from explicitly mentioned information in the conversation.
   – Do NOT invent additional diagnostic or therapeutic measures.

10. **title**
    – Format: "Patient Name – Chief Complaint or Reason for Visit"
    – Use ONLY information mentioned in the transcript.

11. **Technical Formatting**
    – Output MUST be a pure JSON object, no comments, Markdown, or explanatory text.
    – Use valid JSON syntax (double quotes, escaped line breaks, etc.).
    – Ensure proper escaping of special characters.

---
CORE PRINCIPLE: Use EXCLUSIVELY information from the provided transcript. Do NOT invent anything, even from medical "general knowledge" or typical examination routines. Omit sections entirely if no information is available.`,
	},
]

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
