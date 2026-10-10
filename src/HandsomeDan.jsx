import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { preloadModel, useClipPlayer, useRigInstance } from './characters/rig.js'
import { DRUMS, ellPt } from './layout.js'
import { FRISBEE } from './life/Frisbee.jsx'
import { fx } from './life/fx.jsx'
import { LIFE_ON, sfx } from './life/common.js'

// Handsome Dan, Yale's bulldog. He tours a loop of 1000 randomly chosen classrooms:
// walk the cloister to the next room, go in through a door, pause at the front, head back out.

export const DAN = { x: 0, z: 0 } // live position for the minimap

const SPEED = 1.8 // m/s
const PAUSE = 2.5 // seconds hanging out at the front of each room
const TOUR_LENGTH = 1000

// cloister loop, sized to clear the plants, banquettes and columns by about 0.25 m
export const RING = Array.from({ length: 120 }, (_, i) => {
  const t = (i / 120) * Math.PI * 2
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [23.4 * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3), 22.9 * Math.sign(s) * Math.pow(Math.abs(s), 1 / 3)]
})
export const nearestRing = (p) => {
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
export function ringPath(a, b) {
  const n = RING.length
  const fwd = (b - a + n) % n
  const step = fwd <= n / 2 ? 1 : -1
  const out = []
  for (let i = a; i !== b; i = (i + step + n) % n) out.push(RING[i])
  out.push(RING[b])
  return out
}

// for each classroom: the spot at the front of the room, and the door route out to the cloister
export const ROOMS = DRUMS.map((d) => {
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

  const ep = useMemo(() => ({ phase: null, t: 0, saved: null, target: -1 }), [])
  const jaw = useMemo(() => {
    let j = null
    object.traverse((b) => b.isBone && b.name === 'jaw' && (j = b))
    return j
  }, [object])
  const headBone = useMemo(() => {
    let j = null
    object.traverse((b) => b.isBone && b.name === 'head' && (j = b))
    return j
  }, [object])

  // The frisbee episode (src/life/Frisbee.jsx): when a disc lies on the lawn and Dan is out on the cloister loop,
  // he apparates down to the lawn, sniffs the disc, carries it in his mouth to the nearest player, and apparates
  // back to the exact spot of his tour, which then carries on.
  const episode = (t, dt) => {
    const o = root.current
    const here = [o.position.x, o.position.y, o.position.z]
    const pop = (p) => {
      fx.sparks([p[0], p[1] + 0.45, p[2]], { count: 160, colors: ['#ffffff', '#4a8fe7', '#ffd36e'], speed: 2.4, life: 0.7 })
      sfx.pop(p[0], p[1] + 0.4, p[2])
    }
    const runTo = (gx, gz, stopAt) => {
      const dx = gx - o.position.x
      const dz = gz - o.position.z
      const d = Math.hypot(dx, dz)
      if (d > stopAt + 0.02) {
        const k = Math.min(2.6 * dt, d - stopAt) / d
        o.position.x += dx * k
        o.position.z += dz * k
        let a = Math.atan2(dx, dz) - o.rotation.y
        a = Math.atan2(Math.sin(a), Math.cos(a))
        o.rotation.y += a * Math.min(1, dt * 8)
        play('Walk', { timeScale: (2.6 / STRIDE) * 0.8 })
        return false
      }
      return true
    }
    if (ep.phase === 'out') {
      if (t - ep.t > 0.35) {
        // land 3.5 m from the disc, on the lawn side away from the glass
        const p = FRISBEE.pos
        const l = Math.hypot(p.x, p.z) || 1
        o.position.set(p.x - (p.x / l) * 3.5, -5, p.z - (p.z / l) * 3.5)
        o.visible = true
        pop([o.position.x, -5, o.position.z])
        ep.phase = 'toDisc'
      }
    } else if (ep.phase === 'toDisc') {
      if (runTo(FRISBEE.pos.x, FRISBEE.pos.z, 0.55)) {
        ep.phase = 'sniff'
        ep.t = t
      }
    } else if (ep.phase === 'sniff') {
      play('Idle')
      if (t - ep.t > 1.7) {
        // pick it up by the rim
        if (jaw) {
          jaw.add(FRISBEE.mesh)
          FRISBEE.mesh.position.set(0, 0.17, -0.01)
          FRISBEE.mesh.rotation.set(Math.PI / 2, 0, 0)
        }
        FRISBEE.mode = 'dan'
        const P = FRISBEE.players
        ep.target = P.reduce((b, q) => (Math.hypot(q.pos[0] - o.position.x, q.pos[1] - o.position.z) < Math.hypot(P[b].pos[0] - o.position.x, P[b].pos[1] - o.position.z) ? q.i : b), 0)
        ep.phase = 'carry'
      }
    } else if (ep.phase === 'carry') {
      const q = FRISBEE.players[ep.target]
      q.yaw = Math.atan2(o.position.x - q.pos[0], o.position.z - q.pos[1])
      if (runTo(q.pos[0], q.pos[1], 1.0)) {
        FRISBEE.give(ep.target)
        ep.phase = 'linger'
        ep.t = t
      }
    } else if (ep.phase === 'linger') {
      play('Idle')
      if (t - ep.t > 1.4) {
        pop(here)
        o.visible = false
        ep.phase = 'back'
        ep.t = t
      }
    } else if (ep.phase === 'back' && t - ep.t > 0.35) {
      o.position.set(...ep.saved.p)
      o.rotation.y = ep.saved.r
      o.visible = true
      pop(ep.saved.p)
      ep.phase = null
    }
    DAN.x = o.position.x
    DAN.z = o.position.z
  }
  if (import.meta.env.DEV && typeof window !== 'undefined') (window.__life ||= {}).dan = () => [root.current.position.x, root.current.position.y, root.current.position.z, root.current.rotation.y, ep.phase, FRISBEE.claimed, FRISBEE.request]

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = state
    const t = clock.elapsedTime
    if (ep.phase) {
      episode(t, dt)
      // sniffing: nose down to the grass on top of the Idle clip
      if (ep.phase === 'sniff' && headBone) headBone.rotateX(-0.45 - 0.08 * Math.sin(t * 14))
      return
    }
    // start an episode when the disc is waiting on the grass and Dan is out on the cloister loop
    if (LIFE_ON && FRISBEE.request && !FRISBEE.claimed && st.pause <= 0) {
      const p = root.current.position
      const r = RING[nearestRing([p.x, p.z])]
      if (Math.hypot(r[0] - p.x, r[1] - p.z) < 0.3) {
        FRISBEE.claimed = true
        ep.saved = { p: [p.x, p.y, p.z], r: root.current.rotation.y }
        ep.phase = 'out'
        ep.t = t
        fx.sparks([p.x, 0.45, p.z], { count: 160, colors: ['#ffffff', '#4a8fe7', '#ffd36e'], speed: 2.4, life: 0.7 })
        sfx.pop(p.x, 0.4, p.z)
        root.current.visible = false
        return
      }
    }
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
