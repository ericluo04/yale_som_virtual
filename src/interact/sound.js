import { createStore } from './store.js'

// All sound is synthesized with the Web Audio API, so nothing is downloaded.
// The AudioContext starts on the first click, tap or key press (browser autoplay rule).
// Signal path: voices -> dry bus + reverb send -> master (mute) -> speakers.

const LS_MUTE = 'evans.muted'
const readMuted = () => {
  try {
    return localStorage.getItem(LS_MUTE) === '1'
  } catch {
    return false
  }
}

export const soundState = createStore({ started: false, muted: readMuted() })

let ctx = null
let master = null
let dry = null
let verb = null
let noise = null // 2 s of white noise, reused by every percussive voice
let amb = null // { hum, chatter } gains
let place = ''
const rand = (a, b) => a + Math.random() * (b - a)

function makeNoise(seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return buf
}

// a small-room impulse response: decaying noise, ~1.1 s
function makeImpulse() {
  const len = Math.floor(ctx.sampleRate * 1.1)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  }
  return buf
}

function start() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return
  }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = soundState.get().muted ? 0 : 1
  master.connect(ctx.destination)
  dry = ctx.createGain()
  dry.connect(master)
  verb = ctx.createConvolver()
  verb.buffer = makeImpulse()
  const verbOut = ctx.createGain()
  verbOut.gain.value = 0.5
  verb.connect(verbOut).connect(master)
  noise = makeNoise(2)
  startAmbience()
  soundState.set({ started: true })
}

// out(node, send): route a voice to the dry bus and optionally the reverb
function out(node, send = 0.15) {
  node.connect(dry)
  if (send > 0) {
    const g = ctx.createGain()
    g.gain.value = send
    node.connect(g).connect(verb)
  }
}

function burst({ t = ctx.currentTime, dur = 0.08, gain = 0.2, type = 'lowpass', freq = 800, q = 0.7, attack = 0.004, send = 0.1, dest = null }) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur)
  src.connect(f).connect(g)
  if (dest) g.connect(dest)
  else out(g, send)
  src.start(t, rand(0, 1.5))
  src.stop(t + attack + dur + 0.05)
  return f
}

function tone({ t = ctx.currentTime, f0 = 440, f1 = null, dur = 0.1, gain = 0.1, type = 'sine', attack = 0.005, send = 0.1, dest = null }) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur)
  o.connect(g)
  if (dest) g.connect(dest)
  else out(g, send)
  o.start(t)
  o.stop(t + attack + dur + 0.05)
}

// ---------- ambience: HVAC hum (brown noise + mains hum) and distant chatter (formant-filtered noise)
function startAmbience() {
  const hum = ctx.createGain()
  hum.gain.value = 0.06
  out(hum, 0)
  const brown = ctx.createBufferSource()
  brown.buffer = makeNoise(4, true)
  brown.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 220
  brown.connect(lp).connect(hum)
  brown.start()
  for (const [f, v] of [[60, 0.05], [120, 0.08], [180, 0.02]]) {
    const o = ctx.createOscillator()
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.value = v
    o.connect(g).connect(hum)
    o.start()
  }

  // chatter: three "voices", each a pair of vowel formants whose loudness jumps around like syllables
  const chatter = ctx.createGain()
  chatter.gain.value = 0.05
  const far = ctx.createBiquadFilter()
  far.type = 'lowpass'
  far.frequency.value = 1800 // distance: the highs are gone
  chatter.connect(far)
  out(far, 0.6)
  const voices = [
    [500, 1500, 0],
    [420, 1100, 1],
    [650, 1900, 2],
  ].map(([f1, f2, i]) => {
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    const g = ctx.createGain()
    g.gain.value = 0
    const filters = [f1, f2].map((f) => {
      const b = ctx.createBiquadFilter()
      b.type = 'bandpass'
      b.frequency.value = f
      b.Q.value = 9
      src.connect(b).connect(g)
      return b
    })
    g.connect(chatter)
    src.start(0, i * 0.4)
    return { g, filters, base: [f1, f2] }
  })
  // syllable clock: every ~110 ms nudge each voice's loudness and vowel; pauses between "sentences"
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    for (const v of voices) {
      const talking = Math.random() < 0.8
      v.g.gain.setTargetAtTime(talking ? rand(0.3, 1) : 0, t, 0.04)
      v.filters.forEach((b, k) => b.frequency.setTargetAtTime(v.base[k] * rand(0.8, 1.25), t, 0.05))
    }
  }, 110)
  amb = { hum, chatter }
  setPlace(place)
}

// where: the location string from layout.locate(); rooms are quieter than the cloister
function setPlace(where = '') {
  place = where
  if (!amb) return
  const t = ctx.currentTime
  const outside = where.includes('outside')
  const room = /Meeting|Library|Classroom/.test(where)
  amb.hum.gain.setTargetAtTime(outside ? 0.015 : 0.06, t, 0.6)
  amb.chatter.gain.setTargetAtTime(outside ? 0.015 : room ? 0.025 : 0.05, t, 0.6)
}

