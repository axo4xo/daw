# daw

An opinionated, web-based DAW. Simple, light, intuitive, free.

The idea is a modern DAW interface that runs in the browser,
built on top of the [openDAW](https://github.com/andremichelle/openDAW) headless
engine so the hard parts, real-time DSP, mixing, MIDI, don't have to be
reinvented. Desktop-first and landscape, mobile isn't a goal.

## Stack

- **openDAW headless SDK**: the audio engine (runs in an AudioWorklet: effects, mixer, MIDI)
- **SolidJS + Vite + TypeScript**: the UI
- **Canvas / WebGL**: timeline, meters, piano roll, and anything that has to stay smooth

## Roadmap

MVP scope:

- [x] Project scaffold
- [x] UI shell: transport, track list, mixer
- [ ] Wire the openDAW engine (real audio behind the shell)
- [ ] Multiple audio tracks
- [ ] Basic mixing: gain, pan, mute / solo
- [ ] Simple effects
- [ ] Basic parametric EQ
- [ ] Simple MIDI player

Anything past the MVP is open-ended.

## Develop 
Bun is preferred, but any package manager is basically okay:

```bash
npm install
npm run dev
``` 

## License

[AGPL-3, same as openDAW](https://www.gnu.org/licenses/agpl-3.0.txt), which this is built on.
