import {createContext, createEffect, ParentComponent, useContext} from "solid-js"
import {createStore} from "solid-js/store"
import type {DroppedSample, EffectChoice, EffectInfo, InstrumentKey, MixerTrack, Studio} from "./engine"

// Solid integration layer over the engine facade. Lives in the main chunk, so it
// imports the engine only via dynamic import() (keeping the ~1MB SDK out of first
// paint) and uses no SDK utilities — the lib-std conventions apply to src/engine/.

export type Phase = "idle" | "booting" | "ready" | "error"

export type StudioState = {
    phase: Phase
    error: string
    playing: boolean
    bpm: number
    position: number
    cpu: number
    looping: boolean
    pulsesPerQuarter: number
    pulsesPerBar: number
    tracks: ReadonlyArray<MixerTrack>
    selectedTrack: string
    // Effect chain of the currently selected track (kept in sync via a following subscription).
    effects: ReadonlyArray<EffectInfo>
}

export interface StudioController {
    readonly state: StudioState
    start(): void
    togglePlay(): void
    stop(): void
    setBpm(value: number): void
    toggleLoop(): void
    addTrack(instrument?: InstrumentKey): void
    // Creates a Tape (audio-player) track and returns its uuid — the home for dropped audio.
    addAudioTrack(): string | undefined
    select(uuid: string): void
    setPosition(pulses: number): void
    // Stable 1-based number assigned to a track on first appearance (survives reorders/removals).
    ordinalOf(uuid: string): number
    setVolume(uuid: string, unitValue: number): void
    setPan(uuid: string, value: number): void
    toggleMute(uuid: string): void
    toggleSolo(uuid: string): void
    removeTrack(uuid: string): void
    // Effects operate on the selected track; state.effects mirrors its chain.
    availableEffects(): ReadonlyArray<EffectChoice>
    addEffect(key: string): void
    removeEffect(effectUuid: string): void
    toggleEffect(effectUuid: string): void
    setEffectParam(effectUuid: string, paramIndex: number, unitValue: number): void
    // Dropped audio routed through the engine (region on the track's audio lane).
    dropSample(trackUuid: string, file: File, positionPulses: number): Promise<DroppedSample | undefined>
    moveSample(regionUuid: string, trackUuid: string, positionPulses: number): void
}

