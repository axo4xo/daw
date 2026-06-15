import {isDefined, Optional, Subscription, UUID} from "@opendaw/lib-std"
import {AudioUnitType} from "@opendaw/studio-enums"
import {AudioUnitBoxAdapter, InstrumentFactories} from "@opendaw/studio-adapters"
import {Project} from "@opendaw/studio-core"
import type {Unsubscribe} from "./studio"

// Which stock instrument a new track hosts. Synths (Vaporisateur, Apparat) work
// offline; samplers (Nano, Playfield, Soundfont) need openDAW's CDN.
export type InstrumentKey = InstrumentFactories.Keys

// A flat, framework-agnostic view of one audio unit (mixer channel). UI binds to
// these; it never touches the box graph directly.
export type MixerTrack = {
    readonly uuid: string
    readonly label: string
    readonly type: AudioUnitType
    readonly volume: number      // normalised 0..1, for a fader
    readonly volumeText: string  // formatted, e.g. "-6.0 dB"
    readonly pan: number         // raw value, typically -1..1
    readonly mute: boolean
    readonly solo: boolean
}

export interface MixerApi {
    list(): ReadonlyArray<MixerTrack>
    // Fires with the full track list on any structural or parameter change.
    subscribe(callback: (tracks: ReadonlyArray<MixerTrack>) => void): Unsubscribe
    createInstrumentTrack(instrument?: InstrumentKey): Optional<string>
    setVolume(uuid: string, unitValue: number): void
    setPan(uuid: string, value: number): void
    setMute(uuid: string, value: boolean): void
    setSolo(uuid: string, value: boolean): void
    remove(uuid: string): void
}

export const createMixerApi = (project: Project): MixerApi => {
    const collection = project.rootBoxAdapter.audioUnits
    const {editing, api} = project
    const toTrack = (adapter: AudioUnitBoxAdapter): MixerTrack => {
        const {volume, panning, mute, solo} = adapter.namedParameter
        const print = volume.getPrintValue()
        return {
            uuid: UUID.toString(adapter.uuid),
            label: adapter.label,
            type: adapter.type,
            volume: volume.getUnitValue(),
            volumeText: `${print.value} ${print.unit}`.trim(),
            pan: panning.getValue(),
            mute: mute.getValue(),
            solo: solo.getValue()
        }
    }
    const list = (): ReadonlyArray<MixerTrack> => collection.adapters().map(toTrack)
    const findAdapter = (uuid: string): Optional<AudioUnitBoxAdapter> =>
        collection.adapters().find(adapter => UUID.toString(adapter.uuid) === uuid)
    const mutate = (uuid: string, mutator: (adapter: AudioUnitBoxAdapter) => void): void => {
        const adapter = findAdapter(uuid)
        if (isDefined(adapter)) editing.modify(() => mutator(adapter))
    }
    return {
        list,
        subscribe(callback) {
            const paramSubs = new Map<string, Subscription>()
            const emit = (): void => callback(list())
            const watch = (adapter: AudioUnitBoxAdapter): void => {
                const {volume, panning, mute, solo} = adapter.namedParameter
                const subs = [volume.subscribe(emit), panning.subscribe(emit), mute.subscribe(emit), solo.subscribe(emit)]
                paramSubs.set(UUID.toString(adapter.uuid), {terminate: () => subs.forEach(sub => sub.terminate())})
            }
            const unwatch = (adapter: AudioUnitBoxAdapter): void => {
                const key = UUID.toString(adapter.uuid)
                const sub = paramSubs.get(key)
                if (isDefined(sub)) { sub.terminate(); paramSubs.delete(key) }
            }
            collection.adapters().forEach(watch)
            const structural = collection.subscribe({
                onAdd: adapter => { watch(adapter); emit() },
                onRemove: adapter => { unwatch(adapter); emit() },
                onReorder: () => emit()
            })
            emit()
            return () => {
                structural.terminate()
                paramSubs.forEach(sub => sub.terminate())
                paramSubs.clear()
            }
        },
        createInstrumentTrack(instrument = "Vaporisateur") {
            return editing.modify(() => {
                const {audioUnitBox} = api.createAnyInstrument(InstrumentFactories.Named[instrument])
                return UUID.toString(audioUnitBox.address.uuid)
            }).unwrapOrUndefined()
        },
        setVolume(uuid, unitValue) { mutate(uuid, adapter => adapter.namedParameter.volume.setUnitValue(unitValue)) },
        setPan(uuid, value) { mutate(uuid, adapter => adapter.namedParameter.panning.setValue(value)) },
        setMute(uuid, value) { mutate(uuid, adapter => adapter.namedParameter.mute.setValue(value)) },
        setSolo(uuid, value) { mutate(uuid, adapter => adapter.namedParameter.solo.setValue(value)) },
        remove(uuid) { mutate(uuid, adapter => api.deleteAudioUnit(adapter.box)) }
    }
}
