import {onMount} from "solid-js"
import {startTransportClock} from "./state/project"
import {TransportBar} from "./components/TransportBar"
import {TrackList} from "./components/TrackList"
import {Timeline} from "./components/Timeline"
import {Mixer} from "./components/Mixer"

export const App = () => {
    onMount(startTransportClock)
    return (
        <div class="app">
            <TransportBar/>
            <div class="workspace">
                <TrackList/>
                <Timeline/>
            </div>
            <Mixer/>
        </div>
    )
}
