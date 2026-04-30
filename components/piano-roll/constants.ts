export const KEY_WIDTH = 40          // piano key width (px)
export const ROW_HEIGHT = 14         // height per semitone (px)
export const BEAT_WIDTH = 64         // width per beat (px)
export const TOTAL_PITCHES = 88      // 88 keys
export const MIN_PITCH = 21          // A0
export const MAX_PITCH = 108         // C8
export const VISIBLE_PITCHES = 52    // C2-B6 range visible

export const SNAP_VALUES = [0.25, 0.5, 1] // 16th, 8th, quarter
export const DEFAULT_SNAP = 0.25
export const DEFAULT_VELOCITY = 100
export const DEFAULT_NOTE_DURATION = 0.5  // 8th note default

// Piano key colors
export const BLACK_KEYS = new Set([1, 3, 6, 8, 10]) // semitone offsets within octave

export function isBlackKey(pitch: number): boolean {
  return BLACK_KEYS.has(pitch % 12)
}

export function pitchToNoteName(pitch: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  return `${names[pitch % 12]}${octave}`
}
