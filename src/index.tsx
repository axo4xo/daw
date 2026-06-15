import {render} from "solid-js/web"
import {App} from "./app"
import type {Studio} from "./engine"
import "./index.css"

// The engine (~1MB + worklets) is lazy-loaded so it stays out of first paint.
// Manual smoke test until the UI drives it, run from the console after a click
// (browsers require a user gesture to start audio):
//   const s = await window.daw.createStudio(); s.loadDemo(); s.play()
declare global {
    interface Window {
        daw: {createStudio: () => Promise<Studio>}
    }
}

const root = document.getElementById("root")
if (root === null) throw new Error("missing #root element")
window.daw = {createStudio: () => import("./engine").then(module => module.createStudio())}
render(() => <App/>, root)
