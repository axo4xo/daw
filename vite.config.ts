import {defineConfig} from "vite"
import {fileURLToPath, URL} from "node:url"
import solid from "vite-plugin-solid"

// The openDAW engine relies on SharedArrayBuffer, which requires the page to be
// cross-origin isolated. These headers enable that. http://localhost is already a
// secure context, so no HTTPS/cert is needed for local dev. Production hosting MUST
// send the same two headers.
const crossOriginIsolation = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp"
}

export default defineConfig({
    plugins: [solid()],
    resolve: {
        alias: {"@": fileURLToPath(new URL("./src", import.meta.url))}
    },
    server: {
        host: "localhost",
        port: 8080,
        headers: crossOriginIsolation
    },
    preview: {
        headers: crossOriginIsolation
    }
})
