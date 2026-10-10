import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BENCHES } from '../layout.js'
import { rand, smooth, timed, turnToward, useLabubuRig } from './common.js'
import { clampSprite, sprite } from './sprites.js'

// Small scenes around the floor, cheap and mostly static:
//   a Labubu asleep in a library lounge chair (Sleep, now and then a Yawn) with z's floating up
//   one reading on the north-cloister banquette, turning a page every 3 s (SitRead)
//   three queueing at the southeast stair down to the cafe, heads down in their phones (Phone)
//   two chatting by the north courtyard glass, with speech bubbles
//   one photographing the courtyard from the south glass, phone raised, the flash firing every few seconds
//   two racing each other down the west cloister in hops, once every 40 s, then cheering at the far end

// a seated or standing Labubu at a fixed spot
function Still({ look, position, yaw, scale = 1, children, update }) {
  const rig = useLabubuRig(look)
  const root = useRef()
  useMemo(() => children?.(rig), [rig, children])
  useFrame(
    timed((state, dt) => {
      update(rig, state.clock.elapsedTime, root.current)
      rig.tick(dt, state, 30)
    }),
  )
  return (
    <group ref={root} position={position} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={rig.object} />
    </group>
  )
}

// ---------- the sleeper: library lounge chair (render/Scenery.jsx loungeChairs: the north-west chair of the
// south lounge group, facing the low table)
const SLEEP_AT = [-28.62, 0.42 - 0.11, 7.52]
function Sleeper() {
  const zs = useMemo(() => [0, 1, 2].map(() => sprite('z', 0.16, { font: 'bold 56px Georgia, serif', bubble: false })), [])
  const st = useMemo(() => ({ nextYawn: 9, yawnUntil: 0 }), [])
  const update = (rig, t) => {
    if (t > st.nextYawn) {
      st.yawnUntil = t + 2.1
      st.nextYawn = t + 11 + Math.random() * 6
    }
    rig.play(t < st.yawnUntil ? 'Yawn' : 'Sleep', { fade: 0.5 })
    rig.setFace('sleepy')
    // three z's rise from the head, drift sideways, grow and fade, one every 0.8 s
    zs.forEach((z, i) => {
      const u = ((t + i * 0.8) % 2.4) / 2.4
      z.position.set(0.18 + 0.25 * u + 0.05 * Math.sin(u * 9), 1.1 + 0.55 * u, -0.05)
      const k = 0.16 + 0.2 * u
      z.scale.set(k * 0.6, k, 1)
      z.material.opacity = t < st.yawnUntil ? 0 : Math.min(1, u * 4) * (1 - u)
    })
  }
  return (
    <group>
      <Still look={{ fur: '#c98f6b', expression: 'sleepy', shirt: '#7a9e7e' }} position={SLEEP_AT} yaw={Math.PI} update={update} />
      <group position={SLEEP_AT} rotation={[0, Math.PI, 0]}>
        {zs.map((z, i) => (
          <primitive key={i} object={z} />
        ))}
      </group>
    </group>
  )
}

