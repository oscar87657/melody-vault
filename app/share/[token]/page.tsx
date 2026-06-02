'use client'

import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import { Pattern, MOOD_TAGS, USE_TAGS } from '@/types'
import { downloadMidi, downloadWav } from '@/lib/midi'
import { Music, Download } from 'lucide-react'
import PlaybackControls from '@/components/piano-roll/PlaybackControls'

const PianoRoll = dynamic(() => import('@/components/piano-roll/PianoRoll'), { ssr: false })

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [pattern, setPattern] = useState<Pattern | null>(null)
  const [loading, setLoading] = useState(true)
  const [bpm, setBpm] = useState(120)
  const [wavBusy, setWavBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('patterns').select('*').eq('share_token', token).single()
      .then(({ data, error }: { data: Pattern | null; error: { message: string } | null }) => {
        if (error) console.error('공유 패턴 조회 실패:', error.message)
        if (data) { setPattern(data); setBpm(data.bpm) }
        setLoading(false)
      }, (err: unknown) => {
        console.error('공유 패턴 조회 실패:', err)
        setLoading(false)
      })
  }, [token])

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">불러오는 중...</div>
  }

  if (!pattern) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
        <Music size={40} />
        <p>공유 링크가 유효하지 않거나 만료되었습니다.</p>
      </div>
    )
  }

  const moodTags = pattern.tags.filter(t => MOOD_TAGS.includes(t))
  const useTags = pattern.tags.filter(t => USE_TAGS.includes(t))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Music size={20} className="text-green-400" />
          <span className="text-sm font-semibold text-zinc-400">Melody Vault · 공유 패턴</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{pattern.name}</h1>
          <p className="text-sm text-zinc-500">
            {pattern.type === 'chord' ? '코드' : '멜로디'} · {pattern.bpm} BPM · {pattern.measures}마디
          </p>
          {(moodTags.length + useTags.length) > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {moodTags.map(t => (
                <span key={t} className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">{t}</span>
              ))}
              {useTags.map(t => (
                <span key={t} className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">{t}</span>
              ))}
            </div>
          )}
        </div>

        <PlaybackControls notes={pattern.notes} bpm={bpm} onBpmChange={setBpm} />

        <div className="overflow-auto">
          <PianoRoll notes={pattern.notes} measures={pattern.measures} onChange={() => {}} isReadOnly />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => downloadMidi(pattern)}
            className="flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            <Download size={14} /> MIDI 다운로드
          </button>
          <button
            onClick={async () => {
              setWavBusy(true)
              try { await downloadWav(pattern) }
              catch (err) { console.error(err); alert('WAV 렌더링 실패') }
              finally { setWavBusy(false) }
            }}
            disabled={wavBusy}
            className="flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            <Download size={14} /> {wavBusy ? '렌더링...' : 'WAV 다운로드'}
          </button>
        </div>

        <p className="pt-4 text-xs text-zinc-600">
          이 페이지는 읽기 전용입니다. 편집하려면 패턴 소유자에게 문의하세요.
        </p>
      </main>
    </div>
  )
}
