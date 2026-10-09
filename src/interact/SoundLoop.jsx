import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BEIN, COURTYARD, EAST, MEETING, MEET_DOOR, inPoly } from '../layout.js'
import { sound } from './sound.js'
import { ui } from './store.js'

// what the floor is made of under (x, z): stone on the outdoor terrace, grass in the courtyard, carpet elsewhere
export function surfaceAt(x, z) {
  if (x > EAST && Math.hypot(x - EAST, z) >= BEIN.r) return 'stone'
  if (inPoly(x, z, COURTYARD)) return 'grass'
  return 'carpet'
}

const DOOR_NEAR = 2.4 // m; matches the open radius of GlassDoor in World.jsx
const doorMids = MEETING.map((m) => [m.door.hinge[0] + MEET_DOOR / 2, m.door.hinge[1]])

// Mount once inside <Canvas>. Moves the audio listener with the camera, plays footsteps from
// the camera's own motion (so Player.jsx needs no sound code), and plays door swings.
export function SoundLoop() {
  const { camera } = useThree()
  const last = useRef(null)
  const stride = useRef(0)
  const doorOpen = useRef(doorMids.map(() => false))
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const p = camera.position
    const e = camera.matrixWorld.elements // forward is -Z column
    const fx = -e[8]
    const fz = -e[10]
    const fl = Math.hypot(fx, fz) || 1
    sound.listen(p.x, p.y, p.z, fx / fl, fz / fl)

    if (last.current) {
      const d = Math.hypot(p.x - last.current[0], p.z - last.current[2])
      const grounded = Math.abs(p.y - last.current[1]) < 0.03 // no steps mid-jump
      const speed = d / Math.max(dt, 1e-3)
      if (d > 2) stride.current = 0 // teleport, not a step
      else if (speed > 0.8 && grounded && !ui.get().frozen) {
        stride.current += d
        const len = speed > 7.5 ? 1.25 : speed < 3 ? 0.6 : 0.85 // stride grows with pace
        if (stride.current > len) {
          stride.current = 0
          sound.step(surfaceAt(p.x, p.z), speed)
        }
      }
      last.current[0] = p.x
      last.current[1] = p.y
      last.current[2] = p.z
    } else last.current = [p.x, p.y, p.z]

    for (let i = 0; i < doorMids.length; i++) {
      const near = Math.hypot(p.x - doorMids[i][0], p.z - doorMids[i][1]) < DOOR_NEAR
      if (near !== doorOpen.current[i]) {
        doorOpen.current[i] = near
        sound.door(doorMids[i][0], doorMids[i][1], near)
      }
    }
  })
  return null
}
