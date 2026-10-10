import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { preloadModel, useClipPlayer, useRigInstance } from './characters/rig.js'
import { DRUMS, ellPt } from './layout.js'

// Handsome Dan, Yale's bulldog. He tours a loop of 1000 randomly chosen classrooms:
// walk the cloister to the next room, go in through a door, pause at the front, head back out.

export const DAN = { x: 0, z: 0 } // live position for the minimap

const SPEED = 1.8 // m/s
const PAUSE = 2.5 // seconds hanging out at the front of each room
const TOUR_LENGTH = 1000

// cloister loop, sized to clear the plants, banquettes and columns by about 0.25 m
const RING = Array.from({ length: 120 }, (_, i) => {
  const t = (i / 120) * Math.PI * 2
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [23.4 * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3), 22.9 * Math.sign(s) * Math.pow(Math.abs(s), 1 / 3)]
})
const nearestRing = (p) => {
  let best = 0
  let bd = Infinity
  RING.forEach((q, i) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}
function ringPath(a, b) {
  const n = RING.length
  const fwd = (b - a + n) % n
  const step = fwd <= n / 2 ? 1 : -1
  const out = []
  for (let i = a; i !== b; i = (i + step + n) % n) out.push(RING[i])
  out.push(RING[b])
  return out
}

// for each classroom: the spot at the front of the room, and the door route out to the cloister
const ROOMS = DRUMS.map((d) => {
  const { fc, back, t, half } = d.front
  const at = (depth, lat) => [fc[0] + back[0] * depth + t[0] * lat, fc[1] + back[1] * depth + t[1] * lat]
  const inside = at(1.6, 0)
  const routes = d.doors.map((a) => {
    const p = ellPt(d.c, d.rx, d.rz, a)
    const n = [p[0] - d.c[0], p[1] - d.c[1]]
    const l = Math.hypot(...n)
    const inner = [p[0] - (n[0] / l) * 0.7, p[1] - (n[1] / l) * 0.7]
    const outer = [p[0] + (n[0] / l) * 1.0, p[1] + (n[1] / l) * 1.0]
    const ring = nearestRing(outer)
    return { inner, outer, ring, cost: Math.hypot(RING[ring][0] - outer[0], RING[ring][1] - outer[1]) }
  })
  const exit = routes.reduce((a, b) => (b.cost < a.cost ? b : a))
  // walk along the front of the room to the door: the front row of desks wraps round to the
  // door side, so go behind the lectern (+t side) or in front of the professor (-t side)
  const sgn = Math.sign((exit.inner[0] - fc[0]) * t[0] + (exit.inner[1] - fc[1]) * t[1])
  const via = sgn > 0 ? [at(1.0, half - 1)] : [at(0.5, -1), at(1.0, -(half - 1))]
  return { inside, via, ...exit }
})

function tour(seed) {
  let s = seed
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const out = []
  while (out.length < TOUR_LENGTH) {
    const k = Math.floor(r() * ROOMS.length)
    if (k !== out[out.length - 1]) out.push(k)
  }
  if (out[0] === out[out.length - 1]) out[out.length - 1] = (out[0] + 1) % ROOMS.length
  return out
}

function legPath(from, to) {
  const A = ROOMS[from]
  const Bb = ROOMS[to]
  return [A.inside, ...A.via, A.inner, A.outer, ...ringPath(A.ring, Bb.ring), Bb.outer, Bb.inner, ...[...Bb.via].reverse(), Bb.inside]
}

preloadModel('handsome_dan')

const STRIDE = 0.55 // meters covered per Walk cycle at timeScale 1 (the clip is 0.8 s)

function DanModel() {
  const root = useRef()
  const { object, actions } = useRigInstance('handsome_dan')
  const play = useClipPlayer(actions, 0.25)
  const walkScale = SPEED / STRIDE / (1 / 0.8)

  const state = useMemo(() => {
    const order = tour(1701) // Yale founded 1701
    return { order, leg: 0, path: legPath(order[0], order[1]), seg: 0, u: 0, pause: 0 }
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = state
    let moving = true
    if (st.pause > 0) {
      st.pause -= dt
      moving = false
    } else {
      let step = SPEED * dt
      while (step > 0) {
        const a = st.path[st.seg]
        const b = st.path[st.seg + 1]
        if (!b) {
          // arrived: pause, then start the next leg of the 1000-room loop
          st.leg = (st.leg + 1) % st.order.length
          st.path = legPath(st.order[st.leg], st.order[(st.leg + 1) % st.order.length])
          st.seg = 0
          st.u = 0
          st.pause = PAUSE
          break
        }
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6
        const left = (1 - st.u) * len
        if (step < left) {
          st.u += step / len
          step = 0
        } else {
          step -= left
          st.seg += 1
          st.u = 0
        }
      }
    }
    const a = st.path[st.seg]
    const b = st.path[st.seg + 1] || a
    const x = a[0] + (b[0] - a[0]) * st.u
    const z = a[1] + (b[1] - a[1]) * st.u
    root.current.position.set(x, 0, z)
    if (b !== a) {
      const want = Math.atan2(b[0] - a[0], b[1] - a[1])
      let d = want - root.current.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      root.current.rotation.y += d * Math.min(1, dt * 8)
    }
    DAN.x = x
    DAN.z = z
    if (import.meta.env.DEV) document.body.dataset.dan = `${x.toFixed(2)},${z.toFixed(2)},${st.order[st.leg]},${st.order[(st.leg + 1) % st.order.length]}`
    // Walk while touring, Idle (pant, look around) while he pauses at the front of a room
    play(moving ? 'Walk' : 'Idle', { timeScale: moving ? walkScale : 1 })
  })

  return (
    <group ref={root}>
      <primitive object={object} />
    </group>
  )
}

export default function HandsomeDan() {
  return (
    <Suspense fallback={null}>
      <DanModel />
    </Suspense>
  )
}
