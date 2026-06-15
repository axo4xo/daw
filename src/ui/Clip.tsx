import {AUDIO_PATTERN, type ClipKind, hexA, MIDI_PATTERN} from "./decor"

// Clip design, preserved for when drag-dropping samples/regions onto lanes lands.
// Not currently rendered — the Arrange lanes are empty until real regions exist.
export type ClipProps = {
    title: string
    left: string
    width: string
    color: string
    kind: ClipKind
}

export const Clip = (props: ClipProps) => (
    <div class="clip" style={{left: props.left, width: props.width,
        background: hexA(props.color, 0.15), border: `1px solid ${hexA(props.color, 0.55)}`}}>
        <div class="clip-head" style={{background: hexA(props.color, 0.42)}}><span>{props.title}</span></div>
        <div class="clip-body" style={{"background-image": props.kind === "audio" ? AUDIO_PATTERN : MIDI_PATTERN}}/>
    </div>
)
