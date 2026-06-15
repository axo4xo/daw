import {isDefined, Subscription, UUID} from "@opendaw/lib-std"
import {AudioEffectDeviceAdapter, AudioUnitBoxAdapter, AutomatableParameterFieldAdapter, Devices} from "@opendaw/studio-adapters"
import {EffectFactories, Project} from "@opendaw/studio-core"
import type {Unsubscribe} from "./studio"

// openDAW devices expose their parameters inconsistently: most (Delay, Reverb, …) as a
// `namedParameter` object, a few (Werkstatt, modular) via `parameters()`. Normalise both.
type ParamProvider = {
    readonly namedParameter?: Readonly<Record<string, AutomatableParameterFieldAdapter>>
    readonly parameters?: () => {parameters(): ReadonlyArray<AutomatableParameterFieldAdapter>}
}
const paramsOf = (device: AudioEffectDeviceAdapter): ReadonlyArray<AutomatableParameterFieldAdapter> => {
    const provider = device as unknown as ParamProvider
    if (isDefined(provider.parameters)) return provider.parameters().parameters()
    if (isDefined(provider.namedParameter)) return Object.values(provider.namedParameter)
    return []
}

// Per-track audio-effect chain, exposed as flat snapshots the UI binds to (same
// pattern as the mixer). All mutations go through editing.modify; parameters are
// the generic AutomatableParameterFieldAdapter set every device exposes.

export type EffectParam = {readonly name: string; readonly value: number; readonly text: string}
export type EffectInfo = {readonly uuid: string; readonly name: string; readonly enabled: boolean; readonly params: ReadonlyArray<EffectParam>}
export type EffectChoice = {readonly key: string; readonly name: string}

export interface EffectsApi {
    available(): ReadonlyArray<EffectChoice>
    list(trackUuid: string): ReadonlyArray<EffectInfo>
    subscribe(trackUuid: string, callback: (effects: ReadonlyArray<EffectInfo>) => void): Unsubscribe
    add(trackUuid: string, key: string): void
    remove(trackUuid: string, effectUuid: string): void
    toggle(trackUuid: string, effectUuid: string): void
    setParam(trackUuid: string, effectUuid: string, paramIndex: number, unitValue: number): void
}

const factoriesByName = new Map(EffectFactories.AudioList.map(factory => [factory.defaultName, factory] as const))

export const createEffectsApi = (project: Project): EffectsApi => {
    const {editing, api} = project
    const units = project.rootBoxAdapter.audioUnits
    const findUnit = (trackUuid: string): AudioUnitBoxAdapter | undefined =>
        units.adapters().find(unit => UUID.toString(unit.uuid) === trackUuid)
    const devicesOf = (trackUuid: string): ReadonlyArray<AudioEffectDeviceAdapter> => {
        const unit = findUnit(trackUuid)
        return isDefined(unit) ? unit.audioEffects.adapters() : []
    }
    const findDevice = (trackUuid: string, effectUuid: string): AudioEffectDeviceAdapter | undefined =>
        devicesOf(trackUuid).find(device => UUID.toString(device.uuid) === effectUuid)
    const toInfo = (device: AudioEffectDeviceAdapter): EffectInfo => ({
        uuid: UUID.toString(device.uuid),
        name: device.labelField.getValue(),
        enabled: device.enabledField.getValue(),
        params: paramsOf(device).map(param => {
            const print = param.getPrintValue()
            return {name: param.name, value: param.getUnitValue(), text: `${print.value} ${print.unit}`.trim()}
        })
    })
    const list = (trackUuid: string): ReadonlyArray<EffectInfo> => devicesOf(trackUuid).map(toInfo)
    const mutate = (trackUuid: string, effectUuid: string, run: (device: AudioEffectDeviceAdapter) => void): void => {
        const device = findDevice(trackUuid, effectUuid)
        if (isDefined(device)) editing.modify(() => run(device))
    }
    return {
        available: () => EffectFactories.AudioList.map(factory => ({key: factory.defaultName, name: factory.defaultName})),
        list,
        subscribe(trackUuid, callback) {
            const unit = findUnit(trackUuid)
            if (!isDefined(unit)) { callback([]); return () => {} }
            const collection = unit.audioEffects
            const deviceSubs = new Map<string, Subscription>()
            const emit = (): void => callback(list(trackUuid))
            const watch = (device: AudioEffectDeviceAdapter): void => {
                const subs: Subscription[] = [device.enabledField.subscribe(emit)]
                paramsOf(device).forEach(param => subs.push(param.subscribe(emit)))
                deviceSubs.set(UUID.toString(device.uuid), {terminate: () => subs.forEach(sub => sub.terminate())})
            }
            const unwatch = (device: AudioEffectDeviceAdapter): void => {
                const key = UUID.toString(device.uuid)
                const sub = deviceSubs.get(key)
                if (isDefined(sub)) { sub.terminate(); deviceSubs.delete(key) }
            }
            collection.adapters().forEach(watch)
            const structural = collection.subscribe({
                onAdd: device => { watch(device); emit() },
                onRemove: device => { unwatch(device); emit() },
                onReorder: () => emit()
            })
            emit()
            return () => {
                structural.terminate()
                deviceSubs.forEach(sub => sub.terminate())
                deviceSubs.clear()
            }
        },
        add(trackUuid, key) {
            const unit = findUnit(trackUuid)
            const factory = factoriesByName.get(key)
            if (isDefined(unit) && isDefined(factory)) editing.modify(() => api.insertEffect(unit.audioEffectsField, factory))
        },
        remove(trackUuid, effectUuid) {
            mutate(trackUuid, effectUuid, device => Devices.deleteEffectDevices([device]))
        },
        toggle(trackUuid, effectUuid) {
            mutate(trackUuid, effectUuid, device => device.enabledField.setValue(!device.enabledField.getValue()))
        },
        setParam(trackUuid, effectUuid, paramIndex, unitValue) {
            mutate(trackUuid, effectUuid, device => {
                const param = paramsOf(device)[paramIndex]
                if (isDefined(param)) param.setUnitValue(unitValue)
            })
        }
    }
}
