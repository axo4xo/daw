import {For} from "solid-js"
import {tracks, toggleMute, toggleSolo} from "../state/project"

export const TrackList = () => {
    return (
        <aside class="tracklist">
            <div class="tracklist-head">
                <span>Tracks</span>
                <button class="btn ghost" disabled>＋</button>
            </div>
            <For each={tracks}>
                {(track, index) => (
                    <div class="track-row">
                        <span class="track-color" style={{background: track.color}}/>
                        <span class="track-name">{track.name}</span>
                        <button
                            class="tag"
                            classList={{on: track.muted}}
                            onClick={() => toggleMute(index())}
                        >M</button>
                        <button
                            class="tag solo"
                            classList={{on: track.soloed}}
                            onClick={() => toggleSolo(index())}
                        >S</button>
                    </div>
                )}
            </For>
        </aside>
    )
}
