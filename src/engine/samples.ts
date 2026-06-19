import {asInstanceOf, isDefined, Optional, tryCatch, UUID} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {AudioUnitBoxAdapter, TrackType} from "@opendaw/studio-adapters"
import {Project, SampleService} from "@opendaw/studio-core"
import {AudioFileBox, AudioRegionBox, AudioUnitBox, TrackBox} from "@opendaw/studio-boxes"

// Routes dropped audio files through the real engine: the file is imported (decoded +
// stored in OPFS + peaks) and an AudioRegionBox is placed on an audio lane of the target
// unit, so playback runs through that unit's channel strip and effects. Mirrors openDAW's
// own RecordAudio / RecordTrack recipe. The matching loader (studio.ts) serves the OPFS
// sample back to the engine by uuid.

export type DroppedSample = {readonly uuid: string; readonly durationSeconds: number}

export interface SamplesApi {
    // Imports the file and places a region at positionPulses on trackUuid. Resolves with the
    // region's uuid + sample duration, or undefined if the track is gone / import failed.
    drop(trackUuid: string, file: File, positionPulses: number): Promise<Optional<DroppedSample>>
    // Re-parents an existing region onto trackUuid's audio lane at positionPulses.
    move(regionUuid: string, trackUuid: string, positionPulses: number): void
}

export const createSamplesApi = (project: Project, sampleService: SampleService): SamplesApi => {
    const {editing, api, boxGraph} = project
    const units = project.rootBoxAdapter.audioUnits
    const findUnit = (trackUuid: string): Optional<AudioUnitBoxAdapter> =>
        units.adapters().find(unit => UUID.toString(unit.uuid) === trackUuid)
    const findOrCreateAudioLane = (unitBox: AudioUnitBox): TrackBox => {
        const tracks = unitBox.tracks.pointerHub.incoming().map(({box}) => asInstanceOf(box, TrackBox))
        const lane = tracks.find(track => track.type.getValue() === TrackType.Audio)
        if (isDefined(lane)) return lane
        const nextIndex = tracks.reduce((max, track) => Math.max(max, track.index.getValue()), -1) + 1
        return TrackBox.create(boxGraph, UUID.generate(), box => {
            box.type.setValue(TrackType.Audio)
            box.index.setValue(nextIndex)
            box.tracks.refer(unitBox.tracks)
            box.target.refer(unitBox)
        })
    }
    return {
        async drop(trackUuid, file, positionPulses) {
            const unit = findUnit(trackUuid)
            if (!isDefined(unit)) { console.warn("[samples] drop: no unit for", trackUuid); return undefined }
            const imported = await Promises.tryCatch((async () => {
                const uuid = UUID.generate()
                const sample = await sampleService.importFile({uuid, name: file.name, arrayBuffer: await file.arrayBuffer()})
                return {uuid, sample}
            })())
            if (imported.status === "rejected") { console.error("[samples] import failed", imported.error); return undefined }
            const {uuid, sample} = imported.value
            const placed = tryCatch(() => editing.modify(() => {
                const audioFileBox = AudioFileBox.create(boxGraph, uuid, box => {
                    box.fileName.setValue(file.name)
                    box.startInSeconds.setValue(0)
                    box.endInSeconds.setValue(sample.duration)
                })
                const targetTrack = findOrCreateAudioLane(unit.box)
                const region = api.createNotStretchedRegion({boxGraph, targetTrack, audioFileBox, sample, position: Math.round(positionPulses)})
                project.trackUserCreatedSample(uuid)
                return {uuid: UUID.toString(region.address.uuid), durationSeconds: sample.duration}
            }).unwrapOrUndefined())
            if (placed.status === "failure") { console.error("[samples] region creation failed", placed.error); return undefined }
            return placed.value
        },
        move(regionUuid, trackUuid, positionPulses) {
            const unit = findUnit(trackUuid)
            if (!isDefined(unit)) return
            boxGraph.findBox(UUID.parse(regionUuid)).ifSome(box => {
                const region = asInstanceOf(box, AudioRegionBox)
                editing.modify(() => {
                    region.regions.refer(findOrCreateAudioLane(unit.box).regions)
                    region.position.setValue(Math.round(positionPulses))
                })
            })
        }
    }
}
