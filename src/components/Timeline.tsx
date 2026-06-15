import {onCleanup, onMount} from "solid-js"
import {transport, tracks} from "../state/project"

const PX_PER_BEAT = 36
const ROW_HEIGHT = 44

export const Timeline = () => {
    let canvas!: HTMLCanvasElement
    let frame = 0

    const draw = (): void => {
        const context = canvas.getContext("2d")
        if (context === null) return
        const ratio = window.devicePixelRatio || 1
        const cssWidth = canvas.clientWidth
        const cssHeight = canvas.clientHeight
        const targetWidth = Math.floor(cssWidth * ratio)
        const targetHeight = Math.floor(cssHeight * ratio)
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth
            canvas.height = targetHeight
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.clearRect(0, 0, cssWidth, cssHeight)
        context.fillStyle = "#15161c"
        context.fillRect(0, 0, cssWidth, cssHeight)
        for (let row = 0; row < tracks.length; row++) {
            if (row % 2 === 1) {
                context.fillStyle = "rgba(255,255,255,0.02)"
                context.fillRect(0, row * ROW_HEIGHT, cssWidth, ROW_HEIGHT)
            }
        }
        const beats = Math.ceil(cssWidth / PX_PER_BEAT) + 1
        for (let beat = 0; beat < beats; beat++) {
            const x = beat * PX_PER_BEAT
            const isBar = beat % 4 === 0
            context.strokeStyle = isBar ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)"
            context.beginPath()
            context.moveTo(x + 0.5, 0)
            context.lineTo(x + 0.5, cssHeight)
            context.stroke()
        }
        const playheadX = transport.position * transport.bpm / 60 * PX_PER_BEAT
        context.strokeStyle = "#ff5b73"
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(playheadX, 0)
        context.lineTo(playheadX, cssHeight)
        context.stroke()
        context.lineWidth = 1
        frame = requestAnimationFrame(draw)
    }

    onMount(() => { frame = requestAnimationFrame(draw) })
    onCleanup(() => cancelAnimationFrame(frame))

    return (
        <section class="timeline">
            <canvas ref={canvas} class="timeline-canvas"/>
        </section>
    )
}
