import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { openDialogue, useInteractable } from '../interact/index.jsx'
import { RING } from '../HandsomeDan.jsx'
import { POIS, Walker, fromPoi, toPoi } from './walk.js'
import { angleTo, rand, timed, turnToward, useLabubuRig } from './common.js'

// Three Labubus roam the cloisters: Dan's loop plus spurs to the library, the merch stand, Lisa's kiosk, the
// cafe stair, the Beinecke doors, Froggy's poster and the courtyard glass. At each stop they look around for
// 5 to 15 s. One wears headphones and bobs to the music. Within 4 m, when you and it face each other, it waves.
// Press E to hear what it thinks of the course.
const LINES = [
  'HW4 is due Friday. My vendor desk still gives a discount to anyone who says please.',
  'Lisa answered my question at 3 a.m. and then asked if I had eaten. I had not.',
  'Do not paste the homework page into a chatbot. There is a dump trap in it. Dumbledore appears next to a trash can. I have seen it happen.',
  'Every token costs money. I spent forty cents asking a model to summarize my own notes. Tokenomics is lecture eleven, and I skipped it.',
  'Froggy reads the AI Safety paper out loud by the east wall all day. He says the frog hood is for alignment.',
  "Dumbledore's office hours: he answers every question with another question, and somehow you leave with working code.",
  'Attendance is 10% and it is a QR code. I hopped all the way up from the courtyard to scan it.',
  'My final project is an agent that orders me coffee. It ordered forty coffees. Deployment is lecture eight.',
  'Campus Customs sold out of MGT 409 tees again. My multi-agent team was supposed to restock them.',
  'Vibe coding: I describe it, Codex writes it, and I find out what broke. Mostly I find out what broke.',
]
let lineIdx = 0

const CREW = [
  { name: 'Mocha', fur: '#6b4a3a', expression: 'grin', shirt: 'yale', start: 10, seed: 11 },
  { name: 'Bubblegum', fur: '#ff9ccc', expression: 'mischief', shirt: '#2f6b4f', start: 50, seed: 23, headphones: true },
  { name: 'Pebble', fur: '#9a9aa2', expression: 'happy', shirt: 'stripes', pants: '#2b2b2e', overalls: true, start: 90, seed: 37 },
]
export const ROAMERS = [] // live positions (dev readout for screenshots)

const HEAD_MAT = new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.4, metalness: 0.3 })
const CUP_MAT = new THREE.MeshStandardMaterial({ color: '#f4f4f6', roughness: 0.35 })
function headphones() {
  // in the head bone's frame (Y up, Z forward, origin at the neck, 0.5 m above the feet): a band over the
  // crown between the ears and two cups on the sides of the head at eye height
  const g = new THREE.Group()
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.022, 8, 28, Math.PI), HEAD_MAT)
  band.position.set(0, 0.24, -0.02)
  g.add(band)
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20), CUP_MAT)
    cup.rotation.z = Math.PI / 2
    cup.position.set(0.33 * s, 0.24, -0.02)
    g.add(cup)
  }
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}

const _cam = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _x = new THREE.Vector3(1, 0, 0)
function Roamer({ cfg, id }) {
  const rig = useLabubuRig(cfg)
  const root = useRef()
  const st = useMemo(() => {
    const r = rand(cfg.seed)
    const w = new Walker(0.85, 0.6)
    const s = { r, w, ring: cfg.start, phase: 'go', poi: null, until: 0, waveUntil: 0, waveCool: 0, talkUntil: 0, pos: [0, 0, 0] }
    s.poi = POIS[Math.floor(r() * POIS.length)]
    w.start(toPoi(s.ring, s.poi))
    return s
  }, [cfg])
  ROAMERS[id] = st.pos
  useMemo(() => {
    if (cfg.headphones && rig.bones.head) rig.bones.head.add(headphones())
  }, [rig, cfg.headphones])

  useInteractable({
    position: () => st.pos,
    radius: 2.2,
    label: `${cfg.name}, a Labubu`,
    verb: 'Talk to',
    marker: 'npc',
    onInteract: () => {
      st.talkUntil = performance.now() / 1000 + 4
      const text = LINES[lineIdx++ % LINES.length]
      openDialogue([{ speaker: cfg.name, text }])
    },
  })

  useFrame(
    timed((state, dt) => {
      dt = Math.min(dt, 0.05)
      const t = state.clock.elapsedTime
      const { r, w } = st
      const o = root.current
      const cam = state.camera.getWorldPosition(_cam)
      const dx = cam.x - o.position.x
      const dz = cam.z - o.position.z
      const dist = Math.hypot(dx, dz)
      const talking = performance.now() / 1000 < st.talkUntil
      // wave when we face each other within 4 m (cool down 20 s)
      if (!talking && t > st.waveCool && dist < 4 && dist > 0.8 && Math.abs(cam.y - 1.65) < 2.5 && w.mode !== 'hop') {
        const fwd = [Math.sin(o.rotation.y), Math.cos(o.rotation.y)]
        const facesYou = (fwd[0] * dx + fwd[1] * dz) / dist > 0.3
        const cf = state.camera.getWorldDirection(new THREE.Vector3())
        const youFace = -(cf.x * dx + cf.z * dz) / (Math.hypot(cf.x, cf.z) * dist + 1e-6) > 0.6
        if (facesYou && youFace) {
          st.waveUntil = t + 2.6
          st.waveCool = t + 20
        }
      }
      let clip
      let ts = 1
      if (talking || t < st.waveUntil) {
        turnToward(o, angleTo([o.position.x, o.position.z], [cam.x, cam.z]), dt * 6)
        clip = talking ? 'Talk' : 'Wave'
      } else if (st.phase === 'stop') {
        turnToward(o, st.poi.look, dt * 3)
        clip = st.poi.name === 'merch' || st.poi.name === 'lisa' ? 'Idle' : 'Look'
        if (t > st.until) {
          w.start(fromPoi(st.poi))
          st.ring = st.poi.ring
          st.phase = 'back'
        }
      } else {
        const mode = w.update(dt)
        o.position.set(w.pos.x, w.pos.y, w.pos.z)
        turnToward(o, w.yaw, dt * 7)
        clip = 'Walk'
        ts = 1.6
        if (w.done) {
          if (st.phase === 'go') {
            st.phase = 'stop'
            st.until = t + 5 + r() * 10
          } else {
            // back on the loop: pick the next stop (not the same one twice)
            let next = st.poi
            while (next === st.poi) next = POIS[Math.floor(r() * POIS.length)]
            st.poi = next
            w.start(toPoi(st.ring, next))
            st.phase = 'go'
          }
        }
        void mode
      }
      rig.play(clip, { timeScale: ts, fade: 0.25 })
      st.pos[0] = o.position.x
      st.pos[1] = o.position.y
      st.pos[2] = o.position.z
      st.pos[3] = o.rotation.y
      if (rig.tick(dt, state, 34) && cfg.headphones && rig.bones.head) {
        // bob to the beat (about 118 bpm) on top of whatever the clip does
        _q.setFromAxisAngle(_x, 0.13 * Math.max(0, Math.sin(t * Math.PI * 2 * 1.97)))
        rig.bones.head.quaternion.multiply(_q)
      }
    }),
  )
  const p0 = RING[cfg.start]
  return (
    <group ref={root} position={[p0[0], 0, p0[1]]}>
      <primitive object={rig.object} />
    </group>
  )
}

export default function Roamers() {
  if (import.meta.env.DEV && typeof window !== 'undefined') (window.__life ||= {}).roamers = ROAMERS
  return CREW.map((c, i) => <Roamer key={c.name} cfg={c} id={i} />)
}
