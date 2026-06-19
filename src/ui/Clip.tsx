import type {JSX} from "solid-js"
import {AUDIO_PATTERN, type ClipKind, hexA, MIDI_PATTERN} from "./decor"

// Clip design, preserved for when drag-dropping samples/regions onto lanes lands.
// Not currently rendered — the Arrange lanes are empty until real regions exist.
export type ClipProps = {
    title: string
    left: string
    width: string
    color: string
    kind: ClipKind
    draggable?: boolean
    onClick?: JSX.EventHandler<HTMLDivElement, MouseEvent>
    onDragStart?: JSX.EventHandler<HTMLDivElement, DragEvent>
    onDragEnd?: JSX.EventHandler<HTMLDivElement, DragEvent>
    children?: JSX.Element
}

export const Clip = (props: ClipProps) => (
    <div class="clip" style={{left: props.left, width: props.width,
        background: hexA(props.color, 0.15), border: `1px solid ${hexA(props.color, 0.55)}`}}
         draggable={props.draggable ?? false}
         onClick={props.onClick}
         onDragStart={props.onDragStart}
         onDragEnd={props.onDragEnd}>
        <div class="clip-head" style={{background: hexA(props.color, 0.42)}}><span>{props.title}</span></div>
        <div class="clip-body" style={{"background-image": props.children !== undefined ? "none" : (props.kind === "audio" ? AUDIO_PATTERN : MIDI_PATTERN)}}>{props.children}</div>
    </div>
)
