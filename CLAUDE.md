# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An opinionated, free, web-based multiplatform DAW (Digital Audio Workstation) — simple, light, intuitive. The goal is an FL Studio / Ableton-style production interface built **on top of the openDAW headless audio engine**, targeting desktop browsers in landscape (mobile is explicitly out of scope).

**MVP scope, in priority order:** the UI shell → multiple audio tracks → basic audio tweaks (gain/pan/mute/solo) → simple effects → a basic parametric EQ → a simple MIDI player. Anything beyond this is a stretch goal, not a commitment.

## Current state (read this first)

The **SolidJS + Vite + TS shell and the real openDAW engine layer are both in place**; typecheck and build are green. What exists:
- **Engine layer (`src/engine/`)** — `createStudio()` boots the real openDAW engine (Workers → AudioWorklets → `Project.new` → `startAudioWorklet` → `engine.isReady`) and returns a typed `Studio` facade. This is the **only** place that imports the SDK. Surface:
  - Transport: `play/stop/setPosition/setBpm/setLooping`, `onPlayingChange/onPositionChange/onBpmChange/onCpuLoadChange/onLoopingChange`. Loop is `project.timelineBox.loopArea.enabled` (on by default), toggled via `editing.modify`.
  - Metering: `onMasterMeter(cb)` taps the **master output** with a `MeterWorklet` (`AudioWorklets.createMeter` → `worklet.connect(meter)`); `onUnitMeter(uuid, cb)` reads a unit's `[peakL, peakR, rmsL, rmsR]` (linear) via `liveStreamReceiver.subscribeFloats(unit.address, …)` — the engine broadcasts each audio unit's peak/rms at its **own box address** (found by tracing the worklet's `PeakBroadcaster`). Both fire ~60fps off the reactive tree. (Note: `address.append(1001)` is a *different*, Playfield-sample-specific peak address — not the unit meter.)
  - `studio.mixer` (`src/engine/mixer.ts`): engine-backed tracks as flat `MixerTrack` snapshots (`uuid/label/type/volume/volumeText/pan/mute/solo`). `mixer.list()`, `mixer.subscribe(cb)` (fires the full list on any structural or parameter change), `createInstrumentTrack(key?)`, `setVolume/setPan/setMute/setSolo`, `remove`. All mutations go through `editing.modify`; tracks read from `rootBoxAdapter.audioUnits` and each unit's `namedParameter.{volume,panning,mute,solo}`.
  - `studio.effects` (`src/engine/effects.ts`): per-track audio-effect chain as flat `EffectInfo` snapshots (`uuid/name/enabled/params[]`, each param `{name, value (unit 0..1), text}`). `effects.available()` (the `EffectFactories.AudioList`), `list(trackUuid)`, `subscribe(trackUuid, cb)` (fires on structural *and* per-param change), `add(trackUuid, key)` → `api.insertEffect`, `remove`/`toggle`/`setParam`. Params are normalised across devices (`namedParameter` object vs `parameters()`); all mutations go through `editing.modify`.
  - `studio.samples` (`src/engine/samples.ts`): routes dropped audio files through the engine. `drop(trackUuid, file, positionPulses)` imports the file via `SampleService.importFile` (decode + OPFS + peaks), then in one `editing.modify` creates an `AudioFileBox` (uuid = sample uuid), finds-or-creates a `TrackType.Audio` lane on the unit, and places an `api.createNotStretchedRegion` — so playback runs through that unit's channel strip + effects. `move(regionUuid, trackUuid, positionPulses)` re-parents the region's lane + sets position. Mirrors openDAW's `RecordAudio`/`RecordTrack`. The boot loader (studio.ts) is patched to serve OPFS imports back to the engine (`SampleStorage.get().exists/load` first, remote `OpenSampleAPI` fallback) — without this the engine can't find imported samples.
    - **Track-type model (Ableton-style, forced by the engine):** an openDAW audio unit is typed by its single input *device* — a synth (`Vaporisateur`) plays MIDI note regions; a **`Tape`** device (`InstrumentFactories.Tape`, "Audio Player") plays audio regions. An audio region on a *synth* unit's lane is silently ignored (the engine never even fetches the sample). openDAW's own `replaceMIDIInstrument` refuses synth→audio conversion (it requires `CaptureMidiBox` + `trackType===Notes`), so there's no clean in-place morph. Since we're audio-first for now, **all seeded/`+ Track` tracks are `Tape` audio units** (`addAudioTrack` → `createInstrumentTrack("Tape")`), so a dropped sample just lands on the target track in place. We do **not** pursue FL's decoupled-playlist model; tracks stay 1:1 with mixer channels. (When the MIDI player lands, synth tracks return and drop becomes type-aware.)
  - Escape hatches: `project`/`engine`/`audioContext` for box-graph access the facade doesn't cover.
  - **Engine boot + audio are browser-verified**; the **mixer, effects, and samples APIs are typecheck/build verified but their runtime is not yet exercised** — drive them from the UI to confirm (esp. that an audio region on an instrument unit's audio lane is audible and feeds its effect chain).
- The engine is **lazy-loaded** (dynamic `import("./engine")`) so its ~1 MB bundle + worklet + wasm stay out of first paint. A console smoke hook is wired in `src/index.tsx`: after clicking the page, run `const s = await window.daw.createStudio(); s.loadDemo(); s.play()`.
- **Solid integration (`src/studio.tsx`)** — `StudioProvider` / `useStudio()`: a context that boots the engine on a user gesture (`start()`) and exposes a reactive store (`phase`, `playing`, `bpm`, `position`, `cpu`, `looping`, `tracks`, `effects` — the selected track's chain) plus actions (`togglePlay`, `setBpm`, `toggleLoop`, `addTrack`, `addAudioTrack`, `setVolume/setPan/toggleMute/toggleSolo`, `removeTrack`, `availableEffects/addEffect/removeEffect/toggleEffect/setEffectParam`, `dropSample/moveSample`). A `createEffect` follows `selectedTrack` and re-subscribes `studio.effects` into `state.effects`. It **lazy-imports `./engine` via `import()`** and uses **no SDK utilities**, so the main chunk stays ~20 kB and SDK-free. Convention note: the strict lib-std rules apply to `src/engine/` (the lazy, SDK-facing code); the thin Solid glue stays framework-only.
- **UI (`src/ui/`)** — the FL/Ableton-style **"Looper"** interface, ported from the user's HTML mockup to Solid + CSS (`src/index.css` design system). `Looper.tsx` holds the title bar, transport, browser, and the Arrange / Mix views (Session removed); `decor.ts` is the **static mock data** (clips, devices, waveform, browser, the `palette`) for the parts the engine doesn't expose yet. Fonts are system stacks — Google Fonts are blocked by COEP, so self-host if exact faces are needed.
  - **Engine-wired (live):** the transport bar (play/stop, editable BPM, bars·beats + time, CPU, **Loop** toggle → `toggleLoop`); the Arrange playhead; the **Mix view** (channel strips + master from `studio.mixer`, interactive pointer-drag `Fader`/`PanKnob` → `setVolume`/`setPan`, M/S → `setMute`/`setSolo`); the **Arrange track headers** (real track list, mute/solo synced with Mix); and the bottom **Effects rack** (`EffectsRack` — the selected track's live chain from `studio.effects`: `+ Add Effect` picker from `available()`, per-device bypass/remove, pointer-drag `EffectKnob` → `setEffectParam`). Boot is on mount; **4 empty audio (`Tape`) tracks** are auto-seeded (`addAudioTrack`). **Track management:** `+ Track` (Arrange footer / Mix) → `addAudioTrack` (audio-first; `addTrack(instrument)` still exists for the future synth/MIDI path), hover-`✕` on a header → `removeTrack`, and a shared **selected track** (`state.selectedTrack`, click a header/strip) that the bottom Sample/Effects panel header reflects.
  - **Drag-drop audio (live, engine-backed):** since every track is a `Tape` audio unit, dropping an audio file places a real engine region **on the track it was dropped onto** (no new track) — it plays through that track's volume/pan/effects. A visual `ArrangedClip` overlay (a **module-level** `clips` signal, so it survives Arrange⇄Mix view switches — `ArrangeView` unmounts) mirrors it, storing the returned `regionUuid` so dragging the clip re-positions/re-parents the region via `moveSample` (any track is audio, so cross-track moves stay audible). **There is no longer any parallel `AudioContext`** — the old `scheduleSamples` path is gone. Browser-sample drags from the decor browser (no `File`) remain visual-only.
  - **Arrange timeline:** a scrollable, zoomable grid (`ArrangeView`). Ctrl+wheel = horizontal zoom (`pxPerBar`, snapped to multiples of 4 for crisp lines), Alt+wheel = vertical zoom (`trackHeight`); click the ruler/grid to seek (snapped to the nearest beat). **The grid itself is drawn on a `<canvas>` sized to the viewport** and redrawn on scroll/zoom/resize — *not* CSS — because the 400-bar timeline is ~100k px wide and browsers silently drop fine repeating-gradients on elements that large (only one lane rendered). The canvas draws bar/beat lines + alternating-bar shading clipped to the tracks' height; sticky track headers + ruler sit in a scroller above it.
  - **Still mock (decor):** the browser, and the bottom **Sample** panel (waveform / loop / position / length fields are static). Arrange **clips** are now real for dropped audio (engine regions, above), but are a **local visual overlay** synced to the engine, *not yet* rendered from the engine's region adapters — and they don't track BPM changes (region duration is in seconds, the overlay width is in bars). **All meters are real canvas PPM** — the Mix-view master + per-track channel strips (vertical L/R) and the Arrange track-header bars (`orientation="horizontal"`, single combined bar) all use the one `Meter` component (`<canvas>`, fed by `onMasterMeter`/`onUnitMeter`, drawn on a continuous rAF loop with peak-hold/release ballistics so they stay smooth regardless of data cadence, entirely off the Solid tree). The old `.vu` CSS-animation placeholders are no longer used. Track names/colors use a **stable per-uuid ordinal** (`studio.ordinalOf`) so removing a middle track doesn't appear to drop the last one.

Dropped audio is **browser-confirmed audible** through the engine + effect chain (the `[samples]` debug logs in `samples.ts`/`studio.ts` are temporary — strip them once the in-place-drop flow is confirmed). **Next step:** real **waveforms** — `AudioFileBoxAdapter.peaks` (a `Peaks` object) is cleanly available, and the SDK ships a `PeaksPainter`/`ui/renderer/audio` for Canvas2D rendering; draw them on `<canvas>` for the `ClipDetail` sample view (replacing the mock `cd-wave-bar` divs) and ideally on the arrange clips. Then render Arrange clips from the engine's region adapters (retiring the local overlay; would also fix BPM-tracking of clip widths). Deferred: **per-track** metering (needs the engine's per-unit peak broadcast, not exposed). Stretch: a basic parametric EQ device and the MIDI player (which reintroduces synth tracks + type-aware drop).

## Tech stack (decided)

| Layer | Choice | Notes |
|------|--------|-------|
| Audio engine | **openDAW** — we import `@opendaw/studio-core` (engine: `Project`, `AudioWorklets`, `Workers`, `EngineFacade`), `@opendaw/studio-adapters` (`InstrumentFactories`), `@opendaw/lib-std`/`lib-dsp`/`lib-runtime`. `@opendaw/studio-sdk` is just a thin meta-package (`OPENDAW_SDK_VERSION`). | Real pro engine in an AudioWorklet, stock instruments/effects, mixer, timeline, Web Audio + Web MIDI. **Alpha (`0.0.x`) and the API drifts between releases** — installed `studio-core` is `0.0.152`. Read the real `.d.ts` in `node_modules`; the GitHub `opendaw-headless` template (`0.0.107`) is already out of date and won't compile as-is. |
| UI framework | **SolidJS** | Fine-grained reactivity, JSX, minimal runtime overhead — chosen for snappy, high-frequency control updates. |
| Build/dev | **Vite 6** + **TypeScript** (managed with **bun**) | `vite-plugin-solid`. Vite 6 (not 7) for `vite-plugin-solid` compatibility. |
| Hot/real-time views | **Canvas / WebGL** | Timeline, piano roll, waveforms, meters, automation lanes render to canvas (driven by `requestAnimationFrame`), **not** the DOM/Solid tree. |
| License | SDK packages are **LGPL-3.0-or-later**; our app license is our choice | See *Licensing* — this is *not* AGPL. |

## Bootstrapping & commands

Package manager / runner is **bun**. The dev server runs over **`http://localhost:8080`** — `localhost` is already a secure context and the COOP/COEP headers in `vite.config.ts` enable cross-origin isolation, so **no HTTPS cert / mkcert is needed** for local dev.

```bash
bun install
bun run dev        # vite dev server on http://localhost:8080
bun run build      # production build to dist/
bun run preview    # serve the production build (COOP/COEP headers preserved)
bun run typecheck  # tsc --noEmit
```

- **Node:** v20+ works; openDAW's own monorepo wants Node >= 23 (this machine has v24).
- **WSL note:** the project lives on `/mnt/c`, so `bun` here is the *Windows* binary and the dev server binds to Windows `localhost` — open it in a Windows browser, not from inside WSL (curling it from WSL won't connect).
- The engine boot lives in `src/engine/studio.ts`. The GitHub template **`andremichelle/opendaw-headless`** (`src/main.ts`) is a useful *reference* for the boot shape, but it targets an older SDK — defer to the installed types.
- No test/lint tooling yet — record exact commands here when added.

## Architecture (the big picture)

Three concerns live on **two threads**, separated by a hard boundary. Understanding this boundary is the key to working productively here.

```
  ┌─────────────────────────── Main thread ───────────────────────────┐     ┌─── Audio thread ───┐
  │  SolidJS UI            BoxGraph (project document / state)         │     │  AudioWorklet      │
  │  (panels, knobs,  ◄──► reactive model: tracks, clips, devices,  ◄──┼────►│  EngineProcessor   │
  │   dialogs)             params — the single source of truth)       │ msg │  (openDAW DSP)     │
  │  Canvas/WebGL views ───────────────────────────────────────────── │     │  real-time render  │
  └────────────────────────────────────────────────────────────────── ┘     └────────────────────┘
```

- **Engine (openDAW, audio thread).** All DSP runs inside an AudioWorklet (`EngineProcessor`) off the main thread. You never touch the audio buffer directly from UI code — you mutate the project model and the engine reacts. Treat the engine as opaque; drive it through the SDK.
- **State (BoxGraph).** openDAW's project document is a reactive graph ("boxes"/vertices) that is the **single source of truth** for tracks, clips, devices, automation, and parameter values. The UI *subscribes* to it and *mutates* it; it does not keep a parallel copy of project state. Y.js/CRDT-based collaboration is a future possibility built on this model — don't reinvent state management around it.
- **UI (Solid + Canvas).** Solid renders the chrome (transport, mixer strips, browser, dialogs, knob/fader components) and reacts to BoxGraph changes. **Real-time, high-frequency visuals (playhead, meters, waveforms, piano roll, automation) must render to Canvas/WebGL on a `rAF` loop**, not through Solid's reactive DOM, or the UI will not stay snappy.

**Golden rule:** UI → mutate BoxGraph → engine reacts. Never block the main thread, and never try to do sample-level DSP in UI/JS code — that's the engine's job.

## Critical constraints / gotchas

- **Cross-origin isolation is mandatory.** The engine relies on `SharedArrayBuffer`, which requires the page to be cross-origin isolated. We set the `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` headers manually in `vite.config.ts` (`server.headers` and `preview.headers`); **the production host must send the same two headers.** Forgetting these is the most likely "works in dev, breaks in prod" failure. `createStudio()` asserts `crossOriginIsolated` up front. All embedded cross-origin assets must then be CORP/CORS-compatible.
- **Secure context required.** Serve over HTTPS (or `localhost`) — Web MIDI and `SharedArrayBuffer` are unavailable otherwise.
- **The SDK is alpha (`0.0.x`) and drifts.** Expect breaking changes between releases (e.g. `0.0.107`→`0.0.152` renamed the soundfont manager and added required `ProjectEnv` services). All SDK calls are isolated in `src/engine/` so churn touches one place. When updating, read the installed `.d.ts` in `node_modules/@opendaw/*` — don't trust the GitHub template or older code.
- **`AnimationFrame.start(window)` is mandatory for live UI state.** The engine runs in the AudioWorklet and pushes `position`/`isPlaying`/`bpm`/`cpu` to the main thread through a `SharedArrayBuffer` reader that the `EngineWorklet` pumps via `AnimationFrame.add()` (from `@opendaw/lib-dom`). That scheduler only ticks if `AnimationFrame.start(window)` is called once (done in `createStudio`). Without it, audio still plays but every transport readout, the playhead, and meters are frozen — the classic "nothing updates" symptom. The headless template omits this because it has no UI.
- **Engine boot needs a browser.** `createStudio()` can't run in Node/headless (needs `crossOriginIsolated`, `AudioWorklet`, OPFS, and a user gesture to resume audio). Verify audio changes in a real browser via the console smoke hook, not just typecheck/build.
- **openDAW's sample/soundfont CDN (`api.opendaw.studio`) is origin-blocked from `localhost`.** At boot, `new SoundfontService()` eagerly fetches the remote soundfont list and the request is CORS-rejected — a harmless flood of console errors (fire-and-forget; boot still succeeds), unrelated to playback. For offline-testable audio use **self-contained synths** (`InstrumentFactories.Vaporisateur`, `Apparat`), not samplers (`Nano`, `Playfield`, `Soundfont`) which need CDN assets. Real sample/soundfont support later needs self-hosting or a proxy (the API roots are hardcoded constants in the SDK, so a Vite proxy won't intercept them).
- **Desktop / landscape only.** Don't spend effort on mobile/touch layouts or responsive breakpoints below tablet landscape.

## Code conventions

This project lives inside the openDAW ecosystem, so we follow openDAW's house style where it keeps us consistent with the SDK. Most of these rely on utilities from **`@opendaw/lib-std`** (openDAW's standard library) — reach for those instead of hand-rolling equivalents.

**Null / optional handling (via `@opendaw/lib-std`):**
- Never write `| null` or `| undefined` inline — use `Optional<T>` and `Nullable<T>`.
- Never use falsy checks (`!value`, `if (!value)`) for null/undefined. Use `isDefined(value)`, `!isDefined(value)`, or `isAbsent(value)`.
- Use `Option<T>` (not `Optional<T>`) for **fallible** return values.
- Prefer `MutableObservableOption<T>` over `DefaultObservableValue<Nullable<T>>`; use `wrap(value)` / `clear()` rather than `setValue(value)` / `setValue(null)`.

**Types:**
- Never use `as any`, and never use `"foo" in bar` for type checks — define proper types and type guards.
- Use the real type from its source; don't invent ad-hoc structural types (`{ name: string, value: number }`) when one already exists.
- Never use `!` definite-assignment (`let x!: T`) to silence the compiler.
- For UUID collections use `UUID.newSet` / `UUID.newMap` (byte-correct `SortedSet`), never a plain `Set`/`Map` over `UUID.Bytes`.
- Type-check with `tsc --noEmit` so no stray `.js` / `.d.ts` files get emitted.

**Error handling:**
- No `try/catch` — use `tryCatch()` from `@opendaw/lib-std`.

**Style:**
- Minimize comments; code should be self-explanatory. Comment only genuinely non-obvious logic.
- No blank lines inside method bodies — keep them compact.
- Compact destructuring: group properties on one line, breaking to multiple lines only past ~120 chars.
- Descriptive lambda parameters (`entry`, `value`, `event`) — never single letters.
- Move complex field setup into the constructor instead of inline field initializers.
- Toggle visibility with a `.hidden` class (`classList.add/remove("hidden")`), not `style.display`.

**Solid note:** openDAW's "create elements as `const` and embed them as `{el}`" rule is specific to its *vanilla-TS* JSX. We use **SolidJS**, so achieve the same ends with signals, `<Show>` / conditional rendering, and `classList`. The intent behind it — no `!` assertions, no imperative `display` toggling — still applies.

**Workflow:**
- For non-trivial bugs, analyze and propose the fix first; wait for approval before editing code.
- Prefer small `Edit` diffs over rewriting whole files with `Write`.

## Licensing

The distinction matters: the openDAW **studio application** (the full app at `andremichelle/openDAW`) is AGPL-3, but the **SDK packages we actually depend on** — `@opendaw/studio-core`, `studio-adapters`, `lib-std`, `lib-dsp`, `lib-runtime`, etc. — are **LGPL-3.0-or-later** (confirmed in each package's `package.json`). LGPL does **not** force our app's own code under (A)GPL: we may license this project however we choose, provided we honour LGPL for the libraries — keep them open/replaceable and publish any modifications *to the libraries themselves*. The one wrinkle: LGPL's "relinking" provision assumes dynamic linking, which maps awkwardly onto a JS bundler that statically inlines the library. The clean way to stay compliant for a free project is to keep the whole app open-source (the stated goal). This is not legal advice — confirm before shipping anything proprietary.

## Key references

- openDAW (core, vanilla-TS monorepo): https://github.com/andremichelle/openDAW
- openDAW headless template (canonical SDK bootstrap): https://github.com/andremichelle/opendaw-headless
- Architecture wiki: https://deepwiki.com/andremichelle/openDAW
- SolidJS: https://www.solidjs.com — Vite: https://vite.dev
