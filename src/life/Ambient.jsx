import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BENCHES } from '../layout.js'
import { rand, timed, useLabubuRig } from './common.js'
import { clampSprite, sprite } from './sprites.js'

// Small scenes around the floor, cheap and mostly static:
//   a Labubu asleep in a library lounge chair (Sleep, now and then a Yawn) with z's floating up
//   one reading on the north-cloister banquette, turning a page every 3 s (SitRead)
//   three queueing at the southeast stair down to the cafe, heads down in their phones (Phone)
//   two chatting by the north courtyard glass, with speech bubbles

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

export default function Ambient() {
  if (import.meta.env.DEV && typeof window !== 'undefined')
    Object.assign((window.__life ||= {}), { sleeper: SLEEP_AT, reader: READ_AT, queue: QUEUE[1].at, chat: CHAT[0].at })
  return (
    <>
      <Sleeper />
      <Reader />
      {QUEUE.map((q, i) => (
        <Queuer key={i} q={q} i={i} />
      ))}
      <Chatters />
    </>
  )
}
