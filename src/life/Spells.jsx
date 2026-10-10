import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Professor from '../Professor.jsx'
import { angleTo, rand, sfx, smooth, timed, turnToward, useLabubuRig } from './common.js'
import { fx } from './fx.jsx'

// Spell practice on the north lawn: Professor Flitwick and three Labubus with wands in a half circle. Each
// Labubu casts on its own seeded rhythm (the Cast clip flicks on frame 10): a burst of 200 Yale-blue and pink
// sparks leaves the wand tip and its target answers. A stone paver and a book float up 1 m, wobble and settle
// (Wingardium Leviosa); a paper plane launches, loops and glides back. Every fourth cast fizzles: a puff of
// grey smoke, and the caster looks surprised for 2 s.
const Y = -5
const SCALE = 1.3
// Flitwick stands near the north glass facing south, so from the north cloister you see the class's faces
const FLIT = [-5.5, -16.8]
const CLASS = [-0.8, 0, 0.8].map((a, i) => ({
  i,
  p: [FLIT[0] + 2.7 * Math.sin(a), FLIT[1] + 2.7 * Math.cos(a)],
  target: ['paver', 'book', 'plane'][i],
}))
const LOOKS = [
  { fur: '#bba7e8', expression: 'grin', shirt: 'yale' },
  { fur: '#3a3a3e', expression: 'mischief', shirt: '#ff4fa3' },
  { fur: '#9fe0c6', expression: 'happy', shirt: '#5b3f8c', pants: '#5b3f8c', overalls: true },
]
const FLICK = 10 / 30 // seconds into Cast when the wand snaps forward

const WAND_MAT = new THREE.MeshStandardMaterial({ color: '#3b2516', roughness: 0.6 })
const TIP_MAT = new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false })
function wand() {
  // in the right arm bone's frame: Y runs down the arm to the paw (about 0.24 from the shoulder)
  const g = new THREE.Group()
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.34, 8), WAND_MAT)
  stick.position.y = 0.36
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), TIP_MAT)
  tip.position.y = 0.53
  g.add(stick, tip)
  g.position.z = 0.03
  stick.castShadow = true
  return g
}

const STONE = new THREE.MeshStandardMaterial({ color: '#b7b2a8', roughness: 0.92 })
const COVER = new THREE.MeshStandardMaterial({ color: '#7a1f2b', roughness: 0.7 })
const PAGES = new THREE.MeshStandardMaterial({ color: '#f1ead8', roughness: 0.9 })
const PAPER = new THREE.MeshStandardMaterial({ color: '#fbfbf8', roughness: 0.8, side: THREE.DoubleSide })
function targetMesh(kind) {
  const g = new THREE.Group()
  if (kind === 'paver') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), STONE)
    m.position.y = 0.025
    g.add(m)
  } else if (kind === 'book') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.32), COVER)
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.045, 0.31), PAGES)
    c.position.y = 0.03
    p.position.set(0.012, 0.03, 0)
    g.add(c, p)
  } else {
    // a paper plane: two wings folded along the nose line, nose toward +z
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.11, 0.025, -0.14, 0, -0.02, -0.12, 0, 0, 0.18, 0, -0.02, -0.12, 0.11, 0.025, -0.14], 3))
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, PAPER)
    m.position.y = 0.04
    g.add(m)
  }
  g.traverse((m) => m.isMesh && (m.castShadow = true))
  return g
}

