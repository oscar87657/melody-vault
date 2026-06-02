import { Midi } from '@tonejs/midi'
import { Note, Pattern } from '@/types'

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
