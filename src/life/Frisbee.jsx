import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COURTYARD, inPoly } from '../layout.js'
import { useInteractable } from '../interact/index.jsx'
import { angleTo, rand, sfx, timed, turnToward, useLabubuRig } from './common.js'

// Courtyard frisbee: three Labubus on the south lawn throw a disc. The disc flies a parabola with a sideways
// curve and spin; the catcher runs to where it will come down, reaches up (Catch) as it arrives, then turns
// and throws (Throw, released on frame 12). About one throw in five goes wide and lands on the grass. Handsome
// Dan then apparates onto the lawn, sniffs the disc, carries it in his mouth to the nearest player (who waves),
// and pops back to his classroom tour (HandsomeDan.jsx reads FRISBEE). From the cloister you can press E on a
// grounded disc to throw it in the direction you look, and the Labubus chase it.
const Y = -5 // lawn level
const SCALE = 1.3 // same size as the other courtyard Labubus
const HAND = 0.78 * SCALE // disc height in a raised paw above the lawn
const SPOTS = [[-8, 15.2], [3.5, 16.4], [-2.5, 12.2]]
const LOOKS = [
  { fur: '#f2a65a', expression: 'grin', shirt: 'yale' },
  { fur: '#8cc3ff', expression: 'happy', shirt: '#ffffff' },
  { fur: '#efe3cf', expression: 'mischief', shirt: 'stripes', pants: '#a6192e', overalls: true },
]
const RUN = 3.0 // m/s

// shared with HandsomeDan.jsx: the disc's state and a request for Dan when it lies on the grass
export const FRISBEE = {
  mode: 'held', // held | flying | ground | dan
  holder: 0,
  pos: new THREE.Vector3(),
  request: false, // a disc on the grass is waiting for Dan
  claimed: false, // Dan is on his way
  mesh: null,
  home: null, // the group the disc mesh lives in when Dan is not carrying it
  give: null, // Dan calls give(i) when he drops it in front of player i
  players: [],
}

// keep landing points on the lawn, inside the courtyard glass with about a 3.5 m margin
function onLawn(x, z) {
  for (let k = 0; k < 20 && !inPoly(x * 1.2, z * 1.2, COURTYARD); k++) {
    x *= 0.92
    z *= 0.92
  }
  return [x, z]
}

const DISC_MAT = new THREE.MeshStandardMaterial({ color: '#ff4fa3', roughness: 0.35, metalness: 0.05 })
const RIM_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })
function discMesh() {
  const g = new THREE.Group()
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.018, 28), DISC_MAT)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 8, 28), RIM_MAT)
  rim.rotation.x = Math.PI / 2
  rim.position.y = -0.006
  g.add(top, rim)
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}

const _v = new THREE.Vector3()
function Player({ i, ctl }) {
  const look = LOOKS[i]
  const rig = useLabubuRig(look)
  const root = useRef()
  ctl.rig = rig
  useFrame(
    timed((state, dt) => {
      const o = root.current
      o.position.set(ctl.pos[0], Y, ctl.pos[1])
      turnToward(o, ctl.yaw, Math.min(dt, 0.05) * 9)
      rig.play(ctl.clip, { timeScale: ctl.ts ?? 1, once: ctl.once, fade: 0.2 })
      rig.tick(dt, state, 45, 48)
      // the paw position, for the disc while this player holds it
      const b = rig.bones.armR
      if (b) b.localToWorld(_v.set(0, 0.25, 0.04)), ctl.paw.copy(_v)
    }),
  )
  return (
    <group ref={root} scale={SCALE}>
      <primitive object={rig.object} />
    </group>
  )
}

