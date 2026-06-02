'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as Tone from 'tone'
import { Note } from '@/types'
import { Play, Square, Volume2, Loader2, Repeat } from 'lucide-react'

// ─── Instrument definitions ────────────────────────────────────────────────

const SALAMANDER = 'https://tonejs.github.io/audio/salamander/'
const GLEITZ     = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'
const DRUM_KIT_URL = 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/'

// Notes sampled every minor-3rd per octave (C Eb Gb A), using flat names for gleitz
function gleitzNotes(startOct: number, endOct: number): Record<string, string> {
  const result: Record<string, string> = {}
  for (let o = startOct; o <= endOct; o++) {
    for (const n of ['C', 'Eb', 'Gb', 'A']) {
      result[`${n}${o}`] = `${n}${o}.mp3`
    }
  }
  return result
}

type InstrumentDef =
  | { kind: 'sampler'; label: string; group: string; baseUrl: string; urls: Record<string, string>; gainDb: number }
  | { kind: 'synth';   label: string; group: string; osc: string; env: { attack: number; decay: number; sustain: number; release: number }; gainDb: number }

const INSTRUMENTS: Record<string, InstrumentDef> = {
  // ── 건반
  piano: {
    kind: 'sampler', label: '그랜드 피아노', group: '건반',
    baseUrl: SALAMANDER, gainDb: 0,
    urls: {
      'A0':'A0.mp3','C1':'C1.mp3','D#1':'Ds1.mp3','F#1':'Fs1.mp3',
      'A1':'A1.mp3','C2':'C2.mp3','D#2':'Ds2.mp3','F#2':'Fs2.mp3',
      'A2':'A2.mp3','C3':'C3.mp3','D#3':'Ds3.mp3','F#3':'Fs3.mp3',
      'A3':'A3.mp3','C4':'C4.mp3','D#4':'Ds4.mp3','F#4':'Fs4.mp3',
      'A4':'A4.mp3','C5':'C5.mp3','D#5':'Ds5.mp3','F#5':'Fs5.mp3',
      'A5':'A5.mp3','C6':'C6.mp3','D#6':'Ds6.mp3','F#6':'Fs6.mp3',
      'A6':'A6.mp3','C7':'C7.mp3','D#7':'Ds7.mp3','F#7':'Fs7.mp3',
      'A7':'A7.mp3','C8':'C8.mp3',
    },
  },
  organ: {
    kind: 'sampler', label: '드로우바 오르간', group: '건반',
    baseUrl: `${GLEITZ}drawbar_organ-mp3/`, gainDb: -4,
    urls: gleitzNotes(2, 6),
  },
  // ── 기타
  guitar_steel: {
    kind: 'sampler', label: '스틸 기타', group: '기타',
    baseUrl: `${GLEITZ}acoustic_guitar_steel-mp3/`, gainDb: -3,
    urls: gleitzNotes(2, 5),
  },
  guitar_nylon: {
    kind: 'sampler', label: '나일론 기타', group: '기타',
    baseUrl: `${GLEITZ}acoustic_guitar_nylon-mp3/`, gainDb: -3,
    urls: gleitzNotes(2, 5),
  },
  // ── 현악기
  strings: {
    kind: 'sampler', label: '스트링 앙상블', group: '현악기',
    baseUrl: `${GLEITZ}string_ensemble_1-mp3/`, gainDb: -5,
    urls: gleitzNotes(2, 6),
  },
  violin: {
    kind: 'sampler', label: '바이올린', group: '현악기',
    baseUrl: `${GLEITZ}violin-mp3/`, gainDb: -5,
    urls: gleitzNotes(3, 6),
  },
  cello: {
    kind: 'sampler', label: '첼로', group: '현악기',
    baseUrl: `${GLEITZ}cello-mp3/`, gainDb: -4,
    urls: gleitzNotes(2, 5),
  },
  // ── 관악기
  flute: {
    kind: 'sampler', label: '플루트', group: '관악기',
    baseUrl: `${GLEITZ}flute-mp3/`, gainDb: -6,
    urls: gleitzNotes(4, 7),
  },
  clarinet: {
    kind: 'sampler', label: '클라리넷', group: '관악기',
    baseUrl: `${GLEITZ}clarinet-mp3/`, gainDb: -5,
    urls: gleitzNotes(3, 6),
  },
  trumpet: {
    kind: 'sampler', label: '트럼펫', group: '관악기',
    baseUrl: `${GLEITZ}trumpet-mp3/`, gainDb: -5,
    urls: gleitzNotes(3, 6),
  },
  // ── 타악기
  xylophone: {
    kind: 'sampler', label: '실로폰', group: '타악기',
    baseUrl: `${GLEITZ}xylophone-mp3/`, gainDb: -4,
    urls: gleitzNotes(3, 6),
  },
  // ── 신스 (합성)
  pad: {
    kind: 'synth', label: '신스 패드', group: '신스',
    osc: 'sawtooth', gainDb: -6,
    env: { attack: 0.5, decay: 0.2, sustain: 0.8, release: 1.5 },
  },
  lead: {
    kind: 'synth', label: '신스 리드', group: '신스',
    osc: 'square', gainDb: -8,
    env: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
  },
}

