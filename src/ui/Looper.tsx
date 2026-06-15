import {createEffect, createSignal, For, type JSX, onCleanup, onMount, Show, untrack} from "solid-js"
import {useStudio} from "../studio"
import type {MixerTrack} from "../engine"
import {Clip} from "./Clip"
import {browserItems, browserSamples, devices, NEUTRAL, palette, waveBars, waveform} from "./decor"

type View = "arrange" | "mix"
type Bottom = "sample" | "effects"
type ArrangedClip = {
    id: string
    trackUuid: string
    title: string
    startBar: number
    lengthBars: number
    color: string
    buffer?: AudioBuffer
    loading?: boolean
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

// Timeline zoom state — module-level so it persists across Arrange/Mix switches.
const TOTAL_BARS = 400
const BEATS_PER_BAR = 4
const SAMPLE_CLIP_BARS = 1
const SAMPLE_MIME = "application/x-daw-sample"
const CLIP_MIME = "application/x-daw-clip"
const CLIP_OFFSET_MIME = "application/x-daw-clip-offset-bars"
const TEXT_MIME = "text/plain"
const [pxPerBar, setPxPerBar] = createSignal(64)
const [trackHeight, setTrackHeight] = createSignal(72)

const snapBar = (value: number): number => Math.round(value * BEATS_PER_BAR) / BEATS_PER_BAR
const hasDragData = (data: DataTransfer, type: string): boolean => Array.from(data.types).includes(type)
const hasFiles = (data: DataTransfer): boolean => data.files.length > 0 || hasDragData(data, "Files")
const dragText = (data: DataTransfer): string => data.getData(TEXT_MIME).trim()
const dragNumber = (data: DataTransfer, type: string): number => {
    const value = Number.parseFloat(data.getData(type))
    return Number.isFinite(value) ? value : 0
}
const readSampleDrag = (data: DataTransfer): string => {
    const sample = data.getData(SAMPLE_MIME).trim()
    const text = dragText(data)
    if (sample !== "") return sample
    return text.startsWith("sample:") ? text.slice("sample:".length).trim() : ""
}
const readClipDrag = (data: DataTransfer): string => {
    const clipId = data.getData(CLIP_MIME).trim()
    const text = dragText(data)
    if (clipId !== "") return clipId
    return text.startsWith("clip:") ? text.slice("clip:".length).trim() : ""
}

const panText = (pan: number): string => {
    if (Math.abs(pan) < 0.01) return "C"
    const amount = Math.round(Math.abs(pan) * 50)
    return pan < 0 ? `${amount} L` : `${amount} R`
}

// Display-only knob (device racks).
const Knob = (props: {size: number; indicator: number; rotation: string; accent: string}) => (
    <div class="knob" style={{width: `${props.size}px`, height: `${props.size}px`}}>
        <div class="knob-ind" style={{height: `${props.indicator}px`, background: props.accent,
            transform: `translate(-50%, -100%) rotate(${props.rotation})`}}/>
    </div>
)

// Interactive vertical fader (0..1). Drag up/down.
const Fader = (props: {value: number; live: boolean; delay: string; onChange: (value: number) => void}) => {
    let active = false, startY = 0, startValue = 0
    return (
        <div class="fader-area">
            <div class="fader-meter">
                <div classList={{vu: props.live}} style={{height: props.live ? "85%" : "6%", "animation-delay": props.delay}}/>
            </div>
            <div class="fader-track"
                 onPointerDown={event => { active = true; startY = event.clientY; startValue = props.value; event.currentTarget.setPointerCapture(event.pointerId) }}
                 onPointerMove={event => { if (active) props.onChange(clamp(startValue + (startY - event.clientY) / event.currentTarget.clientHeight, 0, 1)) }}
                 onPointerUp={event => { active = false; event.currentTarget.releasePointerCapture(event.pointerId) }}>
                <div class="fader-thumb" style={{bottom: `${props.value * 100}%`}}/>
            </div>
        </div>
    )
}

// Interactive pan knob (-1..1). Drag up/down.
const PanKnob = (props: {value: number; accent: string; onChange: (value: number) => void}) => {
    let active = false, startY = 0, startValue = 0
    return (
        <div class="knob" style={{width: "40px", height: "40px"}}
             onPointerDown={event => { active = true; startY = event.clientY; startValue = props.value; event.currentTarget.setPointerCapture(event.pointerId) }}
             onPointerMove={event => { if (active) props.onChange(clamp(startValue + (startY - event.clientY) / 150, -1, 1)) }}
             onPointerUp={event => { active = false; event.currentTarget.releasePointerCapture(event.pointerId) }}>
            <div class="knob-ind" style={{height: "14px", background: props.accent,
                transform: `translate(-50%, -100%) rotate(${props.value * 135}deg)`}}/>
        </div>
    )
}

const formatBarsBeats = (position: number, perQuarter: number, perBar: number): string => {
    if (perBar <= 0) return "1. 1. 1"
    const bar = Math.floor(position / perBar) + 1
    const beat = Math.floor((position % perBar) / perQuarter) + 1
    const sixteenth = Math.floor((position % perQuarter) / (perQuarter / 4)) + 1
    return `${bar}. ${beat}. ${sixteenth}`
}

const formatTime = (position: number, perQuarter: number, bpm: number): string => {
    if (perQuarter <= 0 || bpm <= 0) return "0:00.00"
    const seconds = (position / perQuarter) * (60 / bpm)
    const minutes = Math.floor(seconds / 60)
    return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, "0")}`
}

const TitleBar = (props: {view: View; setView: (view: View) => void}) => {
    const tab = (view: View, label: string, icon: () => JSX.Element) => (
        <button class="tab" classList={{active: props.view === view}} onClick={() => props.setView(view)}>
            {icon()}{label}
        </button>
    )
    return (
        <div class="titlebar">
            <div class="tb-left">
                <div class="brand"><span class="brand-set">Untitled Set</span></div>
                <div class="menu"><span>File</span><span>Edit</span><span>Create</span><span>View</span><span>Help</span></div>
            </div>
            <div class="tabs">
                {tab("arrange", "Arrange", () => (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="14" y2="12"/><line x1="3" y1="17" x2="18" y2="17"/>
                    </svg>
                ))}
                {tab("mix", "Mix", () => (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="6" y1="3" x2="6" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="18" y1="3" x2="18" y2="21"/>
                        <circle cx="6" cy="9" r="2" fill="currentColor" stroke="none"/>
                        <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none"/>
                        <circle cx="18" cy="7" r="2" fill="currentColor" stroke="none"/>
                    </svg>
                ))}
            </div>
        </div>
    )
}

const Transport = () => {
    const state = useStudio().state
    const studio = useStudio()
    return (
        <div class="transport">
            <div class="tcontrols">
                <div class="tbtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14h2.4V5zm12 0L9 12l9 7z"/></svg></div>
                <button class="tbtn play" classList={{on: state.playing}} onClick={() => studio.togglePlay()}>
                    <Show when={state.playing} fallback={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
                    </Show>
                </button>
                <button class="tbtn" onClick={() => studio.stop()}><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg></button>
                <div class="tbtn rec"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg></div>
                <div class="tdiv"/>
                <div class="tpill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H3"/></svg>
                    Loop
                </div>
                <div class="tbtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6l4 18H5z"/><line x1="12" y1="14" x2="16" y2="8"/></svg></div>
            </div>
            <div class="readouts">
                <div class="readout">
                    <span class="ro-main">{formatBarsBeats(state.position, state.pulsesPerQuarter, state.pulsesPerBar)}</span>
                    <span class="ro-label">Bars · Beats</span>
                </div>
                <div class="tdiv" style={{height: "30px"}}/>
                <div class="readout">
                    <span class="ro-time">{formatTime(state.position, state.pulsesPerQuarter, state.bpm)}</span>
                    <span class="ro-label">Time</span>
                </div>
                <div class="tdiv" style={{height: "30px"}}/>
                <div class="readout" style={{"flex-direction": "row", "align-items": "flex-end", gap: "5px"}}>
                    <span class="ro-bpm">
                        <input type="number" min="20" max="300" value={state.bpm.toFixed(2)}
                               onChange={event => studio.setBpm(event.currentTarget.valueAsNumber)}/>
                    </span>
                    <span class="ro-label" style={{"margin-bottom": "3px"}}>BPM</span>
                </div>
                <div class="readout" style={{gap: "3px"}}>
                    <span class="ro-sig">4 / 4</span>
                    <span class="ro-key">C min</span>
                </div>
            </div>
            <div class="tright">
                <div class="meter-mini">
                    <span classList={{vu: state.playing}} style={{height: "60%"}}/>
                    <span classList={{vu: state.playing}} style={{height: "78%", "animation-delay": "0.15s"}}/>
                </div>
                <div class="cpu">
                    <span class="cpu-val">{state.phase === "ready" ? `${Math.round(state.cpu * 100)}%` : "—"}</span>
                    <span class="ro-label">CPU</span>
                </div>
            </div>
        </div>
    )
}

const Browser = () => (
    <div class="browser">
        <div class="browser-head"><span>Browser</span></div>
        <div class="search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
            <span>Search</span>
        </div>
        <div class="browser-list">
            <div class="cat active"><span class="dot"/><span>Sounds</span></div>
            <For each={browserItems}>{item => <div class="cat"><span class="dot"/><span>{item}</span></div>}</For>
            <div class="browser-group">
                <div class="browser-group-label">Drums · 808 Kit</div>
                <For each={browserSamples}>{sample => (
                    <div class="sample-row" draggable
                         onDragStart={event => {
                             const data = event.dataTransfer
                             if (data === null) return
                             data.effectAllowed = "copy"
                             data.setData(SAMPLE_MIME, sample)
                             data.setData(CLIP_OFFSET_MIME, "0")
                             data.setData(TEXT_MIME, `sample:${sample}`)
                         }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        <span>{sample}</span>
                    </div>
                )}</For>
            </div>
        </div>
    </div>
)

const ClipDetail = () => {
    const studio = useStudio()
    const state = studio.state
    const [bottom, setBottom] = createSignal<Bottom>("sample")
    const selectedName = (): string => {
        const ord = studio.ordinalOf(state.selectedTrack)
        return ord > 0 ? `Track ${ord}` : "—"
    }
    return (
        <div class="clipdetail">
            <div class="cd-head">
                <div class="cd-tabs">
                    <button class="cd-tab" classList={{active: bottom() === "sample"}} onClick={() => setBottom("sample")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h2.5l2.5-7 4 16 2.5-9H21"/></svg>Sample
                    </button>
                    <button class="cd-tab" classList={{active: bottom() === "effects"}} onClick={() => setBottom("effects")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>Effects
                    </button>
                </div>
                <span class="cd-dot"/>
                <span class="cd-title">{selectedName()}</span>
                <span class="cd-sub">48.0 kHz · Stereo</span>
            </div>
            <Show when={bottom() === "sample"} fallback={
                <div class="devices">
                    <For each={devices}>{device => (
                        <div class="device">
                            <div class="device-head"><span class="dot" style={{background: device.accent}}/><span>{device.name}</span></div>
                            <div class="knobgrid">
                                <For each={device.knobs}>{knob => (
                                    <div class="knobcell">
                                        <Knob size={30} indicator={10} rotation={knob.rotation} accent={device.accent}/>
                                        <span class="knob-label">{knob.label}</span>
                                        <span class="knob-val">{knob.value}</span>
                                    </div>
                                )}</For>
                            </div>
                        </div>
                    )}</For>
                    <div class="device-drop">Drop Audio Effects Here</div>
                </div>
            }>
                <div class="cd-body">
                    <div class="cd-side">
                        <div class="cd-loop">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H3"/></svg>
                            <span>Loop</span>
                        </div>
                        <div class="cd-fields">
                            <div class="cd-field"><div class="cd-field-label">Position</div><div class="cd-field-val">1. 1. 1</div></div>
                            <div class="cd-field"><div class="cd-field-label">Length</div><div class="cd-field-val">4. 0. 0</div></div>
                        </div>
                        <div class="cd-fields">
                            <div class="cd-field"><div class="cd-field-label">Signature</div><div class="cd-field-val">4 / 4</div></div>
                            <div class="cd-field"><div class="cd-field-label">Scale</div><div class="cd-field-val">C Major</div></div>
                        </div>
                    </div>
                    <div class="cd-wave">
                        <div class="cd-wave-ruler">
                            <For each={waveBars}>{(bar, i) => <div style={{left: `${(i() / (waveBars.length - 1)) * 96}%`}}>{bar}</div>}</For>
                        </div>
                        <div class="cd-wave-body">
                            <For each={waveform}>{height => <div class="cd-wave-bar" style={{height: `${height}%`}}/>}</For>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    )
}

const ArrangeView = () => {
    const studio = useStudio()
    const state = studio.state
    let scroller: HTMLDivElement | undefined
    let canvas: HTMLCanvasElement | undefined
    let raf = 0
    let sampleContext: AudioContext | undefined
    let scheduledSources: AudioBufferSourceNode[] = []
    const [clips, setClips] = createSignal<ReadonlyArray<ArrangedClip>>([])
    const [dropTrack, setDropTrack] = createSignal("")
    const channels = (): ReadonlyArray<MixerTrack> => state.tracks.filter(track => track.type !== "output")
    const laneWidth = (): string => `${TOTAL_BARS * pxPerBar()}px`
    const playheadLanePx = (): number => state.pulsesPerBar > 0 ? (state.position / state.pulsesPerBar) * pxPerBar() : 0
    const clipsFor = (trackUuid: string): ReadonlyArray<ArrangedClip> => clips().filter(clip => clip.trackUuid === trackUuid)
    const acceptsTimelineDrop = (data: DataTransfer): boolean =>
        hasDragData(data, SAMPLE_MIME) || hasDragData(data, CLIP_MIME) || hasDragData(data, TEXT_MIME) || hasFiles(data)
    const secondsPerBar = (): number => state.bpm > 0 ? (60 / state.bpm) * BEATS_PER_BAR : 2
    const ensureSampleContext = (): AudioContext => {
        if (sampleContext === undefined) sampleContext = new AudioContext()
        return sampleContext
    }
    const stopSamples = (): void => {
        scheduledSources.forEach(source => {
            try { source.stop() } catch { /* already stopped */ }
        })
        scheduledSources = []
    }
    const scheduleSamples = async (snapshot: ReadonlyArray<ArrangedClip>, tracks: ReadonlyArray<MixerTrack>, position: number): Promise<void> => {
        stopSamples()
        const context = ensureSampleContext()
        await context.resume()
        const perBar = state.pulsesPerBar
        if (perBar <= 0) return
        const currentBar = position / perBar
        const barSeconds = secondsPerBar()
        const soloActive = tracks.some(track => track.solo)
        snapshot.forEach(clip => {
            if (clip.buffer === undefined) return
            const track = tracks.find(item => item.uuid === clip.trackUuid)
            if (track === undefined || track.mute || (soloActive && !track.solo)) return
            const clipEnd = clip.startBar + clip.lengthBars
            if (clipEnd <= currentBar) return
            const source = context.createBufferSource()
            const gain = context.createGain()
            const panner = context.createStereoPanner()
            const offsetBars = Math.max(0, currentBar - clip.startBar)
            const offsetSeconds = offsetBars * barSeconds
            const clipDurationSeconds = clip.lengthBars * barSeconds
            const remainingSeconds = Math.min(clip.buffer.duration - offsetSeconds, clipDurationSeconds - offsetSeconds)
            if (remainingSeconds <= 0) return
            source.buffer = clip.buffer
            gain.gain.value = track.volume
            panner.pan.value = clamp(track.pan, -1, 1)
            source.connect(gain).connect(panner).connect(context.destination)
            source.onended = () => { scheduledSources = scheduledSources.filter(item => item !== source) }
            source.start(context.currentTime + Math.max(0, (clip.startBar - currentBar) * barSeconds), offsetSeconds, remainingSeconds)
            scheduledSources.push(source)
        })
    }
    const decodeFileClip = async (id: string, file: File): Promise<void> => {
        const context = ensureSampleContext()
        await context.resume()
        const buffer = await context.decodeAudioData(await file.arrayBuffer())
        setClips(current => current.map(clip => {
            if (clip.id !== id) return clip
            return {...clip, buffer, loading: false, lengthBars: Math.max(0.25, snapBar(buffer.duration / secondsPerBar()))}
        }))
    }
    const timelineDrop = (clientX: number, clientY: number, offsetBars: number, lengthBars: number): {track: MixerTrack; startBar: number} | undefined => {
        if (scroller === undefined) return undefined
        const rect = scroller.getBoundingClientRect()
        const x = clientX - rect.left + scroller.scrollLeft - HEADER_W
        const y = clientY - rect.top + scroller.scrollTop - RULER_H
        const index = Math.floor(y / trackHeight())
        const track = channels()[index]
        if (track === undefined || x < 0 || y < 0) return undefined
        const raw = x / pxPerBar() - offsetBars
        return {track, startBar: clamp(snapBar(raw), 0, TOTAL_BARS - lengthBars)}
    }
    const trackAt = (clientY: number): MixerTrack | undefined => {
        if (scroller === undefined) return undefined
        const rect = scroller.getBoundingClientRect()
        const y = clientY - rect.top + scroller.scrollTop - RULER_H
        return y >= 0 ? channels()[Math.floor(y / trackHeight())] : undefined
    }
    const onTimelineDragOver = (event: DragEvent & {currentTarget: HTMLDivElement}): void => {
        const data = event.dataTransfer
        if (data === null || !acceptsTimelineDrop(data)) return
        const track = trackAt(event.clientY)
        if (track === undefined) return
        event.preventDefault()
        data.dropEffect = hasDragData(data, CLIP_MIME) || dragText(data).startsWith("clip:") ? "move" : "copy"
        setDropTrack(track.uuid)
    }
    const onTimelineDrop = (event: DragEvent & {currentTarget: HTMLDivElement}): void => {
        const data = event.dataTransfer
        if (data === null || !acceptsTimelineDrop(data)) return
        event.preventDefault()
        event.stopPropagation()
        setDropTrack("")
        const clipId = readClipDrag(data)
        const offsetBars = dragNumber(data, CLIP_OFFSET_MIME)
        if (clipId !== "") {
            const currentClip = clips().find(clip => clip.id === clipId)
            if (currentClip === undefined) return
            const drop = timelineDrop(event.clientX, event.clientY, offsetBars, currentClip.lengthBars)
            if (drop === undefined) return
            const ord = studio.ordinalOf(drop.track.uuid)
            const color = palette[(ord - 1) % palette.length]
            studio.select(drop.track.uuid)
            setClips(current => current.map(clip => clip.id === clipId
                ? {...clip, trackUuid: drop.track.uuid, color, startBar: drop.startBar}
                : clip))
            return
        }
        const files = Array.from(data.files)
        const names = files.length > 0 ? files.map(file => file.name) : [readSampleDrag(data)].filter(name => name !== "")
        names.forEach((name, index) => {
            const drop = timelineDrop(event.clientX, event.clientY, offsetBars + index * SAMPLE_CLIP_BARS, SAMPLE_CLIP_BARS)
            if (drop === undefined) return
            const ord = studio.ordinalOf(drop.track.uuid)
            const color = palette[(ord - 1) % palette.length]
            const id = crypto.randomUUID()
            const file = files[index]
            studio.select(drop.track.uuid)
            setClips(current => [...current, {
                id,
                trackUuid: drop.track.uuid,
                title: name,
                startBar: drop.startBar,
                lengthBars: SAMPLE_CLIP_BARS,
                color,
                loading: file !== undefined
            }])
            if (file !== undefined) void decodeFileClip(id, file).catch(() => {
                setClips(current => current.map(clip => clip.id === id ? {...clip, title: `${clip.title} (decode failed)`, loading: false} : clip))
            })
        })
    }
    const onClipDragStart = (clip: ArrangedClip, event: DragEvent & {currentTarget: HTMLDivElement}): void => {
        const data = event.dataTransfer
        if (data === null) return
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        data.effectAllowed = "move"
        data.setData(CLIP_MIME, clip.id)
        data.setData(CLIP_OFFSET_MIME, String((event.clientX - rect.left) / pxPerBar()))
        data.setData(TEXT_MIME, `clip:${clip.id}`)
    }
    const barLabels = (): number[] => {
        const step = pxPerBar() >= 48 ? 1 : pxPerBar() >= 24 ? 2 : 4
        const labels: number[] = []
        for (let bar = 1; bar <= TOTAL_BARS; bar += step) labels.push(bar)
        return labels
    }
    // Click to move the playhead, snapped to the nearest beat.
    const seek = (event: MouseEvent & {currentTarget: HTMLElement}): void => {
        const rect = event.currentTarget.getBoundingClientRect()
        const raw = ((event.clientX - rect.left) / pxPerBar()) * state.pulsesPerBar
        const snap = state.pulsesPerQuarter
        const position = Math.max(0, snap > 0 ? Math.round(raw / snap) * snap : raw)
        studio.setPosition(position)
        if (state.playing) void scheduleSamples(clips(), channels(), position)
    }
    // The grid is drawn on a viewport-sized canvas (not CSS): lines stay crisp at any zoom and
    // the 400-bar timeline never builds a 100k-px element. Redraws only on scroll / zoom / resize.
    const HEADER_W = 176
    const RULER_H = 30
    const draw = (): void => {
        if (canvas === undefined || scroller === undefined) return
        const ctx = canvas.getContext("2d")
        if (ctx === null) return
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        if (canvas.width !== Math.floor(w * dpr)) canvas.width = Math.floor(w * dpr)
        if (canvas.height !== Math.floor(h * dpr)) canvas.height = Math.floor(h * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        const ppb = pxPerBar()
        // Grid spans only the tracks — not the empty area / add-track row below them.
        const gridH = Math.max(0, Math.min(h, RULER_H + channels().length * trackHeight() - scroller.scrollTop) - RULER_H)
        const scrollLeft = scroller.scrollLeft
        const firstBar = Math.max(1, Math.floor(scrollLeft / ppb) + 1)
        const lastBar = Math.min(TOTAL_BARS, Math.floor((scrollLeft + w - HEADER_W) / ppb) + 1)
        for (let bar = firstBar; bar <= lastBar; bar++) {
            const barX = HEADER_W + (bar - 1) * ppb - scrollLeft
            if (bar % 2 === 0) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.018)"
                const x0 = Math.max(HEADER_W, barX)
                const x1 = Math.min(w, barX + ppb)
                if (x1 > x0) ctx.fillRect(x0, RULER_H, x1 - x0, gridH)
            }
            ctx.fillStyle = "rgba(255, 255, 255, 0.05)"
            for (let beat = 1; beat < 4; beat++) {
                const beatX = Math.round(barX + (beat * ppb) / 4)
                if (beatX >= HEADER_W && beatX <= w) ctx.fillRect(beatX, RULER_H, 1, gridH)
            }
            const lineX = Math.round(barX)
            if (lineX >= HEADER_W && lineX <= w) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.16)"
                ctx.fillRect(lineX, RULER_H, 1, gridH)
            }
        }
    }
    const requestDraw = (): void => { if (raf === 0) raf = requestAnimationFrame(() => { raf = 0; draw() }) }
    const onWheel = (event: WheelEvent): void => {
        if (event.ctrlKey) {
            event.preventDefault()
            setPxPerBar(value => Math.round(clamp(value * (event.deltaY < 0 ? 1.12 : 0.89), 16, 320) / 4) * 4)
        } else if (event.altKey) {
            event.preventDefault()
            setTrackHeight(value => clamp(value * (event.deltaY < 0 ? 1.1 : 0.91), 52, 200))
        }
    }
    createEffect(() => {
        const playing = state.playing
        const bpm = state.bpm
        const snapshot = clips()
        const tracks = channels()
        void bpm
        if (!playing) {
            stopSamples()
            return
        }
        void scheduleSamples(snapshot, tracks, untrack(() => state.position))
    })
    onMount(() => {
        scroller?.addEventListener("scroll", requestDraw, {passive: true})
        scroller?.addEventListener("wheel", onWheel, {passive: false})
        const observer = new ResizeObserver(requestDraw)
        if (canvas !== undefined) observer.observe(canvas)
        requestDraw()
        onCleanup(() => {
            scroller?.removeEventListener("scroll", requestDraw)
            scroller?.removeEventListener("wheel", onWheel)
            observer.disconnect()
            if (raf !== 0) cancelAnimationFrame(raf)
            stopSamples()
            void sampleContext?.close()
        })
    })
    createEffect(() => {
        const trackIds = channels().map(track => track.uuid)
        setClips(current => {
            const next = current.filter(clip => trackIds.includes(clip.trackUuid))
            return next.length === current.length ? current : next
        })
        pxPerBar(); trackHeight(); requestDraw()
    })
    return (
        <div class="screen">
            <div class="timeline-wrap">
                <canvas class="grid-canvas" ref={element => { canvas = element }}/>
                <div class="timeline" ref={element => { scroller = element }}
                     onDragOver={onTimelineDragOver}
                     onDragLeave={() => setDropTrack("")}
                     onDrop={onTimelineDrop}>
                    <div class="timeline-inner">
                        <div class="ruler-row">
                            <div class="ruler-corner">Tracks</div>
                            <div class="ruler-bars" style={{width: laneWidth()}} onClick={seek}>
                                <For each={barLabels()}>{bar => <div class="ruler-bar" style={{left: `${(bar - 1) * pxPerBar()}px`}}>{bar}</div>}</For>
                                <div class="ruler-ph" style={{left: `${playheadLanePx()}px`}}/>
                            </div>
                        </div>
                        <For each={channels()}>{track => {
                            const ord = studio.ordinalOf(track.uuid)
                            const accent = palette[(ord - 1) % palette.length]
                            const live = (): boolean => state.playing && !track.mute
                            return (
                                <div class="lane-row" style={{height: `${trackHeight()}px`}}>
                                    <div class="track-head" classList={{selected: state.selectedTrack === track.uuid}}
                                         onClick={() => studio.select(track.uuid)}>
                                        <span class="track-color" style={{background: NEUTRAL}}/>
                                        <div class="track-meta">
                                            <span class="track-name">Track {ord}</span>
                                            <div class="track-ctl">
                                                <span class="ms m" classList={{on: track.mute}} onClick={() => studio.toggleMute(track.uuid)}>M</span>
                                                <span class="ms s" classList={{on: track.solo}} onClick={() => studio.toggleSolo(track.uuid)}>S</span>
                                                <div class="track-meterbar">
                                                    <div classList={{vu: live()}} style={{width: live() ? "80%" : "10%", background: accent, "animation-delay": `${ord * 0.1}s`}}/>
                                                </div>
                                            </div>
                                        </div>
                                        <button class="track-remove" title="Remove track"
                                                onClick={event => { event.stopPropagation(); studio.removeTrack(track.uuid) }}>✕</button>
                                    </div>
                                     <div class="lane" classList={{"drop-target": dropTrack() === track.uuid}}
                                          style={{width: laneWidth()}}
                                          onClick={seek}>
                                        <For each={clipsFor(track.uuid)}>{clip => (
                                            <Clip title={clip.title}
                                                  left={`${clip.startBar * pxPerBar()}px`}
                                                  width={`${clip.lengthBars * pxPerBar()}px`}
                                                  color={clip.color}
                                                  kind="audio"
                                                  draggable
                                                  onClick={event => { event.stopPropagation(); studio.select(track.uuid) }}
                                                  onDragStart={event => onClipDragStart(clip, event)}
                                                  onDragEnd={() => setDropTrack("")}/>
                                        )}</For>
                                    </div>
                                </div>
                            )
                        }}</For>
                        <div class="lane-row">
                            <button class="add-track-row" onClick={() => studio.addTrack("Vaporisateur")}>+ Add Track</button>
                        </div>
                        <div class="playhead" style={{left: `${HEADER_W + playheadLanePx()}px`, height: `${channels().length * trackHeight()}px`}}/>
                    </div>
                </div>
            </div>
            <ClipDetail/>
        </div>
    )
}

const ChannelStrip = (props: {name: string; track: MixerTrack; accent: string; index: number}) => {
    const studio = useStudio()
    const live = (): boolean => studio.state.playing && !props.track.mute
    return (
        <div class="strip" classList={{selected: studio.state.selectedTrack === props.track.uuid}}
             onClick={() => studio.select(props.track.uuid)}>
            <div class="strip-name" style={{"border-color": props.accent}}>{props.name}</div>
            <PanKnob value={props.track.pan} accent={props.accent} onChange={value => studio.setPan(props.track.uuid, value)}/>
            <span class="strip-pan">{panText(props.track.pan)}</span>
            <div class="sends">
                <div class="send"><div class="send-knob"/><span class="send-label">A</span></div>
                <div class="send"><div class="send-knob"/><span class="send-label">B</span></div>
            </div>
            <Fader value={props.track.volume} live={live()} delay={`${props.index * 0.1}s`}
                   onChange={value => studio.setVolume(props.track.uuid, value)}/>
            <span class="strip-vol">{props.track.volumeText}</span>
            <div class="strip-btns">
                <span class="sbtn m" classList={{on: props.track.mute}} onClick={() => studio.toggleMute(props.track.uuid)}>M</span>
                <span class="sbtn s" classList={{on: props.track.solo}} onClick={() => studio.toggleSolo(props.track.uuid)}>S</span>
                <span class="sbtn rec"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg></span>
            </div>
        </div>
    )
}

const MasterStrip = (props: {track: MixerTrack}) => {
    const studio = useStudio()
    return (
        <div class="strip master">
            <div class="strip-name">Master</div>
            <PanKnob value={props.track.pan} accent="#b388ff" onChange={value => studio.setPan(props.track.uuid, value)}/>
            <span class="strip-pan">{panText(props.track.pan)}</span>
            <Fader value={props.track.volume} live={studio.state.playing} delay="0s"
                   onChange={value => studio.setVolume(props.track.uuid, value)}/>
            <span class="strip-vol">{props.track.volumeText}</span>
        </div>
    )
}

const MixView = () => {
    const studio = useStudio()
    const state = studio.state
    const channels = (): ReadonlyArray<MixerTrack> => state.tracks.filter(track => track.type !== "output")
    const master = (): MixerTrack | undefined => state.tracks.find(track => track.type === "output")
    return (
        <div class="mix">
            <For each={channels()}>
                {(track, index) => {
                    const ord = studio.ordinalOf(track.uuid)
                    return <ChannelStrip name={`Track ${ord}`} index={index()} track={track} accent={palette[(ord - 1) % palette.length]}/>
                }}
            </For>
            <button class="strip add" onClick={() => studio.addTrack("Vaporisateur")}>+ Track</button>
            <Show when={master()}>{value => <MasterStrip track={value()}/>}</Show>
        </div>
    )
}

export const Looper = () => {
    const studio = useStudio()
    const state = studio.state
    const [view, setView] = createSignal<View>("arrange")
    const onKey = (event: KeyboardEvent): void => {
        const target = event.target as HTMLElement
        if (target.tagName === "INPUT" || target.isContentEditable) return
        if (event.code === "Space") { event.preventDefault(); studio.togglePlay() }
    }
    onMount(() => window.addEventListener("keydown", onKey))
    onCleanup(() => window.removeEventListener("keydown", onKey))
    return (
        <div class="shell">
            <TitleBar view={view()} setView={setView}/>
            <Transport/>
            <div class="main">
                <Browser/>
                <div class="viewarea">
                    <Show when={view() === "arrange"}><ArrangeView/></Show>
                    <Show when={view() === "mix"}><MixView/></Show>
                    <Show when={state.phase === "error"}><div class="errbar">Engine failed to start: {state.error}</div></Show>
                </div>
            </div>
        </div>
    )
}
