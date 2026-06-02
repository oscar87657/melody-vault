'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Note, Pattern, PatternType, MOOD_TAGS, USE_TAGS, ROOT_NOTES, SCALES } from '@/types'
import { parseProgression, chordToNotes } from '@/lib/chord'
import { createClient } from '@/lib/supabase'
import { downloadMidi, downloadWav } from '@/lib/midi'
import { ChevronLeft, Download, Save, Trash2, Pencil, MousePointer2, ChevronsUp, ChevronsDown, ChevronUp, ChevronDown } from 'lucide-react'
import ChordInput from '@/components/piano-roll/ChordInput'
import PlaybackControls from '@/components/piano-roll/PlaybackControls'
import { type Tool } from '@/components/piano-roll/PianoRoll'

const PianoRoll = dynamic(() => import('@/components/piano-roll/PianoRoll'), { ssr: false })

const SNAP_OPTIONS = [
  { label: '1/16', value: 0.25 },
  { label: '1/8',  value: 0.5 },
  { label: '1/4',  value: 1 },
]

const HISTORY_LIMIT = 100

function useUndoable<T>(initial: T) {
  const [state, setState] = useState<T>(initial)
  const committedRef = useRef<T>(initial)
  const historyRef = useRef<T[]>([])
  const futureRef = useRef<T[]>([])

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState(prev => typeof next === 'function' ? (next as (p: T) => T)(prev) : next)
  }, [])

  const commit = useCallback(() => {
    setState(prev => {
      if (Object.is(prev, committedRef.current)) return prev
      historyRef.current.push(committedRef.current)
      if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
      committedRef.current = prev
      futureRef.current = []
      return prev
    })
  }, [])

  const undo = useCallback(() => {
    const last = historyRef.current.pop()
    if (last === undefined) return
    futureRef.current.push(committedRef.current)
    committedRef.current = last
    setState(last)
  }, [])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (next === undefined) return
    historyRef.current.push(committedRef.current)
    committedRef.current = next
    setState(next)
  }, [])

  const reset = useCallback((value: T) => {
    historyRef.current = []
    futureRef.current = []
    committedRef.current = value
    setState(value)
  }, [])

  return { state, set, commit, undo, redo, reset } as const
}

function EditorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialPatternId = searchParams.get('id')
  const defaultType = (searchParams.get('type') as PatternType) ?? 'melody'

  const [patternId, setPatternId] = useState<string | null>(initialPatternId)
  const [name, setName] = useState('새 패턴')
  const [type, setType] = useState<PatternType>(defaultType)
  const notesHistory = useUndoable<Note[]>([])
  const notes = notesHistory.state
  const setNotes = notesHistory.set
  const [bpm, setBpm] = useState(120)
  const [measures, setMeasures] = useState(type === 'chord' ? 4 : 2)
  const [tags, setTags] = useState<string[]>([])
  const [snap, setSnap] = useState(0.25)
  const [cursorBeat, setCursorBeat] = useState(0)
  const [tool, setTool] = useState<Tool>('draw')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!initialPatternId)
  const [playheadBeat, setPlayheadBeat] = useState<number | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [keyRoot, setKeyRoot] = useState<number | null>(null)
  const [keyScaleIdx, setKeyScaleIdx] = useState(0)
  const [progressionStr, setProgressionStr] = useState('')
  const [progressionLen, setProgressionLen] = useState(4)

  // skip the load-fetch for ids we just created locally (avoids round-trip after auto-save insert)
  const fetchedIdRef = useRef<string | null>(null)

  const resetNotes = notesHistory.reset
  useEffect(() => {
    if (!patternId || fetchedIdRef.current === patternId) return
    fetchedIdRef.current = patternId
    const supabase = createClient()
    supabase.from('patterns').select('*').eq('id', patternId).single()
      .then(({ data, error }: { data: Pattern | null; error: { message: string } | null }) => {
        if (error) console.error('패턴 불러오기 실패:', error.message)
        if (data) {
          setName(data.name); setType(data.type); resetNotes(data.notes)
          setBpm(data.bpm); setMeasures(data.measures); setTags(data.tags)
        }
        setLoading(false)
      }, (err: unknown) => {
        console.error('패턴 불러오기 실패:', err)
        setLoading(false)
      })
  }, [patternId, resetNotes])

  const commitNotes = notesHistory.commit
  const handleAddChord = useCallback((chordNotes: Note[], duration: number) => {
    setNotes(prev => [...prev, ...chordNotes])
    commitNotes()
    setCursorBeat(prev => prev + duration)
  }, [setNotes, commitNotes])

  const addChordProgression = useCallback((str: string, beatsPerChord: number) => {
    const { chords, failed } = parseProgression(str)
    if (failed.length > 0) { alert(`해석 실패: ${failed.join(', ')}`); return }
    if (chords.length === 0) return
    let curBeat = cursorBeat
    const newNotes: Note[] = []
    chords.forEach(c => {
      newNotes.push(...chordToNotes(c, curBeat, beatsPerChord))
      curBeat += beatsPerChord
    })
    setNotes(prev => [...prev, ...newNotes])
    commitNotes()
    setCursorBeat(curBeat)
  }, [cursorBeat, setNotes, commitNotes])

  // VISIBLE_MIN_PITCH=36 (C2), VISIBLE_MAX_PITCH=96 (C7) — kept in sync with PianoRoll
  const transpose = useCallback((semitones: number) => {
    setNotes(prev => {
      if (prev.length === 0) return prev
      return prev.map(n => ({ ...n, pitch: Math.max(36, Math.min(96, n.pitch + semitones)) }))
    })
    commitNotes()
  }, [setNotes, commitNotes])

  const setSelectedVelocity = useCallback((v: number) => {
    setNotes(prev => prev.map((n, i) => selectedIndices.includes(i) ? { ...n, velocity: v } : n))
  }, [setNotes, selectedIndices])

  const selectedVelocity = selectedIndices[0] !== undefined && notes[selectedIndices[0]]
    ? notes[selectedIndices[0]].velocity
    : 100

  const toggleTag = (tag: string) =>
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

  const handleSave = useCallback(async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); setSaving(false); return }

    const payload = { name, type, notes, bpm, measures, tags, user_id: user.id, updated_at: new Date().toISOString() }
    if (patternId) {
      await supabase.from('patterns').update(payload).eq('id', patternId)
    } else {
      const { data } = await supabase.from('patterns').insert({ ...payload, created_at: new Date().toISOString() }).select().single()
      if (data) {
        fetchedIdRef.current = data.id  // don't refetch what we just wrote
        setPatternId(data.id)
        window.history.replaceState(null, '', `/editor?id=${data.id}`)
      }
    }
    setSaving(false)
  }, [name, type, notes, bpm, measures, tags, patternId, router])

  const handleDelete = async () => {
    if (!patternId || !confirm('이 패턴을 삭제할까요?')) return
    const supabase = createClient()
    await supabase.from('patterns').delete().eq('id', patternId)
    router.push('/library')
  }

  const handleSaveRef = useRef(handleSave)
  const undoRef = useRef(notesHistory.undo)
  const redoRef = useRef(notesHistory.redo)
  useEffect(() => { handleSaveRef.current = handleSave }, [handleSave])
  useEffect(() => { undoRef.current = notesHistory.undo }, [notesHistory.undo])
  useEffect(() => { redoRef.current = notesHistory.redo }, [notesHistory.redo])

  // Auto-save: 2초간 변경 없으면 저장
  const skipAutoSaveRef = useRef(true)  // 첫 mount + 초기 데이터 로드 후 한 번은 skip
  useEffect(() => {
    if (loading) return
    if (skipAutoSaveRef.current) { skipAutoSaveRef.current = false; return }
    if (!patternId && notes.length === 0) return  // 빈 새 패턴은 생성하지 않음
    const t = setTimeout(() => { handleSaveRef.current() }, 2000)
    return () => clearTimeout(t)
  }, [name, type, notes, bpm, measures, tags, loading, patternId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()

      if (key === 's') {
        e.preventDefault()
        handleSaveRef.current()
        return
      }

      // Don't hijack browser undo while typing in an input
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoRef.current()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redoRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleDownloadMidi = () => {
    const pattern: Pattern = { id: patternId ?? 'new', user_id: '', name, type, notes, bpm, measures, tags, created_at: '', updated_at: '' }
    downloadMidi(pattern)
  }

  const [rendering, setRendering] = useState(false)
  const handleDownloadWav = async () => {
    if (notes.length === 0) { alert('노트가 없으면 WAV로 내보낼 수 없습니다.'); return }
    setRendering(true)
    try {
      const pattern: Pattern = { id: patternId ?? 'new', user_id: '', name, type, notes, bpm, measures, tags, created_at: '', updated_at: '' }
      await downloadWav(pattern)
    } catch (err) {
      console.error('WAV 렌더링 실패:', err)
      alert('WAV 렌더링 실패')
    } finally {
      setRendering(false)
    }
  }

  if (loading) return <div className="flex h-screen items-center justify-center text-zinc-400">불러오는 중...</div>

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <button onClick={() => router.push('/library')} className="text-zinc-400 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold focus:outline-none"
          placeholder="패턴 이름..."
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 min-w-[70px] text-right">
            {saving ? '저장 중...' : patternId ? '자동 저장됨' : '아직 저장 안 됨'}
          </span>
          {patternId && (
            <button onClick={handleDelete} className="rounded p-1.5 text-red-500 hover:bg-zinc-800">
              <Trash2 size={16} />
            </button>
          )}
          <button onClick={handleDownloadMidi} className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <Download size={14} /> MIDI
          </button>
          <button onClick={handleDownloadWav} disabled={rendering} className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50">
            <Download size={14} /> {rendering ? '렌더링...' : 'WAV'}
          </button>
          <button
            onClick={handleSave} disabled={saving}
            title="Ctrl/Cmd+S"
            className="flex items-center gap-1 rounded bg-green-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="flex w-64 flex-col gap-3 overflow-y-auto border-r border-zinc-800 p-3">
          {/* Type / measures / snap / tool */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
            <div className="flex gap-2">
              {(['chord', 'melody'] as PatternType[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setType(t); setMeasures(t === 'chord' ? 4 : 2) }}
                  className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                    type === t ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {t === 'chord' ? '코드' : '멜로디'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">마디</span>
              <div className="flex gap-1">
                {[1, 2, 4, 8].map(m => (
                  <button key={m} onClick={() => setMeasures(m)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${measures === m ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                  >{m}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">스냅</span>
              <div className="flex gap-1">
                {SNAP_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => setSnap(s.value)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${snap === s.value ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                  >{s.label}</button>
                ))}
              </div>
            </div>
            {/* Tool toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">도구</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setTool('draw')}
                  title="그리기 (노트 클릭 추가)"
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${tool === 'draw' ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                  <Pencil size={10} /> 그리기
                </button>
                <button
                  onClick={() => setTool('select')}
                  title="선택 (드래그로 다중 선택)"
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${tool === 'select' ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                  <MousePointer2 size={10} /> 선택
                </button>
              </div>
            </div>
          </div>

          {/* Chord progression — text input */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">코드 진행 빠른 입력</p>
            <input
              value={progressionStr}
              onChange={e => setProgressionStr(e.target.value)}
              placeholder="예: Am F C G"
              className="w-full rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              onKeyDown={e => { if (e.key === 'Enter') { addChordProgression(progressionStr, progressionLen); setProgressionStr('') } }}
            />
            <div className="flex gap-1">
              {[{label:'1박', val:1}, {label:'2박', val:2}, {label:'1마디', val:4}, {label:'2마디', val:8}].map(b => (
                <button key={b.val} onClick={() => setProgressionLen(b.val)}
                  className={`flex-1 rounded py-0.5 text-[10px] transition-colors ${progressionLen === b.val ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>{b.label}</button>
              ))}
            </div>
            <button
              onClick={() => { addChordProgression(progressionStr, progressionLen); setProgressionStr('') }}
              disabled={!progressionStr.trim()}
              className="w-full rounded bg-green-500 py-1 text-xs font-bold text-black hover:bg-green-400 disabled:opacity-50"
            >
              + 추가
            </button>
            <p className="text-[10px] text-zinc-600">공백/-/, 로 구분. Am Dm7 G7 Cmaj7</p>
          </div>

          {/* Chord input */}
          <ChordInput
            onAddChord={handleAddChord}
            currentBeat={cursorBeat}
            onCursorChange={setCursorBeat}
            maxBeat={measures * 4}
          />

          {/* Velocity (강약) — only when notes are selected */}
          {selectedIndices.length > 0 && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">강약 (벨로시티)</p>
                <span className="text-xs font-bold text-green-400">{selectedVelocity}</span>
              </div>
              <input
                type="range" min={1} max={127} step={1} value={selectedVelocity}
                onChange={e => setSelectedVelocity(Number(e.target.value))}
                onPointerUp={() => commitNotes()}
                className="w-full accent-green-500"
              />
              <p className="text-[10px] text-zinc-600">선택한 {selectedIndices.length}개 노트의 세기 (1~127)</p>
            </div>
          )}

          {/* Key & Scale */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">키 / 스케일</p>
              {keyRoot !== null && (
                <button onClick={() => setKeyRoot(null)} className="text-[10px] text-zinc-500 hover:text-white">끄기</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {ROOT_NOTES.map((n, i) => (
                <button key={n} onClick={() => setKeyRoot(i)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    keyRoot === i ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >{n}</button>
              ))}
            </div>
            <select
              value={keyScaleIdx}
              onChange={e => setKeyScaleIdx(Number(e.target.value))}
              disabled={keyRoot === null}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 disabled:opacity-50"
            >
              {SCALES.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
            </select>
            {keyRoot !== null && (
              <p className="text-[10px] text-zinc-600">
                {ROOT_NOTES[keyRoot]} {SCALES[keyScaleIdx].name} — 스케일 안의 음은 초록 배경
              </p>
            )}
          </div>

          {/* Transpose */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">트랜스포즈</p>
            <div className="flex gap-1">
              <button onClick={() => transpose(-12)} title="옥타브 아래 (Shift+↓)"
                className="flex flex-1 items-center justify-center gap-0.5 rounded bg-zinc-800 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                <ChevronsDown size={12} /> 옥
              </button>
              <button onClick={() => transpose(-1)} title="반음 아래 (↓)"
                className="flex flex-1 items-center justify-center gap-0.5 rounded bg-zinc-800 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                <ChevronDown size={12} /> 반
              </button>
              <button onClick={() => transpose(1)} title="반음 위 (↑)"
                className="flex flex-1 items-center justify-center gap-0.5 rounded bg-zinc-800 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                <ChevronUp size={12} /> 반
              </button>
              <button onClick={() => transpose(12)} title="옥타브 위 (Shift+↑)"
                className="flex flex-1 items-center justify-center gap-0.5 rounded bg-zinc-800 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                <ChevronsUp size={12} /> 옥
              </button>
            </div>
            <p className="text-[10px] text-zinc-600">선택 노트 없으면 전체 이동</p>
          </div>

          <button
            onClick={() => {
              if (confirm('모든 노트를 지울까요?')) {
                setNotes([])
                notesHistory.commit()
                setCursorBeat(0)
              }
            }}
            className="rounded border border-zinc-700 py-1.5 text-xs text-zinc-500 hover:border-red-500 hover:text-red-400"
          >
            노트 전체 지우기
          </button>

          {/* Tags */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">분위기</p>
            <div className="flex flex-wrap gap-1">
              {MOOD_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${tags.includes(tag) ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >{tag}</button>
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 pt-1">활용도</p>
            <div className="flex flex-wrap gap-1">
              {USE_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${tags.includes(tag) ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >{tag}</button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
          <PlaybackControls notes={notes} bpm={bpm} onBpmChange={setBpm} onPlayheadChange={setPlayheadBeat} />
          <div className="flex-1 overflow-auto">
            <PianoRoll
              notes={notes}
              measures={measures}
              onChange={setNotes}
              onCommit={notesHistory.commit}
              snap={snap}
              tool={tool}
              cursorBeat={cursorBeat}
              onCursorChange={setCursorBeat}
              playheadBeat={playheadBeat}
              onSelectionChange={setSelectedIndices}
              keyRoot={keyRoot}
              keyScaleIntervals={keyRoot !== null ? SCALES[keyScaleIdx].intervals : null}
            />
          </div>
          <p className="text-xs text-zinc-600">
            {tool === 'draw'
              ? '클릭: 노트 추가 | 우클릭: 삭제 | 끝 드래그: 길이 조절 | 노트 드래그: 이동'
              : '클릭: 선택 | 드래그: 다중 선택 | Shift+클릭: 선택 추가 | Delete: 삭제 | 상단 눈금자 클릭: 커서 이동'}
            <span className="ml-2 text-zinc-700">· Ctrl+C/V/X/A · Ctrl+Z/Y · Space · Ctrl+S</span>
          </p>
        </main>
      </div>
    </div>
  )
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-zinc-400">로딩 중...</div>}>
      <EditorContent />
    </Suspense>
  )
}
