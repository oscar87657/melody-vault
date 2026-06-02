'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Pattern, Folder, MOOD_TAGS, USE_TAGS } from '@/types'
import { downloadMidi, downloadWav, importMidiFile, effectiveType } from '@/lib/midi'
import { buildSamplePatterns } from '@/lib/sample-patterns'
import { Plus, Download, Music, LogOut, Search, Pencil, Copy, Upload, Share2, Folder as FolderIcon, FolderPlus, Sparkles, Trash2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import PlaybackControls from '@/components/piano-roll/PlaybackControls'

const PianoRoll = dynamic(() => import('@/components/piano-roll/PianoRoll'), { ssr: false })

export default function LibraryPage() {
  const router = useRouter()
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterType, setFilterType] = useState<'all' | 'chord' | 'melody' | 'drum'>('all')
  const [filterFolder, setFilterFolder] = useState<string | 'all' | 'none'>('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<Pattern | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: { id: string } | null } }) => {
      if (!user) { router.push('/auth'); return }
      Promise.all([
        supabase.from('patterns').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('folders').select('*').eq('user_id', user.id).order('name'),
      ]).then(([pats, fols]) => {
        const pd = pats as { data: Pattern[] | null; error: { message: string } | null }
        const fd = fols as { data: Folder[] | null; error: { message: string } | null }
        if (pd.error) console.error('패턴 목록 실패:', pd.error.message)
        if (fd.error) console.error('폴더 목록 실패:', fd.error.message)
        setPatterns(pd.data ?? [])
        setFolders(fd.data ?? [])
        setLoading(false)
      }, (err: unknown) => {
        console.error('데이터 로드 실패:', err)
        setLoading(false)
      })
    }, (err: unknown) => {
      console.error('인증 확인 실패:', err)
      setLoading(false)
    })
  }, [router])

  const handleCreateFolder = async () => {
    const name = prompt('새 폴더 이름:')?.trim()
    if (!name) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('folders').insert({ user_id: user.id, name }).select().single()
    if (error) { alert('폴더 생성 실패: ' + error.message); return }
    if (data) setFolders(prev => [...prev, data as Folder].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('이 폴더를 삭제할까요? 안의 패턴은 폴더 없음으로 이동됩니다.')) return
    const supabase = createClient()
    const { error } = await supabase.from('folders').delete().eq('id', folderId)
    if (error) { alert('폴더 삭제 실패: ' + error.message); return }
    setFolders(prev => prev.filter(f => f.id !== folderId))
    setPatterns(prev => prev.map(p => p.folder_id === folderId ? { ...p, folder_id: null } : p))
    if (filterFolder === folderId) setFilterFolder('all')
  }

  const handleDeletePattern = async (p: Pattern) => {
    if (!confirm(`"${p.name}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return
    const supabase = createClient()
    const { error } = await supabase.from('patterns').delete().eq('id', p.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setPatterns(prev => prev.filter(x => x.id !== p.id))
    if (preview?.id === p.id) setPreview(null)
  }

  const handleMoveToFolder = async (patternId: string, folderId: string | null) => {
    const supabase = createClient()
    const { error } = await supabase.from('patterns').update({ folder_id: folderId }).eq('id', patternId)
    if (error) { alert('이동 실패: ' + error.message); return }
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, folder_id: folderId } : p))
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleImport = useCallback(async (file: File) => {
    setImporting(true)
    try {
      const data = await importMidiFile(file)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      const now = new Date().toISOString()
      const { data: inserted, error } = await supabase
        .from('patterns')
        .insert({ user_id: user.id, ...data, created_at: now, updated_at: now })
        .select()
        .single()
      if (error) { console.error('MIDI 임포트 실패:', error.message); alert('MIDI 임포트 실패: ' + error.message); return }
      if (inserted) setPatterns(prev => [inserted as Pattern, ...prev])
    } catch (err) {
      console.error('MIDI 파싱 실패:', err)
      alert(`"${file.name}" 파일을 읽을 수 없습니다.`)
    } finally {
      setImporting(false)
    }
  }, [router])

  // Global drag&drop for .mid files
  useEffect(() => {
    let counter = 0
    const isFileDrag = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const onDragEnter = (e: DragEvent) => { if (!isFileDrag(e)) return; counter++; setDragOver(true) }
    const onDragLeave = () => { counter--; if (counter <= 0) { counter = 0; setDragOver(false) } }
    const onDragOver = (e: DragEvent) => { if (isFileDrag(e)) e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      counter = 0
      setDragOver(false)
      const files = Array.from(e.dataTransfer?.files ?? []).filter(f => /\.midi?$/i.test(f.name))
      files.forEach(handleImport)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleImport])

  const [seeding, setSeeding] = useState(false)
  const handleAddSamples = async () => {
    const samples = buildSamplePatterns()
    if (!confirm(`샘플 패턴 ${samples.length}개를 라이브러리에 추가할까요?\n(코드 5 + 멜로디 3 + 드럼 4)`)) return
    setSeeding(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      const now = new Date().toISOString()
      const toRow = (s: ReturnType<typeof buildSamplePatterns>[number]) => ({
        ...s,
        user_id: user.id,
        created_at: now,
        updated_at: now,
      })

      // drum 타입은 DB 마이그레이션 필요. 코드/멜로디부터 먼저 넣고 drum은 따로 시도해서
      // 실패해도 코드/멜로디는 보존되도록 분리한다.
      const nonDrum = samples.filter(s => s.type !== 'drum')
      const drum = samples.filter(s => s.type === 'drum')

      const { data: nonData, error: nonErr } = await supabase
        .from('patterns').insert(nonDrum.map(toRow)).select()
      if (nonErr) {
        alert('샘플 추가 실패: ' + nonErr.message)
        return
      }
      if (nonData) setPatterns(prev => [...(nonData as Pattern[]), ...prev])

      let { data: drumData, error: drumErr } = await supabase
        .from('patterns').insert(drum.map(toRow)).select()
      // DB가 'drum' 타입을 거부하면 'melody'로 저장 — UI는 노트로 자동 인식
      if (drumErr?.message?.includes('patterns_type_check')) {
        const retry = await supabase.from('patterns')
          .insert(drum.map(s => ({ ...toRow(s), type: 'melody' as const })))
          .select()
        drumData = retry.data
        drumErr = retry.error
      }
      if (drumErr) {
        alert(`드럼 패턴 추가 실패: ${drumErr.message}`)
        return
      }
      if (drumData) setPatterns(prev => [...(drumData as Pattern[]), ...prev])
    } finally {
      setSeeding(false)
    }
  }

  const handleShare = async (p: Pattern) => {
    const supabase = createClient()
    let token = p.share_token
    if (!token) {
      token = crypto.randomUUID()
      const { error } = await supabase.from('patterns').update({ share_token: token }).eq('id', p.id)
      if (error) { console.error('공유 토큰 생성 실패:', error.message); alert('공유 링크 생성 실패: ' + error.message); return }
      setPatterns(prev => prev.map(x => x.id === p.id ? { ...x, share_token: token } : x))
    }
    const url = `${window.location.origin}/share/${token}`
    try {
      await navigator.clipboard.writeText(url)
      alert(`공유 링크가 복사되었습니다:\n${url}`)
    } catch {
      prompt('공유 링크 (복사하세요):', url)
    }
  }

  const handleDuplicate = async (p: Pattern) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('patterns')
      .insert({
        user_id: user.id,
        name: `${p.name} (복사본)`,
        type: p.type,
        tags: p.tags,
        notes: p.notes,
        bpm: p.bpm,
        measures: p.measures,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()
    if (error) { console.error('복제 실패:', error.message); return }
    if (data) setPatterns(prev => [data as Pattern, ...prev])
  }

  const toggleFilterTag = (tag: string) => {
    setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  const filtered = patterns.filter(p => {
    if (filterType !== 'all' && effectiveType(p) !== filterType) return false
    if (filterFolder === 'none' && p.folder_id) return false
    if (filterFolder !== 'all' && filterFolder !== 'none' && p.folder_id !== filterFolder) return false
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
              onClick={handleAddSamples}
              disabled={seeding}
              title="샘플 패턴 12개 추가 (코드/멜로디/드럼)"
              className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              <Sparkles size={14} /> {seeding ? '추가 중...' : '샘플 추가'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title="MIDI 파일 임포트 (드래그&드롭도 가능)"
              className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              <Upload size={14} /> {importing ? '임포트 중...' : 'MIDI 임포트'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mid,.midi,audio/midi"
              multiple
              hidden
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                files.forEach(handleImport)
                e.target.value = ''
              }}
            />
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
          {/* Folders */}
          <div className="rounded-lg border border-zinc-800 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-zinc-500">폴더</p>
              <button onClick={handleCreateFolder} title="새 폴더" className="text-zinc-500 hover:text-white">
                <FolderPlus size={12} />
              </button>
            </div>
            <button onClick={() => setFilterFolder('all')}
              className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors ${filterFolder === 'all' ? 'bg-green-500 text-black font-medium' : 'text-zinc-400 hover:bg-zinc-800'}`}>
              전체
            </button>
            <button onClick={() => setFilterFolder('none')}
              className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors ${filterFolder === 'none' ? 'bg-green-500 text-black font-medium' : 'text-zinc-400 hover:bg-zinc-800'}`}>
              (폴더 없음)
            </button>
            {folders.map(f => (
              <div key={f.id} className="group flex items-center gap-1">
                <button onClick={() => setFilterFolder(f.id)}
                  className={`flex flex-1 items-center gap-1 rounded px-2 py-1 text-left text-sm transition-colors ${filterFolder === f.id ? 'bg-green-500 text-black font-medium' : 'text-zinc-400 hover:bg-zinc-800'}`}>
                  <FolderIcon size={12} /> {f.name}
                </button>
                <button onClick={() => handleDeleteFolder(f.id)} className="opacity-0 transition-opacity group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-xs px-1">×</button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase text-zinc-500">타입</p>
            {(['all', 'chord', 'melody', 'drum'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors ${
                  filterType === t ? 'bg-green-500 text-black font-medium' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {t === 'all' ? '전체' : t === 'chord' ? '코드' : t === 'melody' ? '멜로디' : '드럼'}
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
              <p>{patterns.length === 0 ? '저장된 패턴이 없어요.' : '필터에 맞는 패턴이 없어요.'}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push('/editor')}
                  className="rounded bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400"
                >
                  첫 패턴 만들기
                </button>
                {patterns.length === 0 && (
                  <button
                    onClick={handleAddSamples}
                    disabled={seeding}
                    className="flex items-center gap-1.5 rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
                  >
                    <Sparkles size={14} /> {seeding ? '추가 중...' : '샘플 12개 가져오기'}
                  </button>
                )}
              </div>
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
                  onDownloadWav={async () => {
                    try { await downloadWav(pattern) }
                    catch (err) { console.error(err); alert('WAV 렌더링 실패') }
                  }}
                  onDuplicate={() => handleDuplicate(pattern)}
                  onShare={() => handleShare(pattern)}
                  onDelete={() => handleDeletePattern(pattern)}
                  folders={folders}
                  onMoveToFolder={(fid) => handleMoveToFolder(pattern.id, fid)}
                  isPreviewOpen={preview?.id === pattern.id}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Drag&drop overlay */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-2xl border-4 border-dashed border-green-400 bg-zinc-900/80 px-12 py-10 text-center">
            <Upload size={48} className="mx-auto mb-3 text-green-400" />
            <p className="text-xl font-bold text-green-400">MIDI 파일을 여기에 놓으세요</p>
            <p className="mt-1 text-xs text-zinc-400">.mid / .midi 파일만 처리됩니다</p>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && <PreviewModal key={preview.id} pattern={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function PreviewModal({ pattern, onClose }: { pattern: Pattern; onClose: () => void }) {
  const [bpm, setBpm] = useState(pattern.bpm)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const dispType = effectiveType(pattern)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-4xl max-h-[90vh] flex-col rounded-xl border border-zinc-700 bg-zinc-900 p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold text-lg">{pattern.name}</h2>
            <p className="text-xs text-zinc-500">
              {dispType === 'chord' ? '코드' : dispType === 'drum' ? '드럼' : '멜로디'} · {pattern.bpm} BPM · {pattern.measures}마디
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">✕</button>
        </div>

        <div className="mb-3 flex-shrink-0">
          <PlaybackControls
            notes={pattern.notes}
            bpm={bpm}
            onBpmChange={setBpm}
            onPlayheadChange={setPlayhead}
            isDrum={dispType === 'drum'}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-800">
          <PianoRoll
            notes={pattern.notes}
            measures={pattern.measures}
            onChange={() => {}}
            isReadOnly
            isDrum={dispType === 'drum'}
            playheadBeat={playhead}
          />
        </div>

        <p className="mt-2 flex-shrink-0 text-[10px] text-zinc-600">
          Space: 재생/정지 · ESC: 닫기
        </p>
      </div>
    </div>
  )
}

function PatternCard({
  pattern, onEdit, onPreview, onDownload, onDownloadWav, onDuplicate, onShare, onDelete,
  folders, onMoveToFolder, isPreviewOpen
}: {
  pattern: Pattern
  onEdit: () => void
  onPreview: () => void
  onDownload: () => void
  onDownloadWav: () => void
  onDuplicate: () => void
  onShare: () => void
  onDelete: () => void
  folders: Folder[]
  onMoveToFolder: (folderId: string | null) => void
  isPreviewOpen: boolean
}) {
  const [busy, setBusy] = useState(false)
  const moodTags = pattern.tags.filter(t => MOOD_TAGS.includes(t))
  const useTags = pattern.tags.filter(t => USE_TAGS.includes(t))
  const dispType = effectiveType(pattern)

  return (
    <div className={`rounded-xl border transition-colors ${isPreviewOpen ? 'border-green-500' : 'border-zinc-800 hover:border-zinc-600'} bg-zinc-900 p-4 space-y-3`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{pattern.name}</p>
          <p className="text-xs text-zinc-500">
            {dispType === 'chord' ? '코드' : dispType === 'drum' ? '드럼' : '멜로디'} · {pattern.bpm} BPM · {pattern.measures}마디
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} title="편집" className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <Pencil size={14} />
          </button>
          <button onClick={onDuplicate} title="복제" className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <Copy size={14} />
          </button>
          <button onClick={onDownload} title="MIDI 다운로드" className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <Download size={14} />
          </button>
          <button
            onClick={async () => { setBusy(true); try { await onDownloadWav() } finally { setBusy(false) } }}
            disabled={busy}
            title="WAV 다운로드 (오디오)"
            className="rounded p-1 text-[9px] font-bold text-zinc-500 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          >
            {busy ? '...' : 'WAV'}
          </button>
          <button onClick={onShare} title="공유 링크 복사"
            className={`rounded p-1 hover:bg-zinc-800 hover:text-white ${pattern.share_token ? 'text-green-400' : 'text-zinc-500'}`}>
            <Share2 size={14} />
          </button>
          <button onClick={onDelete} title="삭제"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400">
            <Trash2 size={14} />
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

      {/* Folder selector */}
      <select
        value={pattern.folder_id ?? ''}
        onChange={e => onMoveToFolder(e.target.value || null)}
        className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 focus:border-zinc-600 focus:outline-none"
      >
        <option value="">(폴더 없음)</option>
        {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
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