const createController = (): StudioController => {
    const [state, setState] = createStore<StudioState>({
        phase: "idle", error: "", playing: false, bpm: 120, position: 0, cpu: 0, looping: false,
        pulsesPerQuarter: 0, pulsesPerBar: 0, tracks: [], selectedTrack: "", effects: []
    })
    let studio: Studio | undefined
    let effectsSub: (() => void) | undefined
    const subscriptions: Array<() => void> = []
    const ordinals = new Map<string, number>()
    let nextOrdinal = 0
    const ordinalOf = (uuid: string): number => ordinals.get(uuid) ?? 0
    const withStudio = (run: (current: Studio) => void): void => {
        if (studio !== undefined) run(studio)
    }
    const start = async (): Promise<void> => {
        if (state.phase !== "idle") return
        setState("phase", "booting")
        const booted = await import("./engine")
            .then(module => module.createStudio())
            .then(value => ({ok: true as const, value}), error => ({ok: false as const, error}))
        if (!booted.ok) { setState({phase: "error", error: String(booted.error)}); return }
        const current = booted.value
        studio = current
        setState({pulsesPerQuarter: current.timebase.pulsesPerQuarter, pulsesPerBar: current.timebase.pulsesPerBar})
        subscriptions.push(current.onPlayingChange(playing => setState("playing", playing)))
        subscriptions.push(current.onBpmChange(value => setState("bpm", value)))
        subscriptions.push(current.onPositionChange(position => setState("position", position)))
        subscriptions.push(current.onCpuLoadChange(cpu => setState("cpu", cpu)))
        subscriptions.push(current.onLoopingChange(looping => setState("looping", looping)))
        subscriptions.push(current.mixer.subscribe(tracks => {
            tracks.forEach(track => {
                if (track.type !== "output" && !ordinals.has(track.uuid)) ordinals.set(track.uuid, ++nextOrdinal)
            })
            setState("tracks", tracks)
            if (!tracks.some(track => track.uuid === state.selectedTrack)) {
                const first = tracks.find(track => track.type !== "output")
                setState("selectedTrack", first !== undefined ? first.uuid : "")
            }
        }))
        setState("phase", "ready")
    }
    const trackBy = (uuid: string): MixerTrack | undefined => state.tracks.find(track => track.uuid === uuid)
    // Follow the selected track: re-subscribe its effect chain into state.effects whenever the
    // selection (or readiness) changes. Tracks state.phase so it re-runs once the engine boots.
    createEffect(() => {
        const uuid = state.selectedTrack
        const ready = state.phase === "ready"
        effectsSub?.()
        effectsSub = undefined
        if (!ready || studio === undefined || uuid === "") { setState("effects", []); return }
        effectsSub = studio.effects.subscribe(uuid, effects => setState("effects", effects))
    })
    return {
        state,
        start: () => void start(),
        togglePlay: () => withStudio(current => state.playing ? current.stop(false) : current.play()),
        stop: () => withStudio(current => current.stop()),
        setBpm: value => withStudio(current => current.setBpm(value)),
        toggleLoop: () => withStudio(current => current.setLooping(!state.looping)),
        addTrack: instrument => withStudio(current => {
            const uuid = current.mixer.createInstrumentTrack(instrument)
            if (uuid !== undefined) setState("selectedTrack", uuid)
        }),
        addAudioTrack: () => {
            if (studio === undefined) return undefined
            const uuid = studio.mixer.createInstrumentTrack("Tape")
            if (uuid !== undefined) setState("selectedTrack", uuid)
            return uuid
        },
        select: uuid => setState("selectedTrack", uuid),
        setPosition: pulses => withStudio(current => current.setPosition(pulses)),
        ordinalOf,
        setVolume: (uuid, unitValue) => withStudio(current => current.mixer.setVolume(uuid, unitValue)),
        setPan: (uuid, value) => withStudio(current => current.mixer.setPan(uuid, value)),
        toggleMute: uuid => withStudio(current => {
            const track = trackBy(uuid)
            if (track !== undefined) current.mixer.setMute(uuid, !track.mute)
        }),
        toggleSolo: uuid => withStudio(current => {
            const track = trackBy(uuid)
            if (track !== undefined) current.mixer.setSolo(uuid, !track.solo)
        }),
        removeTrack: uuid => withStudio(current => current.mixer.remove(uuid)),
        availableEffects: () => studio !== undefined ? studio.effects.available() : [],
        addEffect: key => withStudio(current => current.effects.add(state.selectedTrack, key)),
        removeEffect: effectUuid => withStudio(current => current.effects.remove(state.selectedTrack, effectUuid)),
        toggleEffect: effectUuid => withStudio(current => current.effects.toggle(state.selectedTrack, effectUuid)),
        setEffectParam: (effectUuid, paramIndex, unitValue) =>
            withStudio(current => current.effects.setParam(state.selectedTrack, effectUuid, paramIndex, unitValue)),
        dropSample: (trackUuid, file, positionPulses) =>
            studio !== undefined ? studio.samples.drop(trackUuid, file, positionPulses) : Promise.resolve(undefined),
        moveSample: (regionUuid, trackUuid, positionPulses) =>
            withStudio(current => current.samples.move(regionUuid, trackUuid, positionPulses))
    }
}

const StudioContext = createContext<StudioController>()

export const StudioProvider: ParentComponent = props => {
    const controller = createController()
    return <StudioContext.Provider value={controller}>{props.children}</StudioContext.Provider>
}

export const useStudio = (): StudioController => {
    const controller = useContext(StudioContext)
    if (controller === undefined) throw new Error("useStudio must be used within <StudioProvider>")
    return controller
}