const _tip = new THREE.Vector3()
function Student({ s }) {
  const rig = useLabubuRig(LOOKS[s.i])
  const root = useRef()
  const target = useMemo(() => targetMesh(s.target), [s.target])
  const st = useMemo(() => {
    const r = rand(77 + s.i * 13)
    const yaw = angleTo(s.p, FLIT)
    const f = [Math.sin(yaw), Math.cos(yaw)]
    // targets sit 1.15 m in front, a little to the side so the sparks do not hit the professor
    const side = [f[1], -f[0]]
    const tp = [s.p[0] + f[0] * 1.15 + side[0] * 0.25, s.p[1] + f[1] * 1.15 + side[1] * 0.25]
    return { r, yaw, f, tp, next: 2 + s.i * 1.6 + r() * 2, casts: s.i, castAt: -1, effect: null, surprisedUntil: 0 }
  }, [s])
  useMemo(() => {
    const b = rig.bones.armR
    if (b) b.add(wand())
  }, [rig])

  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      const o = root.current
      turnToward(o, st.yaw, 1)
      // start a cast
      if (t > st.next && st.castAt < 0) {
        st.castAt = t
        rig.play('Cast', { once: true, fade: 0.15 })
      }
      if (st.castAt >= 0 && t - st.castAt > FLICK) {
        st.casts += 1
        const fail = st.casts % 4 === 0
        const b = rig.bones.armR
        if (b) b.localToWorld(_tip.set(0, 0.53, 0.03))
        else _tip.set(s.p[0], Y + 1, s.p[1])
        const p = [_tip.x, _tip.y, _tip.z]
        if (fail) {
          fx.smoke(p, { count: 50 })
          fx.sparks(p, { count: 25, colors: ['#9a9590'], speed: 0.8, life: 0.5 })
          st.surprisedUntil = t + 2
          st.effect = { kind: 'twitch', t0: t }
        } else {
          const d = [st.tp[0] - p[0], Y + 0.3 - p[1], st.tp[1] - p[2]]
          const l = Math.hypot(...d)
          fx.sparks(p, { dir: [d[0] / l * 1.4, d[1] / l * 1.4 + 0.3, d[2] / l * 1.4], spread: 0.8, speed: 2.4 })
          st.effect = { kind: s.target, t0: t + 0.25 }
          // a few sparks where the spell lands
          setTimeout(() => fx.sparks([st.tp[0], Y + 0.15, st.tp[1]], { count: 60, speed: 1.2, up: 1.2, life: 0.7, size: 0.06 }), 250)
        }
        sfx.cast(p[0], p[1], p[2], fail)
        st.castAt = -1
        st.next = t + 4.2 + st.r() * 2.4
      }
      if (st.castAt < 0 && rig.clip === 'Cast' && rig.actions.Cast.time >= rig.actions.Cast.getClip().duration - 0.01) rig.play('Idle', { fade: 0.4 })
      rig.setFace(t < st.surprisedUntil ? 'surprised' : LOOKS[s.i].expression)

      // the target
      const e = st.effect
      const g = target
      g.position.set(st.tp[0], Y, st.tp[1])
      g.rotation.set(0, st.yaw + 0.4 * s.i, 0)
      if (e) {
        const u = t - e.t0
        if (e.kind === 'twitch') {
          g.position.y += Math.max(0, 0.06 * Math.sin(u * 30) * (1 - u / 0.5))
          if (u > 0.5) st.effect = null
        } else if (e.kind === 'paver' || e.kind === 'book') {
          // up over 0.8 s, float and wobble 1.8 s, settle over 0.9 s with a small bounce
          let h = 0
          if (u < 0) h = 0
          else if (u < 0.8) h = smooth(u / 0.8)
          else if (u < 2.6) h = 1 + 0.06 * Math.sin((u - 0.8) * 5)
          else if (u < 3.5) h = (1 - smooth((u - 2.6) / 0.9)) * 1.0
          else if (u < 3.75) h = 0.05 * Math.sin(((u - 3.5) / 0.25) * Math.PI)
          else st.effect = null
          const wob = u > 0 && u < 3.5 ? Math.min(1, u / 0.8) * Math.min(1, (3.5 - u) / 0.6) : 0
          g.position.y += h * 1.0
          g.rotation.x = 0.18 * wob * Math.sin(u * 3.1)
          g.rotation.z = 0.15 * wob * Math.sin(u * 2.3 + 1)
          g.rotation.y += 0.6 * wob * Math.sin(u * 0.9)
        } else if (e.kind === 'plane') {
          // climb forward, a vertical loop, then glide home: 3.2 s along the caster's facing
          const T = 3.2
          const k = u / T
          if (k < 0) {
            // waiting for the spell to land
          } else if (k < 1) {
            const fwd = st.f
            let a
            let h
            if (k < 0.25) {
              const q = smooth(k / 0.25)
              a = 0.9 * q
              h = 0.9 * q
            } else if (k < 0.7) {
              const th = ((k - 0.25) / 0.45) * Math.PI * 2
              a = 0.9 + 0.7 * Math.sin(th)
              h = 1.6 - 0.7 * Math.cos(th)
            } else {
              const q = smooth((k - 0.7) / 0.3)
              a = 0.9 * (1 - q)
              h = 0.9 * (1 - q)
            }
            g.position.x += fwd[0] * a
            g.position.z += fwd[1] * a
            g.position.y += h
            // point the nose along the flight
            // nose along the flight: up on the climb, round the loop, then turned for home and gliding down
            if (k < 0.7) g.rotation.set(k < 0.25 ? -0.7 : -((k - 0.25) / 0.45) * Math.PI * 2, st.yaw, 0, 'YXZ')
            else g.rotation.set(0.35, st.yaw + Math.PI, 0, 'YXZ')
          } else st.effect = null
        }
      }
      rig.tick(dt, state, 45, 48)
    }),
  )
  return (
    <>
      <group ref={root} position={[s.p[0], Y, s.p[1]]} scale={SCALE}>
        <primitive object={rig.object} />
      </group>
      <primitive object={target} />
    </>
  )
}

export default function Spells() {
  if (import.meta.env.DEV && typeof window !== 'undefined') (window.__life ||= {}).spells = CLASS.map((s) => [s.p[0], Y, s.p[1]])
  return (
    <group>
      <Professor who="flitwick" position={[FLIT[0], Y, FLIT[1]]} rotation={0} />
      {CLASS.map((s) => (
        <Student key={s.i} s={s} />
      ))}
    </group>
  )
}
