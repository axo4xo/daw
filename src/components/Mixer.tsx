import {For} from "solid-js"
import {tracks, transport, setVolume, setPan, toggleMute, toggleSolo} from "../state/project"

export const Mixer = () => {
    return (
        <section class="mixer">
            <For each={tracks}>
                {(track, index) => (
                    <div class="strip">
                        <div class="strip-meter">
                            <div
                                class="strip-meter-fill"
                                classList={{playing: transport.playing && !track.muted}}
                                style={{height: `${track.volume * 100}%`, background: track.color}}
                            />
                        </div>
                        <input
                            class="fader"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={track.volume}
                            onInput={event => setVolume(index(), event.currentTarget.valueAsNumber)}
                        />
                        <input
                            class="pan"
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={track.pan}
                            onInput={event => setPan(index(), event.currentTarget.valueAsNumber)}
                        />
                        <div class="strip-buttons">
                            <button class="tag" classList={{on: track.muted}} onClick={() => toggleMute(index())}>M</button>
                            <button class="tag solo" classList={{on: track.soloed}} onClick={() => toggleSolo(index())}>S</button>
                        </div>
                        <div class="strip-name" style={{color: track.color}}>{track.name}</div>
                    </div>
                )}
            </For>
            <div class="strip master">
                <div class="strip-name">Master</div>
            </div>
        </section>
    )
}
