import {createEffect, ErrorBoundary, onMount} from "solid-js"
import {StudioProvider, useStudio} from "./studio"
import {Looper} from "./ui/Looper"

const Boot = () => {
    const studio = useStudio()
    let seeded = false;
    onMount(() => studio.start())
    createEffect(() => {
        if (studio.state.phase === "ready" && !seeded) {
            seeded = true;
            for (let index = 0; index < 4; index++) studio.addAudioTrack();
        }
    })
    return <Looper/>
}

export const App = () => (
    <ErrorBoundary fallback={(error, reset) => (
        <div class="errbar">
            UI crashed: {String(error)} <button class="add-track-row" onClick={reset}>Reload view</button>
        </div>
    )}>
        <StudioProvider>
            <Boot/>
        </StudioProvider>
    </ErrorBoundary>
)