// ---------- the reader: north cloister banquette (layout BENCHES[3], seat cushion top at 0.48 m)
const B = BENCHES[3]
const READ_AT = (() => {
  const c = Math.cos(B.rot)
  const s = Math.sin(B.rot)
  // the cushion's middle is 0.12 m in front of the bench line; sit 0.8 m along the bench from its center
  const lx = -0.12
  const lz = 0.8
  return [B.c[0] + lx * c + lz * s, 0.48 - 0.11, B.c[1] - lx * s + lz * c]
})()
const READ_YAW = Math.atan2(-Math.cos(B.rot), Math.sin(B.rot))
const BOOK_COVER = new THREE.MeshStandardMaterial({ color: '#00356b', roughness: 0.7, side: THREE.DoubleSide })
const BOOK_PAGE = new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.9, side: THREE.DoubleSide })
function openBook() {
  // in the spine bone's frame (Y up, Z forward): an open book held in front of the chest, tilted toward the eyes
  const g = new THREE.Group()
  g.position.set(0, 0.22, 0.27)
  g.rotation.x = -0.9
  const half = (side) => {
    const h = new THREE.Group()
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.21), BOOK_COVER)
    cover.position.x = 0.075 * side
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.012), BOOK_PAGE)
    pages.position.set(0.072 * side, 0, 0.007)
    h.add(cover, pages)
    h.rotation.y = -0.25 * side
    return h
  }
  g.add(half(1), half(-1))
  // the turning page, hinged on the spine
  const leaf = new THREE.Group()
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.195), BOOK_PAGE)
  sheet.position.x = 0.068
  sheet.position.z = 0.015
  leaf.add(sheet)
  g.add(leaf)
  g.userData.leaf = leaf
  return g
}
function Reader() {
  const book = useMemo(openBook, [])
  return (
    <Still
      look={{ fur: '#bba7e8', expression: 'happy', shirt: 'yale' }}
      position={READ_AT}
      yaw={READ_YAW}
      update={(rig, t) => {
        rig.play('SitRead')
        // the page lifts from the right and settles on the left while the paw sweeps (frames 62 to 78 of 90)
        const a = rig.actions.SitRead
        const f = a ? (a.time * 30) % 90 : 0
        const u = Math.min(1, Math.max(0, (f - 62) / 16))
        book.userData.leaf.rotation.y = -0.25 - u * (Math.PI - 0.5)
      }}
    >
      {(rig) => rig.bones.spine?.add(book)}
    </Still>
  )
}

// ---------- the cafe queue: in front of the southeast stair core (stair G opens north at z 23)
const PHONE_MAT = new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.3, metalness: 0.4 })
const SCREEN_MAT = new THREE.MeshBasicMaterial({ color: '#9fd2ff', toneMapped: false })
function phone() {
  // on the right arm bone, in the paw, screen turned up toward the face
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.012), PHONE_MAT)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.115), SCREEN_MAT)
  scr.position.z = 0.0065
  g.add(body, scr)
  g.position.set(0.03, 0.27, 0.06)
  g.rotation.set(-0.4, 0, 0.3)
  return g
}
const QUEUE = [
  { at: [25.2, 0, 22.25], look: { fur: '#efe3cf', expression: 'grin', shirt: '#a6192e' } },
  { at: [25.35, 0, 21.45], look: { fur: '#3a3a3e', expression: 'happy', shirt: 'yale' } },
  { at: [25.6, 0, 20.65], look: { fur: '#8cc3ff', expression: 'mischief', shirt: 'stripes', pants: '#1f7a8c', overalls: true } },
]
function Queuer({ q, i }) {
  return (
    <Still
      look={q.look}
      position={q.at}
      yaw={0.1 * (i - 1)}
      update={(rig, t) => {
        rig.play('Phone', { timeScale: 0.8 + 0.15 * i })
        if (rig.actions.Phone && !rig.started) {
          rig.actions.Phone.time = i * 0.7
          rig.started = true
        }
        void t
      }}
    >
      {(rig) => rig.bones.armR?.add(phone())}
    </Still>
  )
}

