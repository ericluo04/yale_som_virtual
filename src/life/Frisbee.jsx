import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COURTYARD, inPoly } from '../layout.js'
import { useInteractable } from '../interact/index.jsx'
import { angleTo, rand, sfx, timed, turnToward, useLabubuRig } from './common.js'
import { fx } from './fx.jsx'
const TRAIL = ['#ff6fb5', '#ffffff', '#ffc2e2']

// Courtyard frisbee: three Labubus on the south lawn throw a disc. The disc flies a parabola with a sideways
// curve and spin; the catcher runs to where it will come down, reaches up (Catch) as it arrives, then turns
// and throws (Throw, released on frame 12). About one throw in five goes wide and lands on the grass. Handsome
// Dan then apparates onto the lawn, sniffs the disc, carries it in his mouth to the nearest player (who waves),
// and pops back to his classroom tour (HandsomeDan.jsx reads FRISBEE). Dan waits 6 s first: in that window you
// can press E from the south cloister ("[E] Throw the disc", within 10 m) to throw it in the direction you look,
// and the Labubus chase it.
// The game sits on the south lawn between z 10 and 14.5. Spots closer to the south glass (z 17 to 19) are below
// the cloister floor edge from eye height on the south cloister (the edge hides the lawn closer than about
// 5 m from the glass), so these are the nearest spots that read from there. A throw goes every 4 s, and the
// thrower and the free player run to new spots between throws. The disc is 0.45 m across with a bright pink rim
// and a sparkle trail from the fx pool.
const Y = -5 // lawn level
const SCALE = 1.3 // same size as the other courtyard Labubus
const HAND = 0.78 * SCALE // disc height in a raised paw above the lawn
// six spots in a loose ring on the south lawn, clear of the aspens at (-5,9.5) and (6,10); players start on
// the first three and move to a free one between throws
const SPOTS = [[-3.6, 12.8], [3.6, 12.6], [0.3, 10.4], [-2.4, 10.6], [2.6, 10.4], [0.8, 13.0]]
const THROW_EVERY = 4 // s between releases
const GROUND_WAIT = 6 // s a disc on the grass waits for you before Dan is asked to fetch it
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

const DISC_MAT = new THREE.MeshStandardMaterial({ color: '#fff2f8', roughness: 0.35, metalness: 0.05 })
const RIM_MAT = new THREE.MeshStandardMaterial({ color: '#ff2e9a', emissive: '#ff2e9a', emissiveIntensity: 1.6, roughness: 0.4 })
const R_DISC = 0.225 // 0.45 m across
function discMesh() {
  const g = new THREE.Group()
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R_DISC, R_DISC, 0.022, 32), DISC_MAT)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R_DISC, 0.028, 8, 32), RIM_MAT)
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
    const players = SPOTS.slice(0, 3).map((p, i) => ({ i, home: p, pos: [...p], yaw: 0, clip: 'Idle', ts: 1, once: false, paw: new THREE.Vector3(p[0], Y + HAND, p[1]), task: 'idle', at: 0 }))
    FRISBEE.players = players
    FRISBEE.mesh = disc
    return { r, players, throws: 0, flight: null, holdUntil: 2, phase: 'hold', target: 1, groundSince: 0, lastRelease: -10, trailAt: 0 }
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
    radius: 10, // you are up on the south cloister behind the glass: reach is generous
    label: 'the disc',
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
            let [x, z] = onLawn(tgt.pos[0] + (ax / l) * (4 + r() * 3) + (-az / l) * side * 3, tgt.pos[1] + (az / l) * (4 + r() * 3) + (ax / l) * side * 3)
            // it lands where the south cloister can see it and reach it with E (10 m)
            x = Math.max(-6, Math.min(6, x))
            z = Math.max(11.5, Math.min(15.5, z))
            to = [x, Y + 0.02, z]
          } else {
            const [x, z] = onLawn(tgt.home[0] + (r() - 0.5) * 1.6, tgt.home[1] + (r() - 0.5) * 1.6)
            to = [x, Y + HAND, z]
          }
          st.thrower = FRISBEE.holder
          st.lastRelease = t
          launch(from, to, t, { wild, catcher: wild ? -1 : st.target })
          // the thrower and the free player run to new spots instead of standing
          for (const q of P) {
            if (q.i === st.target) continue
            const used = P.filter((o) => o !== q).map((o) => o.home)
            const free = SPOTS.filter((sp) => !used.includes(sp) && Math.hypot(sp[0] - q.pos[0], sp[1] - q.pos[1]) > 2)
            if (free.length) q.home = free[Math.floor(r() * free.length)]
            if (q.task === 'idle') q.task = 'home'
          }
          h.task = 'home'
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
        // sparkle trail: a few pink and white sparks every 1/30 s
        if (t > st.trailAt) {
          st.trailAt = t + 1 / 30
          fx.sparks([FRISBEE.pos.x, FRISBEE.pos.y, FRISBEE.pos.z], { count: 5, colors: TRAIL, speed: 0.35, up: 0.15, life: 0.55, size: 0.08 })
        }
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
            // one release every 4 s (the wind-up takes 0.37 s)
            st.holdUntil = Math.max(t + 0.5, st.lastRelease + THROW_EVERY - 0.37)
          } else {
            // on the grass: a short skid, then wait for Dan (or a player, or you)
            FRISBEE.mode = 'ground'
            FRISBEE.pos.set(F.to[0] + (dx / l) * 0.6, Y + 0.02, F.to[2] + (dz / l) * 0.6)
            disc.rotation.set(0, disc.rotation.y, 0.04)
            st.groundSince = t
            st.youThrew = !!F.byYou
            FRISBEE.request = false // asked after GROUND_WAIT s, so you get a turn first
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
        if (!FRISBEE.claimed && !F && t - st.groundSince > GROUND_WAIT && !st.youThrew && !P.some((q) => q.task === 'fetch' || q.task === 'chase')) FRISBEE.request = true
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
