import { Midi } from '@tonejs/midi'
import { Note, Pattern, PatternType } from '@/types'

export function exportPatternToMidi(pattern: Pattern): Blob {
  const midi = new Midi()
  midi.header.tempos = [{ ticks: 0, bpm: pattern.bpm }]
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }]

  const track = midi.addTrack()
  track.name = pattern.name

  const ticksPerBeat = midi.header.ppq  // usually 96 or 480

  pattern.notes.forEach((note: Note) => {
    track.addNote({
      midi: note.pitch,
      ticks: Math.round(note.startBeat * ticksPerBeat),
      durationTicks: Math.round(note.duration * ticksPerBeat),
      velocity: note.velocity / 127,
    })
  })

  const bytes = midi.toArray()
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' })
}

function safeFilename(name: string): string {
  // OS 금지 문자(/ \ : * ? " < > |)와 제어문자 제거, 공백은 _로
  const cleaned = name
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .trim()
  return cleaned || 'pattern'
}

export function downloadMidi(pattern: Pattern) {
  const blob = exportPatternToMidi(pattern)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(pattern.name)}.mid`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ImportedPattern {
  name: string
  type: PatternType
  notes: Note[]
  bpm: number
  measures: number
  tags: string[]
}

// PianoRoll의 가시 범위와 동기 (C2..C7)
const VIS_MIN = 36
const VIS_MAX = 96

function inferIsChord(notes: Note[]): boolean {
  if (notes.length < 3) return false
  // 같은 시작 박(16분 단위로 양자화)에 3개 이상 동시 발음이면 코드
  const byBeat = new Map<number, number>()
  notes.forEach(n => {
    const key = Math.round(n.startBeat * 4)
    byBeat.set(key, (byBeat.get(key) ?? 0) + 1)
  })
  return Math.max(...byBeat.values()) >= 3
}

export async function importMidiFile(file: File): Promise<ImportedPattern> {
  const buffer = await file.arrayBuffer()
  const midi = new Midi(buffer)
  const ppq = midi.header.ppq || 480
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120)

  let allNotes: Note[] = midi.tracks.flatMap(track =>
    track.notes.map(n => ({
      pitch: n.midi,
      startBeat: n.ticks / ppq,
      duration: Math.max(0.0625, n.durationTicks / ppq),
      velocity: Math.max(1, Math.min(127, Math.round(n.velocity * 127))),
    }))
  )

  // 음역 맞추기: 옥타브 단위로 이동시켜 보이는 범위 안에 두기
  if (allNotes.length > 0) {
    const minP = Math.min(...allNotes.map(n => n.pitch))
    const maxP = Math.max(...allNotes.map(n => n.pitch))
    let shift = 0
    while (minP + shift < VIS_MIN && shift < 84) shift += 12
    while (maxP + shift > VIS_MAX && shift > -84) shift -= 12
    if (shift !== 0) {
      allNotes = allNotes.map(n => ({ ...n, pitch: Math.max(VIS_MIN, Math.min(VIS_MAX, n.pitch + shift)) }))
    } else {
      allNotes = allNotes.map(n => ({ ...n, pitch: Math.max(VIS_MIN, Math.min(VIS_MAX, n.pitch)) }))
    }
  }

  // 시작 박이 0보다 크면 0으로 당기기 (앞 공백 제거)
  if (allNotes.length > 0) {
    const minStart = Math.min(...allNotes.map(n => n.startBeat))
    if (minStart > 0) {
      allNotes = allNotes.map(n => ({ ...n, startBeat: n.startBeat - minStart }))
    }
  }

  const maxEnd = allNotes.length > 0 ? Math.max(...allNotes.map(n => n.startBeat + n.duration)) : 0
  const rawMeasures = Math.max(1, Math.ceil(maxEnd / 4))
  const measures = [1, 2, 4, 8].find(m => m >= rawMeasures) ?? 8

  const name = file.name.replace(/\.midi?$/i, '').trim() || '임포트된 패턴'

  return {
    name,
    type: inferIsChord(allNotes) ? 'chord' : 'melody',
    notes: allNotes,
    bpm,
    measures,
    tags: [],
  }
}