// ---------- two chatting by the north courtyard glass
const LINES = [
  ['did you do HW4?', 'not yet. you?'],
  ['Lisa says 10% is attendance', 'I scanned the QR from the hall'],
  ['the dump trap got Kevin', 'Dumbledore appeared?!'],
  ['tokens are not free', 'my agent spent $3 on hello'],
  ['office hours with Dumbledore?', 'Tuesday, bring snacks'],
  ['my agent ordered 40 coffees', 'deploy it anyway'],
]
const CHAT = [
  { at: [11.2, 0, -20.85], look: { fur: '#ff9ccc', expression: 'grin', shirt: '#2f6b4f' } },
  { at: [12.25, 0, -21.05], look: { fur: '#6b4a3a', expression: 'surprised', shirt: 'yale' } },
]
function Chatters() {
  const bubbles = useMemo(() => LINES.map((pair) => pair.map((t) => sprite(t, 0.3))), [])
  const st = useMemo(() => ({ r: rand(4), line: 0 }), [])
  const yaw0 = Math.atan2(CHAT[1].at[0] - CHAT[0].at[0], CHAT[1].at[2] - CHAT[0].at[2])
  const speaking = (t) => {
    // 3.2 s per bubble: question, answer, a short pause, next pair
    const k = Math.floor(t / 3.2)
    const pair = Math.floor(k / 3) % LINES.length
    const who = k % 3 // 0 asks, 1 answers, 2 pause
    return { pair, who }
  }
  useFrame(({ clock, camera }) => {
    const { pair, who } = speaking(clock.elapsedTime)
    bubbles.forEach((p, i) =>
      p.forEach((b, j) => {
        b.visible = i === pair && j === who
        b.position.set(CHAT[j].at[0], 1.62, CHAT[j].at[2])
        if (b.visible) clampSprite(b, camera, 0.06)
      }),
    )
    void st
  })
  return (
    <>
      {CHAT.map((c, j) => (
        <Still
          key={j}
          look={c.look}
          position={c.at}
          yaw={j === 0 ? yaw0 : yaw0 + Math.PI}
          update={(rig, t) => {
            const { who } = speaking(t)
            rig.play(who === j ? 'Talk' : 'Idle', { fade: 0.4 })
          }}
        />
      ))}
      {bubbles.flat().map((b, i) => (
        <primitive key={i} object={b} />
      ))}
    </>
  )
}

// ---------- the photographer: south cloister, at the courtyard glass between the banquettes, facing the lawn
const PHOTO_AT = [-1.2, 0, 21.0]
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending })
function flashGlow() {
  // a soft round glow, drawn once
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.25, 'rgba(255,250,235,0.85)')
  gr.addColorStop(1, 'rgba(255,240,220,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  sp.renderOrder = 6
  return sp
}
function cameraPhone() {
  // on the right arm bone, in the paw, held upright; the flash (a small emissive disc) faces away from the Labubu
  const g = phone()
  const flash = new THREE.Mesh(new THREE.CircleGeometry(0.009, 12), FLASH_MAT)
  flash.position.set(0.022, 0.045, -0.0075)
  flash.rotation.y = Math.PI
  g.add(flash)
  return g
}
function Photographer() {
  const glow = useMemo(flashGlow, [])
  const ph = useMemo(cameraPhone, [])
  const st = useMemo(() => ({ next: 2.5, t0: -10 }), [])
  const rig = useLabubuRig({ fur: '#f2efe9', expression: 'grin', shirt: '#ff4fa3' })
  const root = useRef()
  // rest orientations of the bones the pose overrides (a keyed Blender pose is relative to the rest pose)
  const rest = useMemo(() => {
    rig.bones.armR?.add(ph)
    const out = {}
    for (const k of ['armR', 'armL', 'head']) if (rig.bones[k]) out[k] = rig.bones[k].quaternion.clone()
    return out
  }, [rig, ph])
  const _w = useMemo(() => new THREE.Vector3(), [])
  const _e = useMemo(() => new THREE.Euler(), [])
  const _q = useMemo(() => new THREE.Quaternion(), [])
  const pose = (k, x, y, z) => rig.bones[k] && rig.bones[k].quaternion.copy(rest[k]).multiply(_q.setFromEuler(_e.set(x, y, z)))
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      rig.play('Idle')
      rig.tick(dt, state, 30)
      // phone raised in both paws in front of the chin (higher and the head swallows it), a little sway while framing
      pose('armR', 1.75, 0, 0.42 + 0.03 * Math.sin(t * 0.8))
      pose('armL', 1.7, 0, -0.45)
      pose('head', -0.1, 0, 0)
      // a double flash every 3.5 to 6 s: 100 ms, a 120 ms gap, then 120 ms fading out over 260 ms
      if (t > st.next) {
        st.t0 = t
        st.next = t + 3.5 + Math.random() * 2.5
      }
      const u = t - st.t0
      const k = u < 0.1 ? 1 - (u / 0.1) * 0.3 : u > 0.22 && u < 0.34 ? 1 : u >= 0.34 && u < 0.6 ? 1 - smooth((u - 0.34) / 0.26) : 0
      FLASH_MAT.opacity = k
      glow.material.opacity = k
      if (import.meta.env.DEV) (window.__life ||= {}).flash = [t, st.next, k, glow.position.x, glow.position.y, glow.position.z]
      ph.children.at(-1).getWorldPosition(_w)
      glow.position.copy(_w)
      const sz = 0.25 + 0.5 * k
      glow.scale.set(sz, sz, 1)
    }),
  )
  return (
    <>
      <group ref={root} position={PHOTO_AT} rotation={[0, Math.PI, 0]}>
        <primitive object={rig.object} />
      </group>
      <primitive object={glow} />
    </>
  )
}