// ---------- footsteps: surface 'carpet' | 'stone' | 'grass'; speed in m/s (2.4 crouch, 5.5 walk, 9.5 sprint)
function step(surface = 'carpet', speed = 5.5) {
  if (!ctx) return
  const t = ctx.currentTime
  const v = Math.min(1.4, 0.45 + speed / 10) // faster steps land harder
  const p = rand(0.9, 1.1) // pitch jitter so no two steps match
  if (surface === 'stone') {
    burst({ t, dur: 0.045, gain: 0.11 * v, type: 'bandpass', freq: 2200 * p, q: 1.4, send: 0.5 }) // heel click
    burst({ t, dur: 0.07, gain: 0.16 * v, type: 'lowpass', freq: 520 * p, send: 0.3 })
    burst({ t: t + 0.055, dur: 0.03, gain: 0.05 * v, type: 'bandpass', freq: 3000 * p, q: 2, send: 0.4 }) // toe
  } else if (surface === 'grass') {
    burst({ t, dur: 0.12, gain: 0.05 * v, type: 'bandpass', freq: 3500 * p, q: 0.6, send: 0 })
    burst({ t, dur: 0.06, gain: 0.08 * v, type: 'lowpass', freq: 300, send: 0 })
  } else {
    burst({ t, dur: 0.09, gain: 0.2 * v, type: 'lowpass', freq: (260 + speed * 30) * p, send: 0.05 }) // muffled thud
    tone({ t, f0: 75 * p, f1: 50, dur: 0.06, gain: 0.08 * v, send: 0 })
    burst({ t: t + 0.06, dur: 0.05, gain: 0.04 * v, type: 'bandpass', freq: 900 * p, q: 0.8, send: 0 }) // fabric scuff
  }
}

// ---------- positional one-shots (doors): a PannerNode at (x, z)
function panner(x, z, y = 1.2) {
  const pn = ctx.createPanner()
  pn.panningModel = 'HRTF'
  pn.distanceModel = 'inverse'
  pn.refDistance = 1.5
  pn.rolloffFactor = 1.2
  if (pn.positionX) {
    pn.positionX.value = x
    pn.positionY.value = y
    pn.positionZ.value = z
  } else pn.setPosition(x, y, z)
  out(pn, 0.25)
  return pn
}

// glass door swing: an air whoosh that sweeps up, and a soft latch thunk when it closes
function door(x, z, opening = true) {
  if (!ctx) return
  const t = ctx.currentTime
  const pn = panner(x, z)
  const f = burst({ t, dur: 0.45, gain: 0.09, type: 'bandpass', freq: 350, q: 1.5, attack: 0.08, dest: pn })
  f.frequency.exponentialRampToValueAtTime(opening ? 1200 : 600, t + 0.45)
  tone({ t: t + 0.02, f0: 140, f1: 110, dur: 0.25, gain: 0.03, type: 'triangle', dest: pn }) // pivot hinge
  if (!opening) {
    burst({ t: t + 0.42, dur: 0.05, gain: 0.12, type: 'lowpass', freq: 700, dest: pn })
    tone({ t: t + 0.42, f0: 2400, dur: 0.12, gain: 0.015, dest: pn }) // glass ring
  }
}

// camera position and flat forward vector; call every frame
function listen(x, y, z, fx, fz) {
  if (!ctx) return
  const L = ctx.listener
  if (L.positionX) {
    const t = ctx.currentTime
    L.positionX.setValueAtTime(x, t)
    L.positionY.setValueAtTime(y, t)
    L.positionZ.setValueAtTime(z, t)
    L.forwardX.setValueAtTime(fx, t)
    L.forwardY.setValueAtTime(0, t)
    L.forwardZ.setValueAtTime(fz, t)
    L.upX.setValueAtTime(0, t)
    L.upY.setValueAtTime(1, t)
    L.upZ.setValueAtTime(0, t)
  } else {
    L.setPosition(x, y, z)
    L.setOrientation(fx, 0, fz, 0, 1, 0)
  }
}

// ---------- UI
function blip(level = 1) {
  if (!ctx) return
  tone({ f0: 660, f1: 990, dur: 0.07, gain: 0.05 * level, type: 'triangle', send: 0.05 })
}

function tick() {
  if (!ctx) return
  tone({ f0: rand(1700, 1900), dur: 0.015, gain: 0.012, type: 'square', send: 0 })
}

// discovery: a soft bell arpeggio, C6 E6 G6 C7, each with an inharmonic overtone
function chime() {
  if (!ctx) return
  const t = ctx.currentTime
  ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    tone({ t: t + i * 0.09, f0: f, dur: 1.4, gain: 0.05, send: 0.6, attack: 0.004 })
    tone({ t: t + i * 0.09, f0: f * 2.76, dur: 0.5, gain: 0.012, send: 0.6, attack: 0.004 })
  })
}

function setMuted(m) {
  soundState.set({ muted: m })
  try {
    localStorage.setItem(LS_MUTE, m ? '1' : '0')
  } catch {
    // private window or blocked storage: mute still works for this visit
  }
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05)
}

export const sound = {
  start,
  step,
  door,
  listen,
  setPlace,
  blip,
  tick,
  chime,
  setMuted,
  toggleMute: () => setMuted(!soundState.get().muted),
  get context() {
    return ctx
  },
}

// first gesture starts audio; N toggles mute (M is the map)
if (typeof window !== 'undefined') {
  const first = () => start()
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, first, { passive: true })
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyN' && !e.repeat) sound.toggleMute()
  })
}
