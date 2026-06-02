'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Note } from '@/types'
import {
  KEY_WIDTH, ROW_HEIGHT, BEAT_WIDTH, DEFAULT_SNAP, DEFAULT_VELOCITY,
  DEFAULT_NOTE_DURATION, isBlackKey, pitchToNoteName,
} from './constants'

const MELODY_MIN_PITCH = 36   // C2
const MELODY_MAX_PITCH = 96   // C7
const DRUM_MIN_PITCH   = 35   // GM kick (acoustic)
const DRUM_MAX_PITCH   = 57   // GM crash 2
const RULER_HEIGHT = 16        // top ruler area for cursor click

export type Tool = 'draw' | 'select'

interface PianoRollProps {
  notes: Note[]
  measures: number
  onChange: (notes: Note[]) => void
  onCommit?: () => void
  snap?: number
  isReadOnly?: boolean
  tool?: Tool
  cursorBeat?: number
  onCursorChange?: (beat: number) => void
  playheadBeat?: number | null
  onSelectionChange?: (indices: number[]) => void
  /** 0=C, 1=C#, ..., 11=B */
  keyRoot?: number | null
  /** 스케일에 속하는 음정 집합 (semitones from root, 0..11) */
  keyScaleIntervals?: number[] | null
  /** drum 모드: 키 라벨이 드럼 이름으로 바뀜 */
  isDrum?: boolean
}

// GM Percussion key map (35–57 visible in drum mode)
const DRUM_NAMES: Record<number, string> = {
  35: 'Kick A',     // Acoustic Bass Drum
  36: 'Kick',       // Bass Drum 1
  37: 'Side Stick', // Side Stick
  38: 'Snare',      // Acoustic Snare
  39: 'Clap',       // Hand Clap
  40: 'Snare E',    // Electric Snare
  41: 'Floor L',    // Low Floor Tom
  42: 'HH Cl',      // Closed Hi-Hat
  43: 'Floor H',    // High Floor Tom
  44: 'HH Pd',      // Pedal Hi-Hat
  45: 'Tom L',      // Low Tom
  46: 'HH Op',      // Open Hi-Hat
  47: 'Tom LM',     // Low-Mid Tom
  48: 'Tom HM',     // Hi-Mid Tom
  49: 'Crash 1',    // Crash Cymbal 1
  50: 'Tom H',      // High Tom
  51: 'Ride',       // Ride Cymbal 1
  57: 'Crash 2',    // Crash Cymbal 2
}

type DragState =
  | { kind: 'none' }
  | { kind: 'drawing'; note: Note }
  | { kind: 'resizing'; noteIndex: number; origDuration: number; startX: number }
  | { kind: 'moving'; noteIndices: number[]; origNotes: Note[]; startX: number; startY: number }
  | { kind: 'selecting'; startX: number; startY: number; curX: number; curY: number }

function beatToX(beat: number): number {
  return KEY_WIDTH + beat * BEAT_WIDTH
}
function xToBeat(x: number, snap: number): number {
  const raw = (x - KEY_WIDTH) / BEAT_WIDTH
  return Math.max(0, Math.round(raw / snap) * snap)
}

