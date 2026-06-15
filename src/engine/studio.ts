// Thin boundary over the openDAW headless engine. The whole app talks to the
// engine through this module only, so the alpha SDK's churn touches one file.
//
// Real wiring is deferred until @opendaw/studio-sdk is installed and its types
// can be read directly. The init sequence from the headless template
// (github.com/andremichelle/opendaw-headless, src/main.ts) is roughly:
//
//   Workers.install(WorkersUrl)
//   AudioWorklets.install(WorkletsUrl)
//   await testFeatures()
//   const audioContext = new AudioContext({latencyHint: 0})
//   const worklets = await AudioWorklets.createFor(audioContext)
//   const project = Project.new({audioContext, sampleManager, soundfontManager, audioWorklets: worklets})
//   project.startAudioWorklet()
//   await project.engine.isReady()
//   project.engine.play()
//
// Until that lands this is a no-op stub so the UI shell can develop on its own.

export type Studio = {
    play(): void
    stop(): void
    setBpm(bpm: number): void
    readonly ready: boolean
}

export const createStudio = (): Studio => {
    return {
        play(): void {},
        stop(): void {},
        setBpm(_bpm: number): void {},
        get ready(): boolean { return false }
    }
}
