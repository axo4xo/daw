// Static visual data ported from the Looper mockup. These are placeholders for the
// parts the engine doesn't expose yet (clips, waveform, device chains, browser).
// The track list will become engine-backed (studio.mixer) in a later pass.

export const hexA = (hex: string, alpha: number): string => {
    const value = hex.replace("#", "")
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export type ClipKind = "midi" | "audio"
export type DecorClip = {title: string; left: number; width: number; kind: ClipKind; color: string}
export type DecorTrack = {name: string; accent: string; vol: string; meter: number; pan: number; clips: DecorClip[]}

export const NEUTRAL = "#43434d"
export const palette = ["#e9789b", "#f0a85a", "#7aa7f5", "#a374f5", "#5ec8c0", "#b7d96a"]
export const MIDI_PATTERN = "repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 5px, transparent 5px 13px)"
export const AUDIO_PATTERN = "repeating-linear-gradient(90deg, rgba(255,255,255,0.16) 0 2px, transparent 2px 5px)"

export const decorTracks: ReadonlyArray<DecorTrack> = [
    {name: "Track 1", accent: "#e9789b", vol: "-3.5", meter: 0.82, pan: -8, clips: [
        {title: "Kick 808", left: 6, width: 13, kind: "midi", color: "#e9789b"},
        {title: "Beat A", left: 21, width: 21, kind: "midi", color: "#e9789b"},
        {title: "Beat B", left: 45, width: 25, kind: "midi", color: "#e9789b"},
        {title: "Beat A", left: 73, width: 17, kind: "midi", color: "#e9789b"}]},
    {name: "Track 2", accent: "#f0a85a", vol: "-5.0", meter: 0.66, pan: 0, clips: [
        {title: "Sub", left: 21, width: 21, kind: "midi", color: "#f0a85a"},
        {title: "Sub 2", left: 45, width: 25, kind: "midi", color: "#f0a85a"}]},
    {name: "Track 3", accent: "#7aa7f5", vol: "-8.2", meter: 0.4, pan: 12, clips: [
        {title: "Chords", left: 6, width: 13, kind: "midi", color: "#7aa7f5"},
        {title: "Chords", left: 45, width: 25, kind: "midi", color: "#7aa7f5"},
        {title: "Hook", left: 73, width: 17, kind: "midi", color: "#a374f5"}]},
    {name: "Track 4", accent: "#a374f5", vol: "-7.0", meter: 0.52, pan: -15, clips: [
        {title: "Hook", left: 45, width: 25, kind: "midi", color: "#a374f5"},
        {title: "Hook", left: 73, width: 17, kind: "midi", color: "#a374f5"}]},
    {name: "Track 5", accent: "#5ec8c0", vol: "-12.0", meter: 0.28, pan: 20, clips: [
        {title: "Warm Pad", left: 6, width: 36, kind: "midi", color: "#5ec8c0"},
        {title: "Pad", left: 73, width: 17, kind: "midi", color: "#5ec8c0"}]},
    {name: "Track 6", accent: "#b7d96a", vol: "-4.5", meter: 0.7, pan: 5, clips: [
        {title: "Verse", left: 21, width: 21, kind: "audio", color: "#b7d96a"},
        {title: "Hook Vox", left: 45, width: 25, kind: "audio", color: "#b7d96a"}]}
]

export const browserItems = ["Drums", "Instruments", "Audio Effects", "MIDI Effects", "Plug-ins", "Clips", "Samples", "Grooves"]
export const browserSamples = ["808 Kick", "808 Clap", "808 HiHat", "808 Snare", "Open Hat"]
export const scenes = ["Intro", "Verse", "Drop", "Break", "Bridge", "Outro"]

export const panLabel = (pan: number): string => pan === 0 ? "C" : pan < 0 ? `${Math.abs(pan)} L` : `${pan} R`
export const panRotation = (pan: number): string => `${pan * 4}deg`
// Fader thumb position from a dB string, mapped onto a -15..0 dB visible range.
export const faderBottom = (vol: string): string => `${Math.max(12, Math.min(88, ((parseFloat(vol) + 15) / 15) * 100))}%`
