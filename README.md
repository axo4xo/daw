# daw

An opinionated, web-based DAW. Simple, light, intuitive, free.

The idea is an FL Studio / Ableton-style interface that runs in the browser,
built on top of the [openDAW](https://github.com/andremichelle/openDAW) headless
engine so the hard parts — real-time DSP, mixing, MIDI — don't have to be
reinvented. Desktop-first and landscape; mobile isn't a goal.

Early days: right now this is mostly a plan. The app isn't scaffolded yet.

## Stack

- **openDAW headless SDK** — the audio engine (runs in an AudioWorklet: effects, mixer, MIDI)
- **SolidJS + Vite + TypeScript** — the UI
- **Canvas / WebGL** — timeline, meters, piano roll, and anything that has to stay smooth

## Roadmap

Rough order, MVP first:

- [ ] Project scaffold (Vite + Solid, engine wired up)
- [ ] UI shell — transport, track list, mixer
- [ ] Multiple audio tracks
- [ ] Basic mixing — gain, pan, mute / solo
- [ ] Simple effects
- [ ] Basic parametric EQ
- [ ] Simple MIDI player

Anything past the MVP is open-ended — depends how it goes.

## License

AGPL-3, same as openDAW, which this is built on. Free and open: if you run a
modified version for other people, share the source.
