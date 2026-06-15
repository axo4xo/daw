import {createSignal, For, type JSX, Show} from "solid-js"
import {useStudio} from "../studio"
import type {MixerTrack} from "../engine"
import {
    AUDIO_PATTERN, browserItems, browserSamples, decorTracks, devices, hexA,
    MIDI_PATTERN, NEUTRAL, palette, rulerBars, waveBars, waveform
} from "./decor"

type View = "arrange" | "mix"
type Bottom = "sample" | "effects"

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

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
                    <div class="sample-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        <span>{sample}</span>
                    </div>
                )}</For>
            </div>
        </div>
    </div>
)

const ClipDetail = () => {
    const state = useStudio().state
    const [bottom, setBottom] = createSignal<Bottom>("sample")
    const selectedName = (): string => {
        const channels = state.tracks.filter(track => track.type !== "output")
        const index = channels.findIndex(track => track.uuid === state.selectedTrack)
        return index >= 0 ? `Track ${index + 1}` : "—"
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

const ArrangeView = (props: {playheadLeft: string}) => {
    const studio = useStudio()
    const state = studio.state
    const channels = (): ReadonlyArray<MixerTrack> => state.tracks.filter(track => track.type !== "output")
    return (
        <div class="screen">
            <div class="ruler">
                <div class="ruler-head">Tracks</div>
                <div class="ruler-bars">
                    <For each={rulerBars}>{bar => <div class="ruler-bar" style={{left: `${((bar - 1) / 32) * 100}%`}}>{bar}</div>}</For>
                    <div class="ruler-ph" style={{left: props.playheadLeft}}/>
                </div>
            </div>
            <div class="lanes">
                <For each={channels()}>{(track, index) => {
                    const accent = palette[index() % palette.length]
                    const clips = decorTracks[index() % decorTracks.length].clips
                    const live = (): boolean => state.playing && !track.mute
                    return (
                        <div class="lane-row">
                            <div class="track-head" classList={{selected: state.selectedTrack === track.uuid}}
                                 onClick={() => studio.select(track.uuid)}>
                                <span class="track-color" style={{background: NEUTRAL}}/>
                                <div class="track-meta">
                                    <span class="track-name">Track {index() + 1}</span>
                                    <div class="track-ctl">
                                        <span class="ms m" classList={{on: track.mute}} onClick={() => studio.toggleMute(track.uuid)}>M</span>
                                        <span class="ms s" classList={{on: track.solo}} onClick={() => studio.toggleSolo(track.uuid)}>S</span>
                                        <div class="track-meterbar">
                                            <div classList={{vu: live()}} style={{width: live() ? "80%" : "10%", background: accent, "animation-delay": `${index() * 0.1}s`}}/>
                                        </div>
                                    </div>
                                </div>
                                <button class="track-remove" title="Remove track"
                                        onClick={event => { event.stopPropagation(); studio.removeTrack(track.uuid) }}>✕</button>
                            </div>
                            <div class="lane">
                                <For each={clips}>{clip => (
                                    <div class="clip" style={{left: `${clip.left}%`, width: `${clip.width}%`,
                                        background: hexA(clip.color, 0.15), border: `1px solid ${hexA(clip.color, 0.55)}`}}>
                                        <div class="clip-head" style={{background: hexA(clip.color, 0.42)}}><span>{clip.title}</span></div>
                                        <div class="clip-body" style={{"background-image": clip.kind === "audio" ? AUDIO_PATTERN : MIDI_PATTERN}}/>
                                    </div>
                                )}</For>
                                <div class="lane-ph" style={{left: props.playheadLeft}}/>
                            </div>
                        </div>
                    )
                }}</For>
                <button class="add-track-row" onClick={() => studio.addTrack("Vaporisateur")}>+ Add Track</button>
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
                {(track, index) => <ChannelStrip name={`Track ${index() + 1}`} index={index()} track={track} accent={palette[index() % palette.length]}/>}
            </For>
            <button class="strip add" onClick={() => studio.addTrack("Vaporisateur")}>+ Track</button>
            <Show when={master()}>{value => <MasterStrip track={value()}/>}</Show>
        </div>
    )
}

export const Looper = () => {
    const state = useStudio().state
    const [view, setView] = createSignal<View>("arrange")
    const playheadLeft = (): string =>
        state.pulsesPerBar > 0
            ? `${Math.min(100, (state.position / (32 * state.pulsesPerBar)) * 100)}%`
            : "38%"
    return (
        <div class="shell">
            <TitleBar view={view()} setView={setView}/>
            <Transport/>
            <div class="main">
                <Browser/>
                <div class="viewarea">
                    <Show when={view() === "arrange"}><ArrangeView playheadLeft={playheadLeft()}/></Show>
                    <Show when={view() === "mix"}><MixView/></Show>
                    <Show when={state.phase === "error"}><div class="errbar">Engine failed to start: {state.error}</div></Show>
                </div>
            </div>
        </div>
    )
}
