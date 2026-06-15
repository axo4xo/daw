import {createContext, ParentComponent, useContext} from "solid-js"
import {createStore} from "solid-js/store"
import type {InstrumentKey, MixerTrack, Studio} from "./engine"

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
    pulsesPerQuarter: number
    pulsesPerBar: number
    tracks: ReadonlyArray<MixerTrack>
}

export interface StudioController {
    readonly state: StudioState
    start(): void
    togglePlay(): void
    stop(): void
    setBpm(value: number): void
    loadDemo(): void
    addTrack(instrument?: InstrumentKey): void
    setVolume(uuid: string, unitValue: number): void
    setPan(uuid: string, value: number): void
    toggleMute(uuid: string): void
    toggleSolo(uuid: string): void
    removeTrack(uuid: string): void
}

const createController = (): StudioController => {
    const [state, setState] = createStore<StudioState>({
        phase: "idle", error: "", playing: false, bpm: 120, position: 0, cpu: 0,
        pulsesPerQuarter: 0, pulsesPerBar: 0, tracks: []
    })
    let studio: Studio | undefined
    const subscriptions: Array<() => void> = []
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
        subscriptions.push(current.mixer.subscribe(tracks => setState("tracks", tracks)))
        setState("phase", "ready")
    }
    const trackBy = (uuid: string): MixerTrack | undefined => state.tracks.find(track => track.uuid === uuid)
    return {
        state,
        start: () => void start(),
        togglePlay: () => withStudio(current => state.playing ? current.stop() : current.play()),
        stop: () => withStudio(current => current.stop()),
        setBpm: value => withStudio(current => current.setBpm(value)),
        loadDemo: () => withStudio(current => current.loadDemo()),
        addTrack: instrument => withStudio(current => current.mixer.createInstrumentTrack(instrument)),
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
        removeTrack: uuid => withStudio(current => current.mixer.remove(uuid))
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
