import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import Labubu, { EXPRESSIONS, TossBall, YALE_BLUE } from './Labubu.jsx'
import { MEETING } from './layout.js'
import Life from './life/index.jsx'

// Labubus playing on the courtyard lawn (ground floor, y = -5).
// Courtyard trees stand at (-11,-8) (0,-10.5) (11,-8) (-13,5) (13,5) (-5,9.5) (6,10) (COURT_TREES in render/Scenery.jsx).
// The ring circles the maple at (11,-8); the birch at (0,-10.5) is behind the spell class (src/life/Spells.jsx).
const RING = { center: [11, -8], radius: 3, speed: 0.9 }
const RING_GAP = (Math.PI * 2) / RING.speed / 4 // four friends evenly spaced around the tree

const CREW = [
  // classic brown, hopping
  { fur: '#5a3d2e', expression: 'grin', anim: 'hop', position: [-6, 0, -3] },
  // the dashboard one: cream fur, striped tee, overalls, bucket hat
  { fur: '#d9c2a0', expression: 'happy', shirt: 'stripes', pants: '#e8dcc0', overalls: true, hat: 'bucket', anim: 'dance', position: [4, 0, -4], rotation: 0.4 },
  // pink in a Yale tee, waving up at the cloister
  { fur: '#ff8fc7', expression: 'mischief', shirt: 'yale', pants: '#1d2a44', anim: 'wave', position: [6, 0, 2], rotation: Math.PI },
  // ring-around-the-tree
  { fur: '#9fe0c6', expression: 'grin', shirt: 'yale', anim: 'circle', circle: RING, phase: 0 },
  { fur: '#b9a5e6', expression: 'happy', anim: 'circle', circle: RING, phase: RING_GAP },
  { fur: '#8d8d93', expression: 'surprised', shirt: 'stripes', pants: '#2c2c30', anim: 'circle', circle: RING, phase: RING_GAP * 2 },
  { fur: '#f2efe9', expression: 'happy', shirt: YALE_BLUE, pants: '#3d5a8a', anim: 'circle', circle: RING, phase: RING_GAP * 3 },
  // playing catch
  { fur: '#f2a65a', expression: 'grin', shirt: '#ffffff', pants: YALE_BLUE, anim: 'catch', position: [7, 0, -1], rotation: Math.PI / 2 },
  { fur: '#7fb2ff', expression: 'surprised', shirt: 'yale', anim: 'catch', position: [11.5, 0, -1], rotation: -Math.PI / 2, phase: 1.6 },
  // black Labubu in a pink tee, spinning
  { fur: '#2b2b2e', expression: 'mischief', shirt: '#ff4fa3', pants: '#111114', anim: 'spin', position: [-9, 0, 6] },
  // sleepy one with a pink bucket hat
  { fur: '#c98f6b', expression: 'sleepy', shirt: '#7a9e7e', pants: '#d8cfc0', hat: '#ffb3d9', anim: 'idle', position: [9, 0, 7], rotation: -0.6 },
  // little one dancing next to the big brown one
  { fur: '#5a3d2e', expression: 'happy', shirt: 'yale', pants: '#d8cfc0', anim: 'dance', position: [-7.5, 0, -5], height: 0.8, phase: 0.5 },
]

export default function LabubuParty({ y = -5, height = 1.3 }) {
  return (
    <>
      <group position={[0, y, 0]}>
        {CREW.map((c, i) => (
          <Labubu key={i} height={(c.height ?? 1) * height} phase={c.phase ?? i * 0.37} {...c} />
        ))}
        <TossBall from={[7, -1]} to={[11.5, -1]} height={height} />
      </group>
      {/* roamers, frisbee, spell practice, ambient Labubus and birds (src/life), in world coordinates */}
      <Life />
    </>
  )
}

// two or three Labubus in a meeting in every small glass room, sitting at the glass table
const FURS = ['#5a3d2e', '#d9c2a0', '#ff8fc7', '#9fe0c6', '#b9a5e6', '#8d8d93', '#f2efe9', '#f2a65a', '#7fb2ff', '#2b2b2e', '#c98f6b']
const SHIRTS = ['yale', 'yale', 'stripes', '#ffffff', YALE_BLUE, '#ff4fa3', '#7a9e7e', null]
const PANTS = ['#1d2a44', '#3d5a8a', '#d8cfc0', '#2c2c30', '#e8dcc0', null]
function rand(seed) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}
const SEAT_Y = 0.51 // chair seat top
const MEETERS = MEETING.flatMap((m, i) => {
  const r = rand(1000 + i * 7919)
  const pick = (arr) => arr[Math.floor(r() * arr.length)]
  const seats = [...m.seats].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 2))
  return seats.map((c, k) => ({
    key: `${i}-${k}`,
    fur: pick(FURS),
    expression: pick(EXPRESSIONS),
    shirt: pick(SHIRTS),
    pants: pick(PANTS),
    hat: r() < 0.15 ? 'bucket' : null,
    anim: r() < 0.25 ? 'wave' : 'idle',
    phase: r() * 10,
    position: [c.x, SEAT_Y - 0.11, c.z],
    rotation: c.rot + Math.PI, // face the table
  }))
})

// each meeting room's Labubus draw only while the camera is within 16 m: the rooms sit behind the drums in the
// back hallways, and from the cloister and the courtyard the frustum took in about 20 of them behind walls
const ROOMS_OF = MEETING.map((m, i) => ({ m, list: MEETERS.filter((c) => c.key.startsWith(`${i}-`)) }))
function MeetingRoom({ m, list }) {
  const ref = useRef()
  useFrame(({ camera }) => {
    ref.current.visible = Math.hypot(camera.position.x - m.x, camera.position.z - m.z) < 16
  })
  return (
    <group ref={ref}>
      {list.map(({ key, ...c }) => (
        <Labubu key={key} sitting {...c} />
      ))}
    </group>
  )
}
export function MeetingLabubus() {
  return ROOMS_OF.map((r, i) => <MeetingRoom key={i} {...r} />)
}
