import {assert, ObservableValue} from "@opendaw/lib-std"
import {AnimationFrame} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"
import {bpm, PPQN, ppqn} from "@opendaw/lib-dsp"
import {
    AudioWorklets,
    EngineFacade,
    GlobalSampleLoaderManager,
    GlobalSoundfontLoaderManager,
    OpenSampleAPI,
    OpenSoundfontAPI,
    Project,
    SampleService,
    SoundfontService,
    Workers
} from "@opendaw/studio-core"
import {createMixerApi, MixerApi} from "./mixer"
import {createEffectsApi, EffectsApi} from "./effects"
import {testFeatures} from "./features"

import WorkersUrl from "@opendaw/studio-core/workers-main.js?worker&url"
import WorkletsUrl from "@opendaw/studio-core/processors.js?url"

// The whole app talks to the openDAW engine through this facade only. The alpha
// SDK's churn stays contained to this file. `project` and `engine` are exposed as
// an escape hatch for the box-graph / observables the high-level API doesn't cover.
export type Unsubscribe = () => void

export interface Studio {
    readonly audioContext: AudioContext
    readonly project: Project
    readonly engine: EngineFacade
    readonly mixer: MixerApi
    readonly effects: EffectsApi
    readonly timebase: {readonly pulsesPerQuarter: number; readonly pulsesPerBar: number}
    play(): void
    stop(reset?: boolean): void
    setPosition(pulses: ppqn): void
    setBpm(value: number): void
    onPlayingChange(callback: (playing: boolean) => void): Unsubscribe
    onPositionChange(callback: (pulses: ppqn) => void): Unsubscribe
    onBpmChange(callback: (value: bpm) => void): Unsubscribe
    onCpuLoadChange(callback: (load: number) => void): Unsubscribe
    resumeContext(): Promise<void>
    dispose(): void
}

const onValue = <T>(observable: ObservableValue<T>, callback: (value: T) => void): Unsubscribe => {
    const subscription = observable.catchupAndSubscribe(owner => callback(owner.getValue()))
    return () => subscription.terminate()
}

export const createStudio = async (): Promise<Studio> => {
    assert(crossOriginIsolated, "window must be crossOriginIsolated (COOP/COEP headers required)")
    await Workers.install(WorkersUrl)
    AudioWorklets.install(WorkletsUrl)
    const features = await Promises.tryCatch(testFeatures())
    if (features.status === "rejected") throw new Error(`unsupported browser: ${String(features.error)}`)
    const audioContext = new AudioContext({latencyHint: 0})
    const worklets = await Promises.tryCatch(AudioWorklets.createFor(audioContext))
    if (worklets.status === "rejected") throw new Error(`worklet init failed: ${String(worklets.error)}`)
    const sampleManager = new GlobalSampleLoaderManager({
        fetch: (uuid, progress) => OpenSampleAPI.get().load(uuid, progress)
    })
    const soundfontManager = new GlobalSoundfontLoaderManager({
        fetch: (uuid, progress) => OpenSoundfontAPI.get().load(uuid, progress)
    })
    const sampleService = new SampleService(audioContext)
    const soundfontService = new SoundfontService()
    const audioWorklets = AudioWorklets.get(audioContext)
    const project = Project.new({audioContext, audioWorklets, sampleManager, soundfontManager, sampleService, soundfontService})
    project.startAudioWorklet()
    // Drives the worklet-to-main state pump for position, play state, BPM, and CPU.
    AnimationFrame.start(window)
    await project.engine.isReady()
    const {engine, editing, api} = project
    return {
        audioContext,
        project,
        engine,
        mixer: createMixerApi(project),
        effects: createEffectsApi(project),
        timebase: {pulsesPerQuarter: PPQN.Quarter, pulsesPerBar: PPQN.Bar},
        play: () => { void audioContext.resume(); engine.play() },
        stop: (reset = true) => engine.stop(reset),
        setPosition: pulses => engine.setPosition(pulses),
        setBpm: value => { editing.modify(() => api.setBpm(value)) },
        onPlayingChange: callback => onValue(engine.isPlaying, callback),
        onPositionChange: callback => onValue(engine.position, callback),
        onBpmChange: callback => onValue(engine.bpm, callback),
        onCpuLoadChange: callback => onValue(engine.cpuLoad, callback),
        resumeContext: () => audioContext.resume(),
        dispose: () => { project.terminate(); void audioContext.close() }
    }
}