export default function PianoRoll({
  notes, measures, onChange, onCommit, snap = DEFAULT_SNAP,
  isReadOnly = false, tool = 'draw', cursorBeat, onCursorChange,
  playheadBeat = null, onSelectionChange,
  keyRoot = null, keyScaleIntervals = null,
  isDrum = false,
}: PianoRollProps) {
  const visibleMin = isDrum ? DRUM_MIN_PITCH : MELODY_MIN_PITCH
  const visibleMax = isDrum ? DRUM_MAX_PITCH : MELODY_MAX_PITCH
  const visibleRange = visibleMax - visibleMin + 1

  const pitchToY = useCallback((pitch: number) => RULER_HEIGHT + (visibleMax - pitch) * ROW_HEIGHT, [visibleMax])
  const yToPitch = useCallback((y: number) => Math.round(visibleMax - (y - RULER_HEIGHT) / ROW_HEIGHT), [visibleMax])
  const noteRect = useCallback((note: Note) => ({
    x: beatToX(note.startBeat),
    y: pitchToY(note.pitch),
    w: Math.max(note.duration * BEAT_WIDTH - 2, 4),
    h: ROW_HEIGHT - 1,
  }), [pitchToY])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState>({ kind: 'none' })
  const notesRef = useRef(notes)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const selectedRef = useRef(selected)

  useEffect(() => { notesRef.current = notes }, [notes])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => {
    if (onSelectionChange) onSelectionChange(Array.from(selected).sort((a, b) => a - b))
  }, [selected, onSelectionChange])

  const totalBeats = measures * 4
  const canvasWidth = KEY_WIDTH + totalBeats * BEAT_WIDTH
  const canvasHeight = RULER_HEIGHT + visibleRange * ROW_HEIGHT

  // In-memory clipboard (shared across PianoRoll instances within a mount)
  const clipboardRef = useRef<Note[]>([])
  const cursorBeatRef = useRef(cursorBeat ?? 0)
  useEffect(() => { cursorBeatRef.current = cursorBeat ?? 0 }, [cursorBeat])

  // Keyboard shortcuts: Delete, Ctrl+C/V/A
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isReadOnly) return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (
        ae.tagName === 'INPUT' ||
        ae.tagName === 'TEXTAREA' ||
        ae.tagName === 'SELECT' ||
        ae.isContentEditable
      )) return

      // Delete / Backspace → remove selected notes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedRef.current.size === 0) return
        onChange(notesRef.current.filter((_, i) => !selectedRef.current.has(i)))
        setSelected(new Set())
        onCommit?.()
        return
      }

      // Arrow up/down → transpose by semitone (Shift = octave)
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (notesRef.current.length === 0) return
        e.preventDefault()
        const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)
        const targets = selectedRef.current.size > 0
          ? selectedRef.current
          : new Set(notesRef.current.map((_, i) => i))
        const next = notesRef.current.map((n, i) =>
          targets.has(i)
            ? { ...n, pitch: Math.max(visibleMin, Math.min(visibleMax, n.pitch + delta)) }
            : n
        )
        onChange(next)
        onCommit?.()
        return
      }

      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()

      // Ctrl/Cmd+A → select all
      if (key === 'a') {
        e.preventDefault()
        setSelected(new Set(notesRef.current.map((_, i) => i)))
        return
      }

      // Ctrl/Cmd+C → copy selected to clipboard
      if (key === 'c') {
        if (selectedRef.current.size === 0) return
        e.preventDefault()
        clipboardRef.current = Array.from(selectedRef.current)
          .sort((a, b) => a - b)
          .map(i => ({ ...notesRef.current[i] }))
        return
      }

      // Ctrl/Cmd+X → cut
      if (key === 'x') {
        if (selectedRef.current.size === 0) return
        e.preventDefault()
        clipboardRef.current = Array.from(selectedRef.current)
          .sort((a, b) => a - b)
          .map(i => ({ ...notesRef.current[i] }))
        onChange(notesRef.current.filter((_, i) => !selectedRef.current.has(i)))
        setSelected(new Set())
        onCommit?.()
        return
      }

      // Ctrl/Cmd+V → paste at cursor (or after rightmost existing if cursor is 0)
      if (key === 'v') {
        if (clipboardRef.current.length === 0) return
        e.preventDefault()
        const minBeat = Math.min(...clipboardRef.current.map(n => n.startBeat))
        const offset = cursorBeatRef.current - minBeat
        const pasted = clipboardRef.current.map(n => ({ ...n, startBeat: Math.max(0, n.startBeat + offset) }))
        const startIdx = notesRef.current.length
        onChange([...notesRef.current, ...pasted])
        setSelected(new Set(pasted.map((_, i) => startIdx + i)))
        onCommit?.()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onChange, onCommit, isReadOnly, visibleMin, visibleMax])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // === RULER ===
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(KEY_WIDTH, 0, totalBeats * BEAT_WIDTH, RULER_HEIGHT)
    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = beatToX(beat)
      const isMeasure = beat % 4 === 0
      ctx.strokeStyle = isMeasure ? '#555' : '#333'
      ctx.lineWidth = isMeasure ? 1 : 0.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, RULER_HEIGHT); ctx.stroke()
      if (isMeasure) {
        ctx.fillStyle = '#777'
        ctx.font = '10px monospace'
        ctx.fillText(`${beat / 4 + 1}`, x + 3, RULER_HEIGHT - 3)
      }
    }

    // === PIANO KEYS ===
    for (let pitch = visibleMin; pitch <= visibleMax; pitch++) {
      const y = pitchToY(pitch)
      const isDrumRow = isDrum && DRUM_NAMES[pitch] !== undefined
      ctx.fillStyle = isDrumRow ? '#332a1a' : isBlackKey(pitch) ? '#1a1a1a' : '#2a2a2a'
      ctx.fillRect(0, y, KEY_WIDTH, ROW_HEIGHT)
      const label = isDrum ? DRUM_NAMES[pitch] : (pitch % 12 === 0 ? pitchToNoteName(pitch) : null)
      if (label) {
        ctx.fillStyle = isDrumRow ? '#fbbf24' : '#888'
        ctx.font = '9px monospace'
        ctx.fillText(label, 2, y + ROW_HEIGHT - 3)
      }
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(KEY_WIDTH, y); ctx.stroke()
    }

    // === GRID ===
    const scaleSet = keyRoot !== null && keyScaleIntervals
      ? new Set(keyScaleIntervals)
      : null
    for (let pitch = visibleMin; pitch <= visibleMax; pitch++) {
      const y = pitchToY(pitch)
      const black = isBlackKey(pitch)
      let fill = black ? '#1e1e1e' : '#252525'
      if (scaleSet && keyRoot !== null) {
        const interval = ((pitch - keyRoot) % 12 + 12) % 12
        if (scaleSet.has(interval)) {
          fill = black ? '#1a2e1d' : '#1f3a25'  // 스케일 안: 살짝 초록 톤
          // 루트 음(키 음)은 더 강조
          if (interval === 0) fill = black ? '#1f3a25' : '#234a2c'
        }
      }
      ctx.fillStyle = fill
      ctx.fillRect(KEY_WIDTH, y, totalBeats * BEAT_WIDTH, ROW_HEIGHT)
    }
    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = beatToX(beat)
      const isMeasure = beat % 4 === 0
      ctx.strokeStyle = isMeasure ? '#444' : '#2e2e2e'
      ctx.lineWidth = isMeasure ? 1.5 : 0.5
      ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, canvasHeight); ctx.stroke()
    }
    // 8th note lines
    for (let h = 0; h < totalBeats * 2; h++) {
      if (h % 2 === 0) continue
      const x = beatToX(h * 0.5)
      ctx.strokeStyle = '#292929'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, canvasHeight); ctx.stroke()
    }

    // === NOTES (alpha encodes velocity 0..127 → 0.35..1.0) ===
    notesRef.current.forEach((note, i) => {
      const { x, y, w, h } = noteRect(note)
      const isSel = selected.has(i)
      const alpha = 0.35 + (Math.max(0, Math.min(127, note.velocity)) / 127) * 0.65
      ctx.globalAlpha = alpha
      ctx.fillStyle = isSel ? '#86efac' : '#4ade80'
      ctx.beginPath(); ctx.roundRect(x + 1, y + 0.5, w, h, 2); ctx.fill()
      if (!isReadOnly) {
        ctx.fillStyle = isSel ? '#4ade80' : '#16a34a'
        ctx.fillRect(x + w - 4, y + 1, 4, h - 1)
      }
      ctx.globalAlpha = 1
      if (isSel) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(x + 1, y + 0.5, w, h, 2); ctx.stroke()
      }
    })

    // === SELECTION RECT ===
    const drag = dragRef.current
    if (drag.kind === 'selecting') {
      const x1 = Math.min(drag.startX, drag.curX)
      const y1 = Math.min(drag.startY, drag.curY)
      const x2 = Math.max(drag.startX, drag.curX)
      const y2 = Math.max(drag.startY, drag.curY)
      ctx.strokeStyle = 'rgba(74,222,128,0.8)'
      ctx.fillStyle = 'rgba(74,222,128,0.1)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2])
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
      ctx.setLineDash([])
    }

    // === CURSOR LINE (insert 위치, 노란 점선) ===
    if (cursorBeat !== undefined) {
      const cx = beatToX(cursorBeat)
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 3])
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvasHeight); ctx.stroke()
      ctx.setLineDash([])
    }

    // === PLAYHEAD (재생 위치, 빨간 실선) ===
    if (playheadBeat !== null && playheadBeat !== undefined) {
      const px = beatToX(playheadBeat)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvasHeight); ctx.stroke()
      // 상단 삼각형 마커
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 6)
      ctx.closePath(); ctx.fill()
    }
  }, [canvasWidth, canvasHeight, totalBeats, selected, cursorBeat, playheadBeat, isReadOnly, keyRoot, keyScaleIntervals, isDrum, visibleMin, visibleMax, pitchToY, noteRect])

  useEffect(() => { draw() }, [draw, notes])

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const getNoteAt = (x: number, y: number): number =>
    notesRef.current.findIndex(note => {
      const r = noteRect(note)
      return x >= r.x && x <= r.x + r.w && y >= r.y && y < r.y + r.h
    })

  const isResize = (note: Note, x: number): boolean => {
    const r = noteRect(note)
    return x >= r.x + r.w - 6
  }

  const getNotesInRect = (x1: number, y1: number, x2: number, y2: number): Set<number> => {
    const set = new Set<number>()
    notesRef.current.forEach((note, i) => {
      const r = noteRect(note)
      if (r.x < x2 && r.x + r.w > x1 && r.y < y2 && r.y + r.h > y1) set.add(i)
    })
    return set
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isReadOnly) return
    const { x, y } = getPos(e)

    // Ruler click → set cursor position
    if (y < RULER_HEIGHT && x >= KEY_WIDTH && onCursorChange) {
      const beat = Math.floor(xToBeat(x, 1))
      onCursorChange(beat)
      return
    }

    // Right click → delete
    if (e.button === 2) {
      const idx = getNoteAt(x, y)
      if (idx !== -1) {
        if (selectedRef.current.has(idx) && selectedRef.current.size > 1) {
          onChange(notesRef.current.filter((_, i) => !selectedRef.current.has(i)))
          setSelected(new Set())
        } else {
          onChange(notesRef.current.filter((_, i) => i !== idx))
          const next = new Set(selectedRef.current); next.delete(idx); setSelected(next)
        }
        onCommit?.()
      }
      return
    }

    if (x < KEY_WIDTH) return

    const idx = getNoteAt(x, y)

    if (tool === 'select') {
      if (idx !== -1) {
        if (e.shiftKey) {
          const next = new Set(selectedRef.current)
          if (next.has(idx)) next.delete(idx); else next.add(idx)
          setSelected(next)
          return
        }
        const moveIndices = selectedRef.current.has(idx) ? Array.from(selectedRef.current) : [idx]
        if (!selectedRef.current.has(idx)) setSelected(new Set([idx]))
        dragRef.current = {
          kind: 'moving', noteIndices: moveIndices,
          origNotes: moveIndices.map(i => ({ ...notesRef.current[i] })),
          startX: x, startY: y,
        }
      } else {
        if (!e.shiftKey) setSelected(new Set())
        dragRef.current = { kind: 'selecting', startX: x, startY: y, curX: x, curY: y }
      }
      return
    }

    // Draw tool
    if (idx !== -1) {
      const note = notesRef.current[idx]
      if (isResize(note, x)) {
        dragRef.current = { kind: 'resizing', noteIndex: idx, origDuration: note.duration, startX: x }
      } else {
        const moveIndices = selectedRef.current.has(idx) ? Array.from(selectedRef.current) : [idx]
        if (!selectedRef.current.has(idx)) setSelected(new Set([idx]))
        dragRef.current = {
          kind: 'moving', noteIndices: moveIndices,
          origNotes: moveIndices.map(i => ({ ...notesRef.current[i] })),
          startX: x, startY: y,
        }
      }
      return
    }

    // Draw new note
    const pitch = yToPitch(y)
    if (pitch < visibleMin || pitch > visibleMax) return
    const startBeat = xToBeat(x, snap)
    const newNote: Note = { pitch, startBeat, duration: DEFAULT_NOTE_DURATION, velocity: DEFAULT_VELOCITY }
    dragRef.current = { kind: 'drawing', note: newNote }
    setSelected(new Set())
    onChange([...notesRef.current, newNote])
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isReadOnly) return
    const { x, y } = getPos(e)
    const drag = dragRef.current

    if (drag.kind === 'drawing') {
      const beat = xToBeat(x, snap)
      const dur = Math.max(snap, Math.round((beat - drag.note.startBeat + snap) / snap) * snap)
      const updated = { ...drag.note, duration: dur }
      dragRef.current = { kind: 'drawing', note: updated }
      const next = [...notesRef.current]
      next[next.length - 1] = updated
      onChange(next)
    } else if (drag.kind === 'resizing') {
      const dx = x - drag.startX
      const beatsDelta = Math.round((dx / BEAT_WIDTH) / snap) * snap
      const dur = Math.max(snap, drag.origDuration + beatsDelta)
      onChange(notesRef.current.map((n, i) => i === drag.noteIndex ? { ...n, duration: dur } : n))
    } else if (drag.kind === 'moving') {
      const beatDelta = Math.round(((x - drag.startX) / BEAT_WIDTH) / snap) * snap
      const pitchDelta = -Math.round((y - drag.startY) / ROW_HEIGHT)
      const next = [...notesRef.current]
      drag.noteIndices.forEach((ni, i) => {
        const orig = drag.origNotes[i]
        next[ni] = {
          ...orig,
          pitch: Math.max(visibleMin, Math.min(visibleMax, orig.pitch + pitchDelta)),
          startBeat: Math.max(0, orig.startBeat + beatDelta),
        }
      })
      onChange(next)
    } else if (drag.kind === 'selecting') {
      dragRef.current = { ...drag, curX: x, curY: y }
      draw()
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (drag.kind === 'selecting') {
      const x1 = Math.min(drag.startX, drag.curX)
      const y1 = Math.min(drag.startY, drag.curY)
      const x2 = Math.max(drag.startX, drag.curX)
      const y2 = Math.max(drag.startY, drag.curY)
      const found = getNotesInRect(x1, y1, x2, y2)
      if (e.shiftKey) {
        const next = new Set(selectedRef.current)
        found.forEach(i => next.add(i))
        setSelected(next)
      } else {
        setSelected(found)
      }
    } else if (drag.kind === 'drawing' || drag.kind === 'resizing' || drag.kind === 'moving') {
      onCommit?.()
    }
    dragRef.current = { kind: 'none' }
  }

  const cursor = (() => {
    if (isReadOnly) return 'default'
    if (tool === 'select') return 'default'
    return 'crosshair'
  })()

  return (
    <div className="overflow-auto rounded-lg border border-zinc-700 bg-zinc-900">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          const k = dragRef.current.kind
          if (k === 'drawing' || k === 'resizing' || k === 'moving') onCommit?.()
          dragRef.current = { kind: 'none' }
        }}
        onContextMenu={e => e.preventDefault()}
        style={{ cursor, display: 'block' }}
      />
    </div>
  )
}
