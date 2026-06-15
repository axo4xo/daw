# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An opinionated, free, web-based multiplatform DAW (Digital Audio Workstation) — simple, light, intuitive. The goal is an FL Studio / Ableton-style production interface built **on top of the openDAW headless audio engine**, targeting desktop browsers in landscape (mobile is explicitly out of scope).

**MVP scope, in priority order:** the UI shell → multiple audio tracks → basic audio tweaks (gain/pan/mute/solo) → simple effects → a basic parametric EQ → a simple MIDI player. Anything beyond this is a stretch goal, not a commitment.

## Current state (read this first)

The **SolidJS + Vite + TypeScript shell is scaffolded and runs** (`bun run dev`; typecheck and build are green). What exists:
- A working UI shell — transport bar (play/stop/BPM/position), track list, a Canvas timeline with a moving playhead, and a mixer with faders/pan/meters.
- App state lives in a small Solid store at `src/state/project.ts`. This is a **temporary stand-in** for the engine's BoxGraph (see *Architecture*) — playback, the playhead, and meters are UI-driven placeholders, not real audio.
- The engine boundary `src/engine/studio.ts` is a **documented no-op stub**. The openDAW SDK is **not installed or wired yet**.

**Next step:** add `@opendaw/studio-sdk`, read its real types from `node_modules`, implement `createStudio()` against them (the stub already documents the init sequence), then migrate the source of truth from the Solid store onto the engine's project model.

## Tech stack (decided)

| Layer | Choice | Notes |
|------|--------|-------|
| Audio engine | **`@opendaw/studio-sdk`** (openDAW headless) | Real pro engine: `EngineProcessor` in an AudioWorklet, 26+ stock instruments/effects, mixer, timeline, Web Audio + Web MIDI. Currently **alpha (`0.0.x`)** — expect API churn; pin the version. |
| UI framework | **SolidJS** | Fine-grained reactivity, JSX, minimal runtime overhead — chosen for snappy, high-frequency control updates. |
| Build/dev | **Vite** (v7+) + **TypeScript** | Matches openDAW's own toolchain. |
| Hot/real-time views | **Canvas / WebGL** | Timeline, piano roll, waveforms, meters, automation lanes render to canvas (driven by `requestAnimationFrame`), **not** the DOM/Solid tree. |
| License | **AGPL-3** | See *Licensing*. |

## Bootstrapping

The canonical reference for wiring the engine is the official template **`andremichelle/opendaw-headless`** (Vite + TS + `@opendaw/studio-sdk` + `vite-plugin-cross-origin-isolation`). Start from its structure, then add SolidJS on top. Once scaffolded, the expected workflow is the standard Vite one:

```bash
npm install
npm run dev      # vite dev server (HTTPS — see Cross-origin isolation)
npm run build    # vite build --mode production
```

- **Node:** use a current version. openDAW's own monorepo requires **Node >= 23**; use Node 22 LTS or newer and bump if the SDK complains.
- **Local HTTPS:** the engine needs a *secure context* (for `SharedArrayBuffer` and Web MIDI). The template uses `mkcert localhost` to generate a dev certificate. Run `mkcert localhost` once during setup.
- When adding test/lint tooling (none exists yet), record the exact commands here so future sessions don't have to rediscover them.

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

- **Cross-origin isolation is mandatory.** The engine relies on `SharedArrayBuffer`, which requires the page to be cross-origin isolated. In dev this is handled by `vite-plugin-cross-origin-isolation`; **in production the hosting server must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.** Forgetting these is the most likely "works in dev, breaks in prod" failure. All embedded cross-origin assets must then be CORP/CORS-compatible.
- **Secure context required.** Serve over HTTPS (or `localhost`) — Web MIDI and `SharedArrayBuffer` are unavailable otherwise.
- **The SDK is alpha (`0.0.x`).** Expect breaking changes between releases. Pin the version, isolate SDK calls behind a thin wrapper/adapter module so an API change touches one place, and check the headless template for the current usage pattern rather than assuming an older API.
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

openDAW (and therefore anything built on `@opendaw/studio-sdk`) is **AGPL-3**. This project is intended to be **free and open-source**, which satisfies AGPL — but it means: any modifications and the full corresponding source must be made available to users who interact with it **over a network** (the AGPL "network use" clause). Keep the repo's licensing AGPL-3-compatible. A paid commercial license from openDAW exists if a proprietary path is ever needed; that is a deliberate, separate decision.

## Key references

- openDAW (core, vanilla-TS monorepo): https://github.com/andremichelle/openDAW
- openDAW headless template (canonical SDK bootstrap): https://github.com/andremichelle/opendaw-headless
- Architecture wiki: https://deepwiki.com/andremichelle/openDAW
- SolidJS: https://www.solidjs.com — Vite: https://vite.dev
