import { Note } from '@/types'

// Quality string → intervals from root (within an octave; 9/11/13 cross octaves but kept in semitones)
const QUALITY_MAP: Record<string, number[]> = {
  '':       [0, 4, 7],
  'maj':    [0, 4, 7],
  'M':      [0, 4, 7],
  'm':      [0, 3, 7],
  'min':    [0, 3, 7],
  '-':      [0, 3, 7],
  '5':      [0, 7],            // power chord
  '6':      [0, 4, 7, 9],
  'm6':     [0, 3, 7, 9],
  '7':      [0, 4, 7, 10],
  'maj7':   [0, 4, 7, 11],
  'M7':     [0, 4, 7, 11],
  'm7':     [0, 3, 7, 10],
  'min7':   [0, 3, 7, 10],
  'mMaj7':  [0, 3, 7, 11],
  'dim':    [0, 3, 6],
  'dim7':   [0, 3, 6, 9],
  'm7b5':   [0, 3, 6, 10],
  'aug':    [0, 4, 8],
  '+':      [0, 4, 8],
  'sus2':   [0, 2, 7],
  'sus4':   [0, 5, 7],
  '7sus4':  [0, 5, 7, 10],
  'add9':   [0, 4, 7, 14],
  '9':      [0, 4, 7, 10, 14],
  'maj9':   [0, 4, 7, 11, 14],
  'm9':     [0, 3, 7, 10, 14],
}

const ROOT_LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export interface ParsedChord {
  /** 0..11 (C..B) */
  rootNum: number
  /** Original symbol, e.g. "Am7" */
  symbol: string
  /** Semitone intervals from root */
  intervals: number[]
}

export function parseChord(input: string): ParsedChord | null {
  const str = input.trim()
  if (!str) return null
  const m = /^([A-G])([#b]?)(.*)$/.exec(str)
  if (!m) return null
  const [, letter, acc, rest] = m
  let root = ROOT_LETTER[letter.toUpperCase()]
  if (root === undefined) return null
  if (acc === '#') root = (root + 1) % 12
  if (acc === 'b') root = (root + 11) % 12

  const quality = rest.replace(/\s+/g, '')
  const intervals = QUALITY_MAP[quality]
  if (!intervals) return null
  return { rootNum: root, symbol: str, intervals }
}

export function parseProgression(input: string): { chords: ParsedChord[]; failed: string[] } {
  const tokens = input.split(/[\s,|\-/]+/).map(t => t.trim()).filter(Boolean)
  const chords: ParsedChord[] = []
  const failed: string[] = []
  tokens.forEach(t => {
    const p = parseChord(t)
    if (p) chords.push(p)
    else failed.push(t)
  })
  return { chords, failed }
}

/** Build notes for a chord at a given start beat & duration. octave: middle C (=4) by default. */
export function chordToNotes(chord: ParsedChord, startBeat: number, duration: number, octave = 4, velocity = 100): Note[] {
  const rootMidi = (octave + 1) * 12 + chord.rootNum
  return chord.intervals.map(iv => ({
    pitch: rootMidi + iv,
    startBeat,
    duration,
    velocity,
  }))
}

// ───── Diatonic helpers ─────

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']

/** Diatonic 7-chords of a key. scaleType: 'major' for ionian, 'minor' for natural-minor */
export function diatonicTriads(keyRoot: number, scaleType: 'major' | 'minor'): Array<{ degree: string; symbol: string; rootNum: number; intervals: number[] }> {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const scale = scaleType === 'major'
    ? [0, 2, 4, 5, 7, 9, 11]
    : [0, 2, 3, 5, 7, 8, 10]
  const roman = scaleType === 'major' ? ROMAN_MAJOR : ROMAN_MINOR
  return scale.map((deg, i) => {
    const rootNum = (keyRoot + deg) % 12
    const third = scale[(i + 2) % 7] + (i + 2 >= 7 ? 12 : 0)
    const fifth = scale[(i + 4) % 7] + (i + 4 >= 7 ? 12 : 0)
    const thirdInterval = (third - deg + 12) % 12
    const fifthInterval = (fifth - deg + 12) % 12
    const intervals = [0, thirdInterval, fifthInterval]
    // Choose a chord symbol suffix based on the triad quality
    let suffix = ''
    if (thirdInterval === 3 && fifthInterval === 7) suffix = 'm'
    else if (thirdInterval === 3 && fifthInterval === 6) suffix = 'dim'
    else if (thirdInterval === 4 && fifthInterval === 8) suffix = 'aug'
    // major triad has no suffix
    return {
      degree: roman[i],
      symbol: `${NOTE_NAMES[rootNum]}${suffix}`,
      rootNum,
      intervals,
    }
  })
}
