import { Note, PatternType } from '@/types'
import { parseChord, chordToNotes } from './chord'

export interface SamplePattern {
  name: string
  type: PatternType
  tags: string[]
  notes: Note[]
  bpm: number
  measures: number
}

function chordProgression(symbols: string[], beatsPerChord: number, octave = 4): Note[] {
  const out: Note[] = []
  let beat = 0
  symbols.forEach(sym => {
    const parsed = parseChord(sym)
    if (parsed) out.push(...chordToNotes(parsed, beat, beatsPerChord, octave))
    beat += beatsPerChord
  })
  return out
}

function melody(pitches: number[], startBeat = 0, durationPerNote = 0.5, velocity = 100): Note[] {
  return pitches.map((p, i) => ({
    pitch: p,
    startBeat: startBeat + i * durationPerNote,
    duration: durationPerNote,
    velocity,
  }))
}

function drumHits(p: {
  kick?: number[]
  snare?: number[]
  hihat?: number[]
  openhat?: number[]
  crash?: number[]
}): Note[] {
  const out: Note[] = []
  p.kick?.forEach(b => out.push({ pitch: 36, startBeat: b, duration: 0.25, velocity: 110 }))
  p.snare?.forEach(b => out.push({ pitch: 38, startBeat: b, duration: 0.25, velocity: 100 }))
  p.hihat?.forEach(b => out.push({ pitch: 42, startBeat: b, duration: 0.25, velocity: 70 }))
  p.openhat?.forEach(b => out.push({ pitch: 46, startBeat: b, duration: 0.25, velocity: 80 }))
  p.crash?.forEach(b => out.push({ pitch: 49, startBeat: b, duration: 0.5, velocity: 110 }))
  return out
}

export function buildSamplePatterns(): SamplePattern[] {
  return [
    // ─── 코드 진행 (chord) ─────────────────────────────────────
    {
      name: 'Pop 진행 I-V-vi-IV (C-G-Am-F)',
      type: 'chord', tags: ['밝음', '코러스'], bpm: 100, measures: 4,
      notes: chordProgression(['C', 'G', 'Am', 'F'], 4),
    },
    {
      name: '50s/Doo-wop (C-Am-F-G)',
      type: 'chord', tags: ['평화로움', '버스'], bpm: 96, measures: 4,
      notes: chordProgression(['C', 'Am', 'F', 'G'], 4),
    },
    {
      name: '한국 발라드 (Am-F-C-G)',
      type: 'chord', tags: ['슬픔', '버스'], bpm: 72, measures: 4,
      notes: chordProgression(['Am', 'F', 'C', 'G'], 4),
    },
    {
      name: 'Jazz ii-V-I (Dm7-G7-Cmaj7)',
      type: 'chord', tags: ['평화로움'], bpm: 110, measures: 4,
      notes: chordProgression(['Dm7', 'G7', 'Cmaj7', 'Cmaj7'], 4),
    },
    {
      name: 'Pachelbel Canon 8마디 (C)',
      type: 'chord', tags: ['평화로움', '드라마틱'], bpm: 80, measures: 8,
      notes: chordProgression(['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'], 4),
    },

    // ─── 멜로디 (melody) ──────────────────────────────────────
    {
      name: 'C major 스케일 상행',
      type: 'melody', tags: [], bpm: 100, measures: 2,
      notes: melody([60, 62, 64, 65, 67, 69, 71, 72], 0, 0.5),
    },
    {
      name: '반짝반짝 작은별 (시작)',
      type: 'melody', tags: ['밝음'], bpm: 96, measures: 2,
      notes: [
        ...melody([60, 60, 67, 67, 69, 69], 0, 0.5),
        ...melody([67], 3, 1),
        ...melody([65, 65, 64, 64, 62, 62], 4, 0.5),
        ...melody([60], 7, 1),
      ],
    },
    {
      name: 'Am 펜타토닉 릭 (몽환적)',
      type: 'melody', tags: ['몽환적'], bpm: 92, measures: 2,
      notes: melody([57, 60, 62, 64, 67, 69, 67, 64], 0, 0.5),
    },

    // ─── 드럼 (drum) ──────────────────────────────────────────
    {
      name: '4-on-the-floor (하우스/EDM 기본)',
      type: 'drum', tags: ['신남', '드롭'], bpm: 124, measures: 1,
      notes: drumHits({
        kick:  [0, 1, 2, 3],
        snare: [1, 3],
        hihat: [0.5, 1.5, 2.5, 3.5],
      }),
    },
    {
      name: '백비트 록/팝 8비트',
      type: 'drum', tags: ['신남'], bpm: 120, measures: 1,
      notes: drumHits({
        kick:  [0, 2],
        snare: [1, 3],
        hihat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      }),
    },
    {
      name: 'K-pop 8비트 (살짝 변형)',
      type: 'drum', tags: ['코러스', '신남'], bpm: 108, measures: 1,
      notes: drumHits({
        kick:  [0, 1.5, 2],
        snare: [1, 3],
        hihat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      }),
    },
    {
      name: '하우스 16비트 하이햇',
      type: 'drum', tags: ['신남', '드롭'], bpm: 128, measures: 1,
      notes: drumHits({
        kick:  [0, 1, 2, 3],
        snare: [1, 3],
        hihat: Array.from({ length: 16 }, (_, i) => i * 0.25),
      }),
    },
  ]
}
