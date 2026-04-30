'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Note } from '@/types'
import {
  KEY_WIDTH, ROW_HEIGHT, BEAT_WIDTH, DEFAULT_SNAP, DEFAULT_VELOCITY,
  DEFAULT_NOTE_DURATION, isBlackKey, pitchToNoteName,
} from './constants'

const VISIBLE_MIN_PITCH = 36   // C2
const VISIBLE_MAX_PITCH = 96   // C7
const VISIBLE_RANGE = VISIBLE_MAX_PITCH - VISIBLE_MIN_PITCH + 1
const RULER_HEIGHT = 16        // top ruler area for cursor click

export type Tool = 'draw' | 'select'

interface PianoRollProps {
  notes: Note[]
  measures: number
  onChange: (notes: Note[]) => void
  snap?: number
  isReadOnly?: boolean
  tool?: Tool
  cursorBeat?: number
  onCursorChange?: (beat: number) => void
}

type DragState =
  | { kind: 'none' }
  | { kind: 'drawing'; note: Note }
  | { kind: 'resizing'; noteIndex: number; origDuration: number; startX: number }
  | { kind: 'moving'; noteIndices: number[]; origNotes: Note[]; startX: number; startY: number }
  | { kind: 'selecting'; startX: number; startY: number; curX: number; curY: number }

function pitchToY(pitch: number): number {
  return RULER_HEIGHT + (VISIBLE_MAX_PITCH - pitch) * ROW_HEIGHT
}
function yToPitch(y: number): number {
  return Math.round(VISIBLE_MAX_PITCH - (y - RULER_HEIGHT) / ROW_HEIGHT)
}
function beatToX(beat: number): number {
  return KEY_WIDTH + beat * BEAT_WIDTH
}
function xToBeat(x: number, snap: number): number {
  const raw = (x - KEY_WIDTH) / BEAT_WIDTH
  return Math.max(0, Math.round(raw / snap) * snap)
}
function noteRect(note: Note) {
  return {
    x: beatToX(note.startBeat),
    y: pitchToY(note.pitch),
    w: Math.max(note.duration * BEAT_WIDTH - 2, 4),
    h: ROW_HEIGHT - 1,
  }
}

export default function PianoRoll({
  notes, measures, onChange, snap = DEFAULT_SNAP,
  isReadOnly = false, tool = 'draw', cursorBeat, onCursorChange,
}: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState>({ kind: 'none' })
  const notesRef = useRef(notes)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const selectedRef = useRef(selected)
  notesRef.current = notes
  selectedRef.current = selected

  const totalBeats = measures * 4
  const canvasWidth = KEY_WIDTH + totalBeats * BEAT_WIDTH
  const canvasHeight = RULER_HEIGHT + VISIBLE_RANGE * ROW_HEIGHT

  // Delete selected notes via keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isReadOnly) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (selectedRef.current.size === 0) return
      // Only fire if no input is focused
      if (document.activeElement?.tagName === 'INPUT') return
      onChange(notesRef.current.filter((_, i) => !selectedRef.current.has(i)))
      setSelected(new Set())
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onChange, isReadOnly])

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
    for (let pitch = VISIBLE_MIN_PITCH; pitch <= VISIBLE_MAX_PITCH; pitch++) {
      const y = pitchToY(pitch)
      ctx.fillStyle = isBlackKey(pitch) ? '#1a1a1a' : '#2a2a2a'
      ctx.fillRect(0, y, KEY_WIDTH, ROW_HEIGHT)
      if (pitch % 12 === 0) {
        ctx.fillStyle = '#888'
        ctx.font = '9px monospace'
        ctx.fillText(pitchToNoteName(pitch), 2, y + ROW_HEIGHT - 3)
      }
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(KEY_WIDTH, y); ctx.stroke()
    }

    // === GRID ===
    for (let pitch = VISIBLE_MIN_PITCH; pitch <= VISIBLE_MAX_PITCH; pitch++) {
      const y = pitchToY(pitch)
      ctx.fillStyle = isBlackKey(pitch) ? '#1e1e1e' : '#252525'
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

    // === NOTES ===
    notesRef.current.forEach((note, i) => {
      const { x, y, w, h } = noteRect(note)
      const isSel = selected.has(i)
      ctx.fillStyle = isSel ? '#86efac' : '#4ade80'
      ctx.beginPath(); ctx.roundRect(x + 1, y + 0.5, w, h, 2); ctx.fill()
      if (isSel) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(x + 1, y + 0.5, w, h, 2); ctx.stroke()
      }
      if (!isReadOnly) {
        ctx.fillStyle = isSel ? '#4ade80' : '#16a34a'
        ctx.fillRect(x + w - 4, y + 1, 4, h - 1)
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

    // === CURSOR LINE ===
    if (cursorBeat !== undefined) {
      const cx = beatToX(cursorBeat)
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 3])
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvasHeight); ctx.stroke()
      ctx.setLineDash([])
    }
  }, [canvasWidth, canvasHeight, totalBeats, selected, cursorBeat, isReadOnly])

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
          const keep = new Set(selectedRef.current)
          const next = notesRef.current.filter((_, i) => { if (keep.has(i)) { keep.delete(i); return false } return true })
          onChange(notesRef.current.filter((_, i) => !selectedRef.current.has(i)))
          setSelected(new Set())
        } else {
          onChange(notesRef.current.filter((_, i) => i !== idx))
          const next = new Set(selectedRef.current); next.delete(idx); setSelected(next)
        }
      }
      return
    }

    if (x < KEY_WIDTH) return

    const idx = getNoteAt(x, y)

    if (tool === 'select') {
      if (idx !== -1) {
        const note = notesRef.current[idx]
        if (e.shiftKey) {
          const next = new Set(selectedRef.current)
          next.has(idx) ? next.delete(idx) : next.add(idx)
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
    if (pitch < VISIBLE_MIN_PITCH || pitch > VISIBLE_MAX_PITCH) return
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
          pitch: Math.max(VISIBLE_MIN_PITCH, Math.min(VISIBLE_MAX_PITCH, orig.pitch + pitchDelta)),
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
        onMouseLeave={() => { dragRef.current = { kind: 'none' } }}
        onContextMenu={e => e.preventDefault()}
        style={{ cursor, display: 'block' }}
      />
    </div>
  )
}
