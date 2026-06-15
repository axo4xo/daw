import {createMemo} from "solid-js"
import {transport, togglePlay, stop, setBpm} from "../state/project"

const formatPosition = (seconds: number, bpm: number): string => {
    const totalBeats = seconds * bpm / 60
    const bar = Math.floor(totalBeats / 4) + 1
    const beat = Math.floor(totalBeats % 4) + 1
    const tick = Math.floor((totalBeats % 1) * 960)
    return `${bar}.${beat}.${tick.toString().padStart(3, "0")}`
}

export const TransportBar = () => {
    const position = createMemo(() => formatPosition(transport.position, transport.bpm))
    return (
        <header class="transport">
            <div class="brand">daw</div>
            <div class="transport-controls">
                <button class="btn play" classList={{active: transport.playing}} onClick={togglePlay}>
                    {transport.playing ? "❚❚" : "▶"}
                </button>
                <button class="btn" onClick={stop}>■</button>
            </div>
            <div class="readout">
                <span class="readout-value">{position()}</span>
                <span class="readout-label">bar.beat.tick</span>
            </div>
            <label class="bpm">
                <input
                    type="number"
                    min="20"
                    max="300"
                    value={transport.bpm}
                    onInput={event => setBpm(event.currentTarget.valueAsNumber)}
                />
                <span class="readout-label">bpm</span>
            </label>
            <div class="spacer"/>
            <div class="engine-status" title="openDAW engine not wired yet">engine: stub</div>
        </header>
    )
}
