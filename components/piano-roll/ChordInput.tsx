'use client'

import { useState } from 'react'
import { Note, CHORD_TYPES, ROOT_NOTES, ChordDefinition } from '@/types'
import { DEFAULT_VELOCITY } from './constants'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'

interface ChordInputProps {
  onAddChord: (notes: Note[], durationBeats: number) => void
  currentBeat: number
  onCursorChange: (beat: number) => void
  maxBeat: number
}

function beatLabel(beat: number): string {
  const measure = Math.floor(beat / 4) + 1
  const b = (beat % 4) + 1
  return `${measure}마디 ${b}박`
}

export default function ChordInput({ onAddChord, currentBeat, onCursorChange, maxBeat }: ChordInputProps) {
  const [root, setRoot] = useState(0)
  const [octave, setOctave] = useState(4)
  const [chordType, setChordType] = useState<ChordDefinition>(CHORD_TYPES[0])
  const [duration, setDuration] = useState(4)

  const handleAdd = () => {
    const rootMidi = (octave + 1) * 12 + root
    const notes: Note[] = chordType.intervals.map(interval => ({
      pitch: rootMidi + interval,
      startBeat: currentBeat,
      duration,
      velocity: DEFAULT_VELOCITY,
    }))
    onAddChord(notes, duration)
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">코드 입력</p>

      {/* Cursor position */}
      <div className="rounded bg-zinc-800 p-2 space-y-1">
        <p className="text-xs text-zinc-500">삽입 위치</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCursorChange(Math.max(0, currentBeat - 4))}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-white"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="flex-1 text-center text-xs font-bold text-yellow-400">{beatLabel(currentBeat)}</span>
          <button
            onClick={() => onCursorChange(Math.min(maxBeat - 1, currentBeat + 4))}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-white"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => onCursorChange(0)}
            title="처음으로"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Root note */}
      <div>
        <p className="mb-1 text-xs text-zinc-500">근음</p>
        <div className="flex flex-wrap gap-1">
          {ROOT_NOTES.map((name, i) => (
            <button
              key={name}
              onClick={() => setRoot(i)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                root === i ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Octave */}
      <div>
        <p className="mb-1 text-xs text-zinc-500">옥타브</p>
        <div className="flex gap-1">
          {[3, 4, 5].map(o => (
            <button
              key={o}
              onClick={() => setOctave(o)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                octave === o ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Chord type */}
      <div>
        <p className="mb-1 text-xs text-zinc-500">코드 종류</p>
        <div className="flex flex-wrap gap-1">
          {CHORD_TYPES.map(ct => (
            <button
              key={ct.name}
              onClick={() => setChordType(ct)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                chordType.name === ct.name ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {ct.name}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <p className="mb-1 text-xs text-zinc-500">길이</p>
        <div className="flex gap-1">
          {[
            { label: '1박', val: 1 },
            { label: '2박', val: 2 },
            { label: '1마디', val: 4 },
            { label: '2마디', val: 8 },
          ].map(({ label, val }) => (
            <button
              key={val}
              onClick={() => setDuration(val)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                duration === val ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview & Add */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 rounded bg-zinc-800 px-2 py-1 text-center text-sm font-bold text-green-400">
          {ROOT_NOTES[root]}{octave} {chordType.name}
        </div>
        <button
          onClick={handleAdd}
          className="rounded bg-green-500 px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-green-400"
        >
          + 추가
        </button>
      </div>
    </div>
  )
}