// ---------- the race: two hop down the west cloister side by side, one start every 40 s, direction alternating
const RACE = { every: 40, z0: -16.5, z1: 16.5, lanes: [-22.95, -23.8] }
const RACERS = [
  { fur: '#7fb2ff', expression: 'mischief', shirt: '#ffffff' },
  { fur: '#c98f6b', expression: 'grin', shirt: 'yale' },
]
function Racer({ i, race }) {
  const rig = useLabubuRig(RACERS[i])
  const root = useRef()
  useFrame(
    timed((state, dt) => {
      const t = state.clock.elapsedTime
      const o = root.current
      const R = race(t)
      const dir = R.dir
      const len = RACE.z1 - RACE.z0
      const T = R.times[i] // this racer's time for the course
      const u = Math.min(1, Math.max(0, R.u / T))
      const from = dir > 0 ? RACE.z0 : RACE.z1
      const z = from + dir * len * u
      // hops of about 1.4 m: the Hop clip (1 s) plays at the matching rate; the root arcs inside the clip
      const hopping = R.u > 0 && u < 1
      o.position.set(RACE.lanes[i], 0, z)
      turnToward(o, dir > 0 ? 0 : Math.PI, dt * 8)
      if (hopping) rig.play('Hop', { timeScale: (len / T) / 1.4, fade: 0.15 })
      else if (u >= 1) rig.play(R.winner === i ? 'Dance' : 'Idle', { fade: 0.3 })
      else rig.play('Idle', { fade: 0.3 })
      rig.setFace(u >= 1 && R.winner !== i ? 'surprised' : RACERS[i].expression)
      rig.tick(dt, state, 34)
    }),
  )
  return (
    <group ref={root} position={[RACE.lanes[i], 0, RACE.z0]}>
      <primitive object={rig.object} />
    </group>
  )
}
function Race() {
  // each race: a 3 s ready pause, then both hop the 33 m course in 10 to 12.5 s (seeded per race)
  const race = useMemo(() => {
    const cache = new Map()
    return (t) => {
      const n = Math.floor(t / RACE.every)
      if (!cache.has(n)) {
        const r = rand(500 + n)
        const times = [10 + r() * 2.5, 10 + r() * 2.5]
        cache.set(n, { times, winner: times[0] < times[1] ? 0 : 1, dir: n % 2 ? -1 : 1 })
        if (cache.size > 4) cache.delete(cache.keys().next().value)
      }
      return { ...cache.get(n), u: (t % RACE.every) - 3 }
    }
  }, [])
  return (
    <>
      <Racer i={0} race={race} />
      <Racer i={1} race={race} />
    </>
  )
}

export default function Ambient() {
  if (import.meta.env.DEV && typeof window !== 'undefined')
    Object.assign((window.__life ||= {}), { sleeper: SLEEP_AT, reader: READ_AT, queue: QUEUE[1].at, chat: CHAT[0].at, photo: PHOTO_AT })
  return (
    <>
      <Sleeper />
      <Reader />
      {QUEUE.map((q, i) => (
        <Queuer key={i} q={q} i={i} />
      ))}
      <Chatters />
      <Photographer />
      <Race />
    </>
  )
}