const GROUPS = ['건반', '기타', '현악기', '관악기', '타악기', '신스']

// ─── Build Tone node ────────────────────────────────────────────────────────

type AnyInstrument = Tone.PolySynth | Tone.Sampler

const LOAD_TIMEOUT_MS = 12000

function buildInstrument(
  key: string,
  output: Tone.ToneAudioNode,
  onReady: () => void,
): AnyInstrument {
  const def = INSTRUMENTS[key]

  if (def.kind === 'synth') {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: def.osc as OscillatorType },
      envelope: def.env,
    } as unknown as Tone.SynthOptions)
    synth.connect(output)
    setTimeout(onReady, 0)
    return synth
  }

  // sampler with timeout fallback
  let loaded = false
  const timer = setTimeout(() => {
    if (!loaded) { loaded = true; onReady() }
  }, LOAD_TIMEOUT_MS)

  const sampler = new Tone.Sampler({
    urls: def.urls,
    baseUrl: def.baseUrl,
    onload: () => {
      if (!loaded) { loaded = true; clearTimeout(timer); onReady() }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).connect(output)

  return sampler
}

// ─── Component ──────────────────────────────────────────────────────────────

interface PlaybackControlsProps {
  notes: Note[]
  bpm: number
  onBpmChange: (bpm: number) => void
  onPlayheadChange?: (beat: number | null) => void
  isDrum?: boolean
}

export default function PlaybackControls({ notes, bpm, onBpmChange, onPlayheadChange, isDrum = false }: PlaybackControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(-20)
  const [instrumentKey, setInstrumentKey] = useState('piano')
  const [loading, setLoading] = useState(true)
  const [isLoop, setIsLoop] = useState(false)
  const isLoopRef = useRef(isLoop)
  useEffect(() => { isLoopRef.current = isLoop }, [isLoop])
  const [isMetronome, setIsMetronome] = useState(false)
  const isMetronomeRef = useRef(isMetronome)
  useEffect(() => { isMetronomeRef.current = isMetronome }, [isMetronome])
  const metronomeRef = useRef<{ high: Tone.Synth; low: Tone.Synth } | null>(null)
  const drumKitRef = useRef<{
    sampler: Tone.Sampler           // kick / snare / hihat / 3 toms — real samples
    stick: Tone.MembraneSynth       // synth: side stick (no sample available)
    clap: Tone.NoiseSynth           // synth: hand clap
    clapFilter: Tone.Filter
    openHat: Tone.MetalSynth        // synth: open hi-hat (longer decay)
    crash: Tone.MetalSynth          // synth: crash 1/2
    ride: Tone.MetalSynth           // synth: ride (bell-ish)
  } | null>(null)
  const [drumLoading, setDrumLoading] = useState(false)

  const synthRef  = useRef<AnyInstrument | null>(null)
  const volRef    = useRef<Tone.Volume | null>(null)
  const limiterRef = useRef<Tone.Limiter | null>(null)

  // One-time setup: limiter + volume node
  useEffect(() => {
    const limiter = new Tone.Limiter(-2).toDestination()
    const vol     = new Tone.Volume(volume).connect(limiter)
    limiterRef.current = limiter
    volRef.current     = vol
    return () => { limiter.dispose(); vol.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap instrument
  useEffect(() => {
    if (!volRef.current) return
    Tone.getTransport().stop()
    Tone.getTransport().cancel()
    setIsPlaying(false)
    setLoading(true)

    const def = INSTRUMENTS[instrumentKey]
    // Apply per-instrument gain normalisation into the volume node
    if (volRef.current) volRef.current.volume.value = volume + def.gainDb

    const prev = synthRef.current
    synthRef.current = buildInstrument(instrumentKey, volRef.current, () => setLoading(false))
    setTimeout(() => prev?.dispose(), 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentKey])

  // Master volume (keep gain offset from instrument)
  useEffect(() => {
    if (!volRef.current) return
    const gainDb = INSTRUMENTS[instrumentKey]?.gainDb ?? 0
    volRef.current.volume.value = volume + gainDb
  }, [volume, instrumentKey])

  // Drum kit: build a real Sampler for kick/snare/hihat/toms when isDrum=true,
  // plus synthesised fallbacks for the drums Tone.js doesn't host (stick/clap/openHH/crash/ride).
  useEffect(() => {
    if (!isDrum || !limiterRef.current) return
    const out = limiterRef.current
    setDrumLoading(true)

    const sampler = new Tone.Sampler({
      urls: {
        'C2': 'kick.mp3',
        'D2': 'snare.mp3',
        'E2': 'hihat.mp3',
        'F2': 'tom1.mp3',
        'G2': 'tom2.mp3',
        'A2': 'tom3.mp3',
      },
      baseUrl: DRUM_KIT_URL,
      onload: () => setDrumLoading(false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).connect(out)

    const stick = new Tone.MembraneSynth({
      pitchDecay: 0.001, octaves: 1,
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
    }).connect(out)
    stick.volume.value = -10

    const clapFilter = new Tone.Filter({ frequency: 1200, type: 'bandpass', Q: 1.2 }).connect(out)
    const clap = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0, release: 0.05 },
    }).connect(clapFilter)
    clap.volume.value = -6

    const openHat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.35, release: 0.1 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
    }).connect(out)
    openHat.volume.value = -22

    const crash = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 1.2, release: 0.4 },
      harmonicity: 3.1, modulationIndex: 22, resonance: 2000, octaves: 2,
    }).connect(out)
    crash.volume.value = -18

    const ride = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.25, release: 0.1 },
      harmonicity: 8.5, modulationIndex: 18, resonance: 6000, octaves: 1,
    }).connect(out)
    ride.volume.value = -20

    drumKitRef.current = { sampler, stick, clap, clapFilter, openHat, crash, ride }

    return () => {
      sampler.dispose()
      stick.dispose()
      clap.dispose(); clapFilter.dispose()
      openHat.dispose(); crash.dispose(); ride.dispose()
      drumKitRef.current = null
      setDrumLoading(false)
    }
  }, [isDrum])

  useEffect(() => () => {
    Tone.getTransport().stop()
    Tone.getTransport().cancel()
    synthRef.current?.dispose()
    volRef.current?.dispose()
    limiterRef.current?.dispose()
  }, [])

  const stop = useCallback(() => {
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()
    transport.loop = false
    metronomeRef.current?.high.dispose()
    metronomeRef.current?.low.dispose()
    metronomeRef.current = null
    // drum kit lifecycle handled by its own useEffect (isDrum dependency)
    setIsPlaying(false)
    onPlayheadChange?.(null)
  }, [onPlayheadChange])

  // RAF playhead emit
  useEffect(() => {
    if (!isPlaying || !onPlayheadChange) return
    let raf = 0
    const tick = () => {
      const t = Tone.getTransport()
      if (t.state !== 'started') { onPlayheadChange(null); return }
      const spb = 60 / bpm
      onPlayheadChange(t.seconds / spb)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); onPlayheadChange(null) }
  }, [isPlaying, bpm, onPlayheadChange])

  const playRef = useRef<() => void>(() => {})

  // Space → play/stop toggle (when no input is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (
        ae.tagName === 'INPUT' ||
        ae.tagName === 'TEXTAREA' ||
        ae.tagName === 'SELECT' ||
        ae.isContentEditable
      )) return
      e.preventDefault()
      playRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const play = useCallback(async () => {
    if (isPlaying) { stop(); return }
    if (notes.length === 0) return
    await Tone.start()

    const transport = Tone.getTransport()
    transport.bpm.value = bpm
    transport.cancel()
    transport.stop()

    const spb = 60 / bpm
    const maxEnd = Math.max(...notes.map(n => n.startBeat + n.duration))

    if (isDrum && drumKitRef.current) {
      const { sampler, stick, clap, openHat, crash, ride } = drumKitRef.current

      notes.forEach(note => {
        transport.schedule((time) => {
          const p = note.pitch
          const v = Math.max(0.1, note.velocity / 127)
          try {
            // ── Real samples ─────────────────────────────────────
            // Kick (Acoustic / Bass Drum 1)
            if (p === 35 || p === 36) sampler.triggerAttackRelease('C2', '8n', time, v)
            // Snare (Acoustic / Electric)
            else if (p === 38 || p === 40) sampler.triggerAttackRelease('D2', '8n', time, v)
            // Closed / Pedal Hi-Hat — both use the same hihat sample
            else if (p === 42 || p === 44) sampler.triggerAttackRelease('E2', '8n', time, v * 0.8)
            // Floor toms (low) → tom1 sample (low pitched)
            else if (p === 41 || p === 43) sampler.triggerAttackRelease('F2', '8n', time, v * 0.9)
            // Low / low-mid toms → tom2 sample (mid pitched)
            else if (p === 45 || p === 47) sampler.triggerAttackRelease('G2', '8n', time, v * 0.9)
            // Hi-mid / high toms → tom3 sample (high pitched)
            else if (p === 48 || p === 50) sampler.triggerAttackRelease('A2', '8n', time, v * 0.9)
            // ── Synthesised fallbacks (no sample available) ────
            // Side Stick
            else if (p === 37) stick.triggerAttackRelease('C5', '32n', time, v * 0.7)
            // Hand Clap
            else if (p === 39) clap.triggerAttackRelease('8n', time, v)
            // Open Hi-Hat (longer ring)
            else if (p === 46) openHat.triggerAttackRelease('C5', '4n', time, v * 0.7)
            // Crash 1 / Crash 2
            else if (p === 49 || p === 57) crash.triggerAttackRelease('C4', '2n', time, v)
            // Ride
            else if (p === 51) ride.triggerAttackRelease('C5', '8n', time, v * 0.8)
          } catch (err) { console.warn('drum schedule:', err) }
        }, note.startBeat * spb)
      })
    } else if (!isDrum) {
      const synth = synthRef.current!
      notes.forEach(note => {
        const freq = Tone.Frequency(note.pitch, 'midi').toFrequency()
        transport.schedule((time) => {
          try { synth.triggerAttackRelease(freq, note.duration * spb * 0.92, time, note.velocity / 127) } catch { /* disposed */ }
        }, note.startBeat * spb)
      })
    }

    if (isLoopRef.current) {
      transport.loop = true
      transport.loopStart = 0
      transport.loopEnd = maxEnd * spb
    } else {
      transport.loop = false
      transport.schedule(() => { setIsPlaying(false); onPlayheadChange?.(null) }, maxEnd * spb + 0.2)
    }

    if (isMetronomeRef.current && limiterRef.current) {
      const high = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.05 },
      }).connect(limiterRef.current)
      const low = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.05 },
      }).connect(limiterRef.current)
      high.volume.value = -14
      low.volume.value = -20
      metronomeRef.current = { high, low }
      let beatCount = 0
      transport.scheduleRepeat((time) => {
        const isStrong = beatCount % 4 === 0  // 매 마디 첫 박
        if (isStrong) high.triggerAttackRelease('C6', '32n', time)
        else low.triggerAttackRelease('C5', '32n', time)
        beatCount++
      }, '4n', 0)
    }

    transport.start()
    setIsPlaying(true)
  }, [isPlaying, notes, bpm, stop, onPlayheadChange, isDrum])

  useEffect(() => { playRef.current = play }, [play])

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2">
      {/* Play / Stop */}
      <button
        onClick={play}
        title="Space"
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
          isPlaying ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-green-500 text-black hover:bg-green-400'
        }`}
      >
        {isPlaying ? <Square size={14} /> : <Play size={14} />}
        {isPlaying ? '정지' : '재생'}
      </button>

      <button
        onClick={() => setIsLoop(p => !p)}
        title={isLoop ? '루프 끄기' : '루프 켜기 (반복 재생)'}
        className={`flex items-center rounded px-2 py-1.5 text-sm transition-colors ${
          isLoop ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500 hover:text-white'
        }`}
      >
        <Repeat size={14} />
      </button>

      <button
        onClick={() => setIsMetronome(p => !p)}
        title={isMetronome ? '메트로놈 끄기' : '메트로놈 켜기 (박자 클릭)'}
        className={`flex items-center rounded px-2 py-1.5 text-sm font-bold transition-colors ${
          isMetronome ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500 hover:text-white'
        }`}
      >
        ♩
      </button>

      {/* BPM */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">BPM</span>
        <input
          type="number" value={bpm} min={40} max={240}
          onChange={e => onBpmChange(Number(e.target.value))}
          className="w-16 rounded bg-zinc-800 px-2 py-1 text-center text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>

      {/* Instrument dropdown */}
      <div className="flex items-center gap-2">
        {(loading || drumLoading) && <Loader2 size={13} className="animate-spin text-zinc-500" />}
        <select
          value={instrumentKey}
          onChange={e => setInstrumentKey(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {GROUPS.map(group => {
            const items = Object.entries(INSTRUMENTS).filter(([, d]) => d.group === group)
            if (!items.length) return null
            return (
              <optgroup key={group} label={group}>
                {items.map(([key, def]) => (
                  <option key={key} value={key}>{def.label}</option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>

      {/* Volume */}
      <div className="ml-auto flex items-center gap-2">
        <Volume2 size={14} className="text-zinc-500" />
        <input
          type="range" min={-40} max={0} step={1} value={volume}
          onChange={e => setVolume(Number(e.target.value))}
          className="w-24 accent-green-500"
        />
        <span className="w-10 text-right text-xs text-zinc-500">{volume} dB</span>
      </div>
    </div>
  )
}
