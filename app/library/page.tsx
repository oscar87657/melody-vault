'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Pattern, MOOD_TAGS, USE_TAGS } from '@/types'
import { downloadMidi } from '@/lib/midi'
import { Plus, Download, Music, LogOut, Search, Pencil } from 'lucide-react'
import dynamic from 'next/dynamic'

const PianoRoll = dynamic(() => import('@/components/piano-roll/PianoRoll'), { ssr: false })

export default function LibraryPage() {
  const router = useRouter()
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterType, setFilterType] = useState<'all' | 'chord' | 'melody'>('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<Pattern | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: { id: string } | null } }) => {
      if (!user) { router.push('/auth'); return }
      supabase.from('patterns').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
        .then(({ data }: { data: Pattern[] | null }) => { setPatterns(data ?? []); setLoading(false) })
    })
  }, [router])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const toggleFilterTag = (tag: string) => {
    setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const filtered = patterns.filter(p => {
    if (filterType !== 'all' && p.type !== filterType) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterTags.length > 0 && !filterTags.every(t => p.tags.includes(t))) return false
    return true
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <div className="flex items-center gap-2">
            <Music size={20} className="text-green-400" />
            <span className="font-bold text-lg">Melody Vault</span>
          </div>

          <div className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5">
            <Search size={14} className="text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="패턴 검색..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => router.push('/editor?type=chord')}
              className="flex items-center gap-1.5 rounded bg-green-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-green-400"
            >
              <Plus size={16} /> 새 패턴
            </button>
            <button onClick={handleLogout} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl flex gap-4 p-4">
        {/* Filters sidebar */}
        <aside className="w-48 shrink-0 space-y-4">
          <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase text-zinc-500">타입</p>
            {(['all', 'chord', 'melody'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors ${
                  filterType === t ? 'bg-green-500 text-black font-medium' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {t === 'all' ? '전체' : t === 'chord' ? '코드' : '멜로디'}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase text-zinc-500">분위기</p>
            {MOOD_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleFilterTag(tag)}
                className={`block w-full rounded px-2 py-0.5 text-left text-xs transition-colors ${
                  filterTags.includes(tag) ? 'bg-purple-500/30 text-purple-300' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase text-zinc-500">활용도</p>
            {USE_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleFilterTag(tag)}
                className={`block w-full rounded px-2 py-0.5 text-left text-xs transition-colors ${
                  filterTags.includes(tag) ? 'bg-blue-500/30 text-blue-300' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {filterTags.length > 0 && (
            <button onClick={() => setFilterTags([])} className="w-full text-xs text-zinc-500 hover:text-white">
              필터 초기화
            </button>
          )}
        </aside>

        {/* Pattern grid */}
        <main className="flex-1">
          {loading ? (
            <div className="text-center text-zinc-500 py-20">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-zinc-600">
              <Music size={40} />
              <p>저장된 패턴이 없어요.</p>
              <button
                onClick={() => router.push('/editor')}
                className="rounded bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
              >
                첫 패턴 만들기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map(pattern => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  onEdit={() => router.push(`/editor?id=${pattern.id}`)}
                  onPreview={() => setPreview(preview?.id === pattern.id ? null : pattern)}
                  onDownload={() => downloadMidi(pattern)}
                  isPreviewOpen={preview?.id === pattern.id}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
          <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900 p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-lg">{preview.name}</h2>
                <p className="text-xs text-zinc-500">{preview.bpm} BPM · {preview.measures}마디</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <PianoRoll notes={preview.notes} measures={preview.measures} onChange={() => {}} isReadOnly />
          </div>
        </div>
      )}
    </div>
  )
}

function PatternCard({
  pattern, onEdit, onPreview, onDownload, isPreviewOpen
}: {
  pattern: Pattern
  onEdit: () => void
  onPreview: () => void
  onDownload: () => void
  isPreviewOpen: boolean
}) {
  const moodTags = pattern.tags.filter(t => MOOD_TAGS.includes(t))
  const useTags = pattern.tags.filter(t => USE_TAGS.includes(t))

  return (
    <div className={`rounded-xl border transition-colors ${isPreviewOpen ? 'border-green-500' : 'border-zinc-800 hover:border-zinc-600'} bg-zinc-900 p-4 space-y-3`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{pattern.name}</p>
          <p className="text-xs text-zinc-500">
            {pattern.type === 'chord' ? '코드' : '멜로디'} · {pattern.bpm} BPM · {pattern.measures}마디
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <Pencil size={14} />
          </button>
          <button onClick={onDownload} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Mini piano roll preview */}
      <button
        onClick={onPreview}
        className="w-full overflow-hidden rounded-lg bg-zinc-950 h-16 flex items-center justify-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors border border-zinc-800"
      >
        {pattern.notes.length > 0
          ? <MiniPreview notes={pattern.notes} measures={pattern.measures} />
          : '노트 없음'}
      </button>

      {/* Tags */}
      {pattern.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {moodTags.map(t => (
            <span key={t} className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">{t}</span>
          ))}
          {useTags.map(t => (
            <span key={t} className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniPreview({ notes, measures }: { notes: Pattern['notes'], measures: number }) {
  const totalBeats = measures * 4
  const pitches = notes.map(n => n.pitch)
  const minP = Math.min(...pitches)
  const maxP = Math.max(...pitches)
  const range = Math.max(maxP - minP, 12)

  return (
    <svg viewBox={`0 0 ${totalBeats * 20} ${range + 4}`} className="w-full h-full" preserveAspectRatio="none">
      {notes.map((note, i) => (
        <rect
          key={i}
          x={note.startBeat * 20}
          y={range - (note.pitch - minP) + 2}
          width={Math.max(note.duration * 20 - 1, 2)}
          height={3}
          rx={1}
          fill="#4ade80"
          opacity={0.8}
        />
      ))}
    </svg>
  )
}
