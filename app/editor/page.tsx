'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Note, Pattern, PatternType, MOOD_TAGS, USE_TAGS } from '@/types'
import { createClient } from '@/lib/supabase'
import { downloadMidi } from '@/lib/midi'
import { ChevronLeft, Download, Save, Trash2, Pencil, MousePointer2 } from 'lucide-react'
import ChordInput from '@/components/piano-roll/ChordInput'
import PlaybackControls from '@/components/piano-roll/PlaybackControls'
import { type Tool } from '@/components/piano-roll/PianoRoll'

const PianoRoll = dynamic(() => import('@/components/piano-roll/PianoRoll'), { ssr: false })

const SNAP_OPTIONS = [
  { label: '1/16', value: 0.25 },
  { label: '1/8',  value: 0.5 },
  { label: '1/4',  value: 1 },
]

function EditorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const patternId = searchParams.get('id')
  const defaultType = (searchParams.get('type') as PatternType) ?? 'melody'

  const [name, setName] = useState('새 패턴')
  const [type, setType] = useState<PatternType>(defaultType)
  const [notes, setNotes] = useState<Note[]>([])
  const [bpm, setBpm] = useState(120)
  const [measures, setMeasures] = useState(type === 'chord' ? 4 : 2)
  const [tags, setTags] = useState<string[]>([])
  const [snap, setSnap] = useState(0.25)
  const [cursorBeat, setCursorBeat] = useState(0)
  const [tool, setTool] = useState<Tool>('draw')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!patternId)

  useEffect(() => {
    if (!patternId) return
    const supabase = createClient()
    supabase.from('patterns').select('*').eq('id', patternId).single()
      .then(({ data }: { data: Pattern | null }) => {
        if (data) {
          setName(data.name); setType(data.type); setNotes(data.notes)
          setBpm(data.bpm); setMeasures(data.measures); setTags(data.tags)
        }
        setLoading(false)
      })
  }, [patternId])

  const handleAddChord = useCallback((chordNotes: Note[], duration: number) => {
    setNotes(prev => [...prev, ...chordNotes])
    setCursorBeat(prev => prev + duration)
  }, [])

  const toggleTag = (tag: string) =>
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const payload = { name, type, notes, bpm, measures, tags, user_id: user.id, updated_at: new Date().toISOString() }
    if (patternId) {
      await supabase.from('patterns').update(payload).eq('id', patternId)
    } else {
      const { data } = await supabase.from('patterns').insert({ ...payload, created_at: new Date().toISOString() }).select().single()
      if (data) router.replace(`/editor?id=${data.id}`)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!patternId || !confirm('이 패턴을 삭제할까요?')) return
    const supabase = createClient()
    await supabase.from('patterns').delete().eq('id', patternId)
    router.push('/library')
  }

  const handleDownloadMidi = () => {
    const pattern: Pattern = { id: patternId ?? 'new', user_id: '', name, type, notes, bpm, measures, tags, created_at: '', updated_at: '' }
    downloadMidi(pattern)
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
        <div className="flex gap-2">
          {patternId && (
            <button onClick={handleDelete} className="rounded p-1.5 text-red-500 hover:bg-zinc-800">
              <Trash2 size={16} />
            </button>
          )}
          <button onClick={handleDownloadMidi} className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <Download size={14} /> MIDI
          </button>
          <button
            onClick={handleSave} disabled={saving}
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

          {/* Chord input */}
          <ChordInput
            onAddChord={handleAddChord}
            currentBeat={cursorBeat}
            onCursorChange={setCursorBeat}
            maxBeat={measures * 4}
          />

          <button
            onClick={() => { if (confirm('모든 노트를 지울까요?')) { setNotes([]); setCursorBeat(0) } }}
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
          <PlaybackControls notes={notes} bpm={bpm} onBpmChange={setBpm} />
          <div className="flex-1 overflow-auto">
            <PianoRoll
              notes={notes}
              measures={measures}
              onChange={setNotes}
              snap={snap}
              tool={tool}
              cursorBeat={cursorBeat}
              onCursorChange={setCursorBeat}
            />
          </div>
          <p className="text-xs text-zinc-600">
            {tool === 'draw'
              ? '클릭: 노트 추가 | 우클릭: 삭제 | 끝 드래그: 길이 조절 | 노트 드래그: 이동'
              : '클릭: 선택 | 드래그: 다중 선택 | Shift+클릭: 선택 추가 | Delete: 삭제 | 상단 눈금자 클릭: 커서 이동'}
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
