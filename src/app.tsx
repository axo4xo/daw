import {createEffect, onMount} from "solid-js"
import {StudioProvider, useStudio} from "./studio"
import {Looper} from "./ui/Looper"

const Boot = () => {
    const studio = useStudio()
    let seeded = false
    onMount(() => studio.start())
    createEffect(() => {
        if (studio.state.phase === "ready" && !seeded) {
            seeded = true
            studio.loadDemo()
            for (let index = 0; index < 5; index++) studio.addTrack("Vaporisateur")
        }
    })
    return <Looper/>
}

export const App = () => (
    <StudioProvider>
        <Boot/>
    </StudioProvider>
)
