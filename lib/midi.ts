import { Midi } from '@tonejs/midi'
import { Note, Pattern, PatternType } from '@/types'

// GM 드럼 키 매핑 범위. 노트가 대부분 여기 들어가면 드럼 패턴으로 본다.
const GM_DRUM_PITCHES = new Set([
  35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 53, 56, 57,
])

/** DB의 type 컬럼이 'drum'을 거부할 때를 대비한 자동 인식.
 *  noteset의 80% 이상이 GM 드럼 영역이면 드럼 패턴으로 간주. */
export function looksLikeDrumPattern(notes: Note[]): boolean {
  if (notes.length === 0) return false
  const drumCount = notes.filter(n => GM_DRUM_PITCHES.has(n.pitch)).length
  return drumCount / notes.length >= 0.8
}

/** UI에 보여줄 실제 type. DB에 'melody'로 저장됐어도 노트가 드럼이면 'drum'. */
export function effectiveType(p: Pick<Pattern, 'type' | 'notes'>): PatternType {
  if (p.type === 'drum') return 'drum'
  if (looksLikeDrumPattern(p.notes)) return 'drum'
  return p.type
}

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

// ─── WAV export ───────────────────────────────────────────────────────────

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bytesPerSample = 2
  const dataLength = buffer.length * numChannels * bytesPerSample
  const fileLength = dataLength + 44
  const ab = new ArrayBuffer(fileLength)
  const view = new DataView(ab)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, fileLength - 8, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)               // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, 16, true)              // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch))
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

export async function renderPatternToWav(pattern: Pattern): Promise<Blob> {
  if (pattern.notes.length === 0) throw new Error('빈 패턴은 WAV로 내보낼 수 없습니다.')
  const Tone = await import('tone')
  const spb = 60 / pattern.bpm
  const maxEnd = Math.max(...pattern.notes.map(n => n.startBeat + n.duration))
  const durationSec = maxEnd * spb + 1  // 잔향 여유

  const buffer = await Tone.Offline(({ transport }) => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.4 },
    }).toDestination()
    transport.bpm.value = pattern.bpm
    pattern.notes.forEach(note => {
      const freq = Tone.Frequency(note.pitch, 'midi').toFrequency()
      transport.schedule(time => {
        synth.triggerAttackRelease(freq, note.duration * spb * 0.92, time, note.velocity / 127)
      }, note.startBeat * spb)
    })
    transport.start()
  }, durationSec)

  return audioBufferToWav(buffer as unknown as AudioBuffer)
}

export async function downloadWav(pattern: Pattern) {
  const blob = await renderPatternToWav(pattern)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(pattern.name)}.wav`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── MIDI import ──────────────────────────────────────────────────────────

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
