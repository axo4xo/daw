import {asInstanceOf, isDefined, Optional, tryCatch, UUID} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {Peaks, PeaksPainter} from "@opendaw/lib-fusion"
import {AudioUnitBoxAdapter, TrackType} from "@opendaw/studio-adapters"
import {Project, SampleService} from "@opendaw/studio-core"
import {AudioFileBox, AudioRegionBox, AudioUnitBox, TrackBox} from "@opendaw/studio-boxes"

// Routes dropped audio files through the real engine: the file is imported (decoded +
// stored in OPFS + peaks) and an AudioRegionBox is placed on an audio lane of the target
// unit, so playback runs through that unit's channel strip and effects. Mirrors openDAW's
// own RecordAudio / RecordTrack recipe. The matching loader (studio.ts) serves the OPFS
// sample back to the engine by uuid.

export type DroppedSample = {readonly regionUuid: string; readonly sampleUuid: string; readonly durationSeconds: number}
// Waveform draw target: pixel size + devicePixelRatio (coords are passed to the painter in device
// pixels, matching openDAW's AudioRenderer) and the fill colour.
export type WaveformOptions = {readonly width: number; readonly height: number; readonly dpr: number; readonly color: string}

export interface SamplesApi {
    // Imports the file and places a region at positionPulses on trackUuid. Resolves with the
    // region + sample uuids and duration, or undefined if the track is gone / import failed.
    drop(trackUuid: string, file: File, positionPulses: number): Promise<Optional<DroppedSample>>
    // Re-parents an existing region onto trackUuid's audio lane at positionPulses.
    move(regionUuid: string, trackUuid: string, positionPulses: number): void
    // Subscribes to a sample's peaks (waveform data); fires immediately with current peaks (or
    // undefined while loading) and again once the loader resolves them from OPFS.
    onPeaks(sampleUuid: string, callback: (peaks: Optional<Peaks>) => void): () => void
    // Draws peaks onto a 2D context (SDK PeaksPainter lives here so the UI stays SDK-free).
    renderPeaks(context: CanvasRenderingContext2D, peaks: Peaks, options: WaveformOptions): void
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
                return {regionUuid: UUID.toString(region.address.uuid), sampleUuid: UUID.toString(uuid), durationSeconds: sample.duration}
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
        },
        onPeaks(sampleUuid, callback) {
            const loader = project.sampleManager.getOrCreate(UUID.parse(sampleUuid))
            callback(loader.peaks.unwrapOrUndefined())
            const subscription = loader.subscribe(() => callback(loader.peaks.unwrapOrUndefined()))
            return () => subscription.terminate()
        },
        renderPeaks(context, peaks, {width, height, dpr, color}) {
            const widthPx = width * dpr, heightPx = height * dpr
            context.fillStyle = color
            context.strokeStyle = color
            const pad = 2 * dpr
            // One combined waveform: overlay every channel into a single full-height band.
            for (let channel = 0; channel < Math.max(1, peaks.numChannels); channel++) {
                PeaksPainter.renderPixelStrips(context, peaks, channel, {
                    u0: 0, u1: peaks.numFrames, v0: -1, v1: 1,
                    x0: 0, x1: widthPx, y0: pad, y1: heightPx - pad
                })
            }
        }
    }
}
