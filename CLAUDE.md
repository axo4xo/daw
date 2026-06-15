# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An opinionated, free, web-based multiplatform DAW (Digital Audio Workstation) — simple, light, intuitive. The goal is an FL Studio / Ableton-style production interface built **on top of the openDAW headless audio engine**, targeting desktop browsers in landscape (mobile is explicitly out of scope).

**MVP scope, in priority order:** the UI shell → multiple audio tracks → basic audio tweaks (gain/pan/mute/solo) → simple effects → a basic parametric EQ → a simple MIDI player. Anything beyond this is a stretch goal, not a commitment.

## Current state (read this first)

The **SolidJS + Vite + TS shell and the real openDAW engine layer are both in place**; typecheck and build are green. What exists:
- **Engine layer (`src/engine/`)** — `createStudio()` boots the real openDAW engine (Workers → AudioWorklets → `Project.new` → `startAudioWorklet` → `engine.isReady`) and returns a typed `Studio` facade. This is the **only** place that imports the SDK. Surface:
  - Transport: `play/stop/setPosition/setBpm`, `onPlayingChange/onPositionChange/onBpmChange/onCpuLoadChange`, `loadDemo()`.
  - `studio.mixer` (`src/engine/mixer.ts`): engine-backed tracks as flat `MixerTrack` snapshots (`uuid/label/type/volume/volumeText/pan/mute/solo`). `mixer.list()`, `mixer.subscribe(cb)` (fires the full list on any structural or parameter change), `createInstrumentTrack(key?)`, `setVolume/setPan/setMute/setSolo`, `remove`. All mutations go through `editing.modify`; tracks read from `rootBoxAdapter.audioUnits` and each unit's `namedParameter.{volume,panning,mute,solo}`.
  - Escape hatches: `project`/`engine`/`audioContext` for box-graph access the facade doesn't cover.
  - **Engine boot + audio are browser-verified**; the mixer API is **typecheck/build verified but its runtime is not yet exercised** — drive it from the console (below) to confirm.
- The engine is **lazy-loaded** (dynamic `import("./engine")`) so its ~1 MB bundle + worklet + wasm stay out of first paint. A console smoke hook is wired in `src/index.tsx`: after clicking the page, run `const s = await window.daw.createStudio(); s.loadDemo(); s.play()`.
- **Solid integration (`src/studio.tsx`)** — `StudioProvider` / `useStudio()`: a context that boots the engine on a user gesture (`start()`) and exposes a reactive store (`phase`, `playing`, `bpm`, `position`, `cpu`, `tracks`) plus actions (`togglePlay`, `setBpm`, `loadDemo`, `addTrack`, `setVolume/setPan/toggleMute/toggleSolo`, `removeTrack`). It **lazy-imports `./engine` via `import()`** and uses **no SDK utilities**, so the main chunk stays ~20 kB and SDK-free. Convention note: the strict lib-std rules apply to `src/engine/` (the lazy, SDK-facing code); the thin Solid glue stays framework-only.
- **UI (`src/ui/`)** — the FL/Ableton-style **"Looper"** interface, ported from the user's HTML mockup to Solid + CSS (`src/index.css` design system). `Looper.tsx` holds the title bar, transport, browser, and the Arrange / Mix views (Session removed); `decor.ts` is the **static mock data** (clips, devices, waveform, browser, the `palette`) for the parts the engine doesn't expose yet. Fonts are system stacks — Google Fonts are blocked by COEP, so self-host if exact faces are needed.
  - **Engine-wired (live):** the transport bar (play/stop, editable BPM, bars·beats + time, CPU); the Arrange playhead; the **Mix view** (channel strips + master from `studio.mixer`, interactive pointer-drag `Fader`/`PanKnob` → `setVolume`/`setPan`, M/S → `setMute`/`setSolo`); and the **Arrange track headers** (real track list, mute/solo synced with Mix). Boot is on mount; 6 tracks are auto-seeded (one with a demo loop) so it's populated and audible.
  - **Still mock (decor):** the Arrange clips (lanes show `decor.ts` clips by track index), the browser, the bottom Sample/Effects device racks. **Meters are CSS-animated placeholders** (`.vu` classes, alive on playback) — not real PPM.

**Next step:** real metering — openDAW exposes level only via `MeterWorklet` (`{peak, rms}` Float32Arrays) / the `liveStreamReceiver`, neither cleanly per-unit on the adapters, so it needs the audio-graph tap wired and browser-verified. Then real Arrange clips from note/audio regions, and the effects chain (`insertEffect` / `EffectFactories`).

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