export default function Frisbee() {
  const home = useRef()
  const disc = useMemo(discMesh, [])
  const st = useMemo(() => {
    const r = rand(1701 + 404)
    const players = SPOTS.map((p, i) => ({ i, home: p, pos: [...p], yaw: 0, clip: 'Idle', ts: 1, once: false, paw: new THREE.Vector3(p[0], Y + HAND, p[1]), task: 'idle', at: 0 }))
    FRISBEE.players = players
    FRISBEE.mesh = disc
    return { r, players, throws: 0, flight: null, holdUntil: 2, phase: 'hold', target: 1, groundSince: 0 }
  }, [disc])

  // the disc lies on the grass: give it to player i (Dan drops it, or a player picks it up)
  FRISBEE.give = (i) => {
    home.current.add(disc)
    disc.rotation.set(0, 0, 0)
    FRISBEE.mode = 'held'
    FRISBEE.holder = i
    FRISBEE.request = false
    FRISBEE.claimed = false
    st.phase = 'hold'
    st.holdUntil = performance.now() / 1000 + 0 // set in the frame loop
    st.giveAt = true
    for (const p of st.players) if (p.task === 'fetch' || p.task === 'chase') p.task = 'home'
  }

  const launch = (from, to, t, opts = {}) => {
    const d = Math.hypot(to[0] - from[0], to[2] - from[2])
    st.flight = {
      from,
      to,
      t0: t,
      T: d / 7.5 + 0.55,
      arc: 0.7 + d * 0.07,
      curve: (st.r() - 0.5) * 0.25 * d,
      ...opts,
    }
    FRISBEE.mode = 'flying'
    sfx.whoosh(from[0], from[1], from[2])
  }

  useInteractable({
    position: () => FRISBEE.pos,
    radius: 7.5, // you are up on the cloister behind the glass: reach is generous
    label: 'the frisbee',
    verb: 'Throw',
    marker: 'interact',
    get enabled() {
      return FRISBEE.mode === 'ground' && !FRISBEE.claimed
    },
    onInteract: () => {
      const cam = st.camera
      if (!cam) return
      const f = cam.getWorldDirection(new THREE.Vector3())
      const l = Math.hypot(f.x, f.z) || 1
      const p = FRISBEE.pos
      const [x, z] = onLawn(p.x + (f.x / l) * 11, p.z + (f.z / l) * 11)
      st.thrower = -1
      launch([p.x, Y + 0.4, p.z], [x, Y + 0.02, z], st.t, { wild: true, byYou: true })
      FRISBEE.request = false
      for (const q of st.players) q.task = 'watch'
    },
  })

  useFrame(
    timed((state, rawDt) => {
      const dt = Math.min(rawDt, 0.05)
      const t = state.clock.elapsedTime
      st.t = t
      st.camera = state.camera
      const { players: P, r } = st
      if (st.giveAt) {
        st.giveAt = false
        st.holdUntil = t + 2.2
        const h = P[FRISBEE.holder]
        h.task = 'wave'
        h.at = t + 2
      }
      // ----- players
      for (const p of P) {
        p.once = false
        p.ts = 1
        if (p.task === 'run' || p.task === 'fetch' || p.task === 'chase' || p.task === 'home') {
          const goal = p.task === 'home' ? p.home : p.goal
          const dx = goal[0] - p.pos[0]
          const dz = goal[1] - p.pos[1]
          const d = Math.hypot(dx, dz)
          const step = RUN * dt
          if (d > 0.05) {
            p.pos[0] += (dx / d) * Math.min(step, d)
            p.pos[1] += (dz / d) * Math.min(step, d)
            p.yaw = Math.atan2(dx, dz)
            p.clip = 'Walk'
            p.ts = 2.8
          } else {
            p.clip = 'Idle'
            if (p.task === 'home') p.task = 'idle'
          }
          if (p.task === 'run' && p.catchAt && t > p.catchAt) {
            p.clip = 'Catch'
            p.ts = 2
            p.once = true
          }
        } else if (p.task === 'catch') {
          p.clip = 'Catch'
          p.ts = 2
          p.once = true
        } else if (p.task === 'throw') {
          p.clip = 'Throw'
          p.once = true
        } else if (p.task === 'wave') {
          p.clip = 'Wave'
          if (t > p.at) p.task = 'idle'
        } else if (p.task === 'watch') {
          p.clip = 'Look'
          p.yaw = angleTo(p.pos, [FRISBEE.pos.x, FRISBEE.pos.z])
        } else {
          p.clip = 'Idle'
          // drift back home between plays
          const d = Math.hypot(p.home[0] - p.pos[0], p.home[1] - p.pos[1])
          if (d > 0.6 && FRISBEE.mode !== 'flying') p.task = 'home'
        }
      }

      // ----- disc
      const F = st.flight
      if (FRISBEE.mode === 'held') {
        const h = P[FRISBEE.holder]
        FRISBEE.pos.copy(h.paw)
        if (st.target === h.i) st.target = (h.i + 1 + Math.floor(r() * 2)) % P.length // after Dan or a chase
        const tgt = P[st.target]
        if (st.phase === 'hold') {
          if (h.task === 'idle') h.yaw = angleTo(h.pos, tgt.pos)
          if (t > st.holdUntil && h.task !== 'wave') {
            st.phase = 'windup'
            st.release = t + 0.37 // Throw lets go on frame 12 of 20 (30 fps)
            h.task = 'throw'
            h.yaw = angleTo(h.pos, tgt.pos)
          }
        } else if (st.phase === 'windup' && t > st.release) {
          st.throws += 1
          const wild = st.throws % 5 === 0 || r() < 0.06
          const from = [h.paw.x, h.paw.y, h.paw.z]
          let to
          if (wild) {
            // over the catcher's head and off to one side
            const ax = tgt.pos[0] - h.pos[0]
            const az = tgt.pos[1] - h.pos[1]
            const l = Math.hypot(ax, az) || 1
            const side = r() < 0.5 ? -1 : 1
            const [x, z] = onLawn(tgt.pos[0] + (ax / l) * (4 + r() * 3) + (-az / l) * side * 3, tgt.pos[1] + (az / l) * (4 + r() * 3) + (ax / l) * side * 3)
            to = [x, Y + 0.02, z]
          } else {
            const [x, z] = onLawn(tgt.home[0] + (r() - 0.5) * 2.4, tgt.home[1] + (r() - 0.5) * 2.4)
            to = [x, Y + HAND, z]
          }
          st.thrower = FRISBEE.holder
          launch(from, to, t, { wild, catcher: wild ? -1 : st.target })
          h.task = 'idle'
          if (!wild) {
            tgt.task = 'run'
            tgt.goal = [to[0], to[2]]
            tgt.catchAt = t + st.flight.T - 0.42 // Catch at timeScale 2 peaks 0.4 s in
          } else for (const q of P) if (q.i !== h.i) q.task = 'watch'
          st.phase = 'fly'
        }
      } else if (FRISBEE.mode === 'flying' && F) {
        const u = Math.min(1, (t - F.t0) / F.T)
        const dx = F.to[0] - F.from[0]
        const dz = F.to[2] - F.from[2]
        const l = Math.hypot(dx, dz) || 1
        const c = Math.sin(Math.PI * u) * F.curve
        FRISBEE.pos.set(
          F.from[0] + dx * u + (-dz / l) * c,
          F.from[1] + (F.to[1] - F.from[1]) * u + F.arc * 4 * u * (1 - u),
          F.from[2] + dz * u + (dx / l) * c,
        )
        disc.rotation.y += dt * 22
        disc.rotation.z = 0.12 * Math.sin(t * 3) + (F.curve > 0 ? 0.15 : -0.15)
        if (u >= 1) {
          if (F.catcher >= 0) {
            const k = P[F.catcher]
            FRISBEE.mode = 'held'
            FRISBEE.holder = F.catcher
            k.task = 'idle'
            k.catchAt = 0
            disc.rotation.set(0, 0, 0)
            // next target: the third player most of the time
            const others = P.filter((q) => q.i !== F.catcher)
            st.target = (others.find((q) => q.i !== st.thrower) || others[0]).i
            if (r() < 0.25) st.target = others[Math.floor(r() * others.length)].i
            st.phase = 'hold'
            st.holdUntil = t + 0.9 + r() * 0.8
          } else {
            // on the grass: a short skid, then wait for Dan (or a player, or you)
            FRISBEE.mode = 'ground'
            FRISBEE.pos.set(F.to[0] + (dx / l) * 0.6, Y + 0.02, F.to[2] + (dz / l) * 0.6)
            disc.rotation.set(0, disc.rotation.y, 0.04)
            st.groundSince = t
            FRISBEE.request = !F.byYou
            if (F.byYou)
              // you threw it: everybody chases
              for (const q of P) {
                q.task = 'chase'
                q.goal = [FRISBEE.pos.x, FRISBEE.pos.z]
              }
          }
          st.flight = null
        }
      } else if (FRISBEE.mode === 'ground') {
        // chasers: the first one to reach the disc picks it up
        for (const q of P) {
          if ((q.task === 'chase' || q.task === 'fetch') && Math.hypot(q.pos[0] - FRISBEE.pos.x, q.pos[1] - FRISBEE.pos.z) < 0.45) {
            FRISBEE.give(q.i)
            break
          }
        }
        // no Dan after 14 s (he is busy in a classroom): the nearest player fetches it
        if (FRISBEE.mode === 'ground' && !FRISBEE.claimed && t - st.groundSince > 14 && !P.some((q) => q.task === 'fetch' || q.task === 'chase')) {
          const q = [...P].sort((a, b) => Math.hypot(a.pos[0] - FRISBEE.pos.x, a.pos[1] - FRISBEE.pos.z) - Math.hypot(b.pos[0] - FRISBEE.pos.x, b.pos[1] - FRISBEE.pos.z))[0]
          q.task = 'fetch'
          q.goal = [FRISBEE.pos.x, FRISBEE.pos.z]
          FRISBEE.request = false
        }
      }
      if (FRISBEE.mode !== 'dan') disc.position.copy(FRISBEE.pos)
      if (import.meta.env.DEV) (window.__life ||= {}).disc = [FRISBEE.pos.x, FRISBEE.pos.y, FRISBEE.pos.z, FRISBEE.mode]
    }),
  )
  return (
    <group ref={(g) => (home.current = FRISBEE.home = g)}>
      <primitive object={disc} />
      {st.players.map((p) => (
        <Player key={p.i} i={p.i} ctl={p} />
      ))}
    </group>
  )
}
