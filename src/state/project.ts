import {createStore} from "solid-js/store"

export type Track = {
    id: string
    name: string
    color: string
    muted: boolean
    soloed: boolean
    volume: number
    pan: number
}

export type Transport = {
    playing: boolean
    bpm: number
    position: number
}

const demoTracks: Track[] = [
    {id: "t1", name: "Drums", color: "#ff6b6b", muted: false, soloed: false, volume: 0.8, pan: 0},
    {id: "t2", name: "Bass", color: "#4dabf7", muted: false, soloed: false, volume: 0.72, pan: -0.1},
    {id: "t3", name: "Keys", color: "#9775fa", muted: false, soloed: false, volume: 0.65, pan: 0.15},
    {id: "t4", name: "Lead", color: "#ffd43b", muted: false, soloed: false, volume: 0.6, pan: 0.05}
]

export const [transport, setTransport] = createStore<Transport>({playing: false, bpm: 120, position: 0})
export const [tracks, setTracks] = createStore<Track[]>(demoTracks)

export const togglePlay = (): void => setTransport("playing", playing => !playing)
export const stop = (): void => setTransport({playing: false, position: 0})
export const setBpm = (bpm: number): void => setTransport("bpm", Math.max(20, Math.min(300, Math.round(bpm))))
export const toggleMute = (index: number): void => setTracks(index, "muted", muted => !muted)
export const toggleSolo = (index: number): void => setTracks(index, "soloed", soloed => !soloed)
export const setVolume = (index: number, volume: number): void => setTracks(index, "volume", volume)
export const setPan = (index: number, pan: number): void => setTracks(index, "pan", pan)

let frame = 0
let last = 0
const loop = (time: number): void => {
    const delta = last === 0 ? 0 : (time - last) / 1000
    last = time
    if (transport.playing) setTransport("position", position => position + delta)
    frame = requestAnimationFrame(loop)
}

export const startTransportClock = (): void => {
    if (frame === 0) frame = requestAnimationFrame(loop)
}
