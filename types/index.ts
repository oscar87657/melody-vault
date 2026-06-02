export type PatternType = 'chord' | 'melody'

export interface Note {
  pitch: number       // MIDI note number (0-127)
  startBeat: number   // beat position (0-based, 0.25 = 16th note)
  duration: number    // duration in beats
  velocity: number    // 0-127
}

export interface Pattern {
  id: string
  user_id: string
  name: string
  type: PatternType
  tags: string[]
  notes: Note[]
  bpm: number
  measures: number    // number of measures
  share_token?: string | null
  created_at: string
  updated_at: string
}

export const MOOD_TAGS = ['밝음', '어두움', '슬픔', '신남', '몽환적', '긴장감', '평화로움', '드라마틱']
export const USE_TAGS = ['인트로', '버스', '프리코러스', '코러스', '브릿지', '아웃트로', '드롭', '빌드업']

export interface ChordDefinition {
  name: string
  intervals: number[]  // semitones from root
}

export const CHORD_TYPES: ChordDefinition[] = [
  { name: 'Major',    intervals: [0, 4, 7] },
  { name: 'Minor',    intervals: [0, 3, 7] },
  { name: 'Dom7',     intervals: [0, 4, 7, 10] },
  { name: 'Maj7',     intervals: [0, 4, 7, 11] },
  { name: 'Min7',     intervals: [0, 3, 7, 10] },
  { name: 'Dim',      intervals: [0, 3, 6] },
  { name: 'Aug',      intervals: [0, 4, 8] },
  { name: 'Sus2',     intervals: [0, 2, 7] },
  { name: 'Sus4',     intervals: [0, 5, 7] },
]

export const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface ScaleDef {
  name: string
  intervals: number[]  // semitones from root, within an octave
}

export const SCALES: ScaleDef[] = [
  { name: 'Major',          intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Natural Minor',  intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'Dorian',         intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Mixolydian',     intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Pentatonic',     intervals: [0, 2, 4, 7, 9] },
  { name: 'Minor Pent.',    intervals: [0, 3, 5, 7, 10] },
  { name: 'Blues',          intervals: [0, 3, 5, 6, 7, 10] },
]
