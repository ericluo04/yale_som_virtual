import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ui } from '../interact/store.js'
import { OFF } from './debugCam.js'

// Camera feel on top of Player.jsx, without touching it. Runs after the player each frame.
//   Velocity: read from the camera's horizontal movement this frame (walk 5.5 m/s, sprint
//   9.5 m/s, crouch 2.4 m/s in Player.jsx), so the player needs no extra export.
//   Head bob: a vertical bob of up to 3.5 cm, two bobs per 1.5 m stride. Player.jsx writes
//   camera.position.y from scratch every frame, so the offset never accumulates.
//   Sprint FOV: widens by 8 degrees at sprint speed, reaching 95% in 300 ms.
//   Look damping: mouse, arrow and touch look all rotate the camera directly. The yaw and
//   pitch they add this frame go onto a raw target, and the camera follows that target with
//   a 35 ms time constant, so the full mouse movement still arrives.
const STRIDE = 1.5
const BOB = 0.035
const FOV_KICK = 8
const LOOK_TAU = 0.035
const SPRINT = 7.5 // m/s; between walk and sprint speed

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

export default function CameraFeel() {
  const { camera } = useThree()
  const s = useRef(null)
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  useFrame((_, rawDt) => {
    if (OFF.has('feel')) return
    const dt = Math.min(rawDt, 0.05)
    euler.setFromQuaternion(camera.quaternion)
    if (!s.current) {
      if (import.meta.env.DEV) window.__feel = { camera, state: () => s.current }
      s.current = { x: camera.position.x, z: camera.position.z, phase: 0, amp: 0, speed: 0, baseFov: camera.fov, rawYaw: euler.y, rawPitch: euler.x, yaw: euler.y, pitch: euler.x }
      return
    }
    const st = s.current

    // velocity from this frame's horizontal movement; a teleport (over 1 m) is ignored
    const step = Math.hypot(camera.position.x - st.x, camera.position.z - st.z)
    st.x = camera.position.x
    st.z = camera.position.z
    const v = step > 1 || dt === 0 ? 0 : step / dt
    st.speed += (v - st.speed) * (1 - Math.exp(-dt / 0.08))
    const playing = ui.get().playing && !ui.get().frozen

    // look damping: carry this frame's added yaw and pitch onto the raw target
    // (nothing else in the app sets the camera rotation absolutely every frame; a writer that
    // did would see its rotation added again each frame)
    st.rawYaw += wrap(euler.y - st.yaw)
    st.rawPitch = Math.max(-1.5, Math.min(1.5, st.rawPitch + (euler.x - st.pitch)))
    const k = 1 - Math.exp(-dt / LOOK_TAU)
    st.yaw += (st.rawYaw - st.yaw) * k
    st.pitch += (st.rawPitch - st.pitch) * k
    euler.set(st.pitch, st.yaw, euler.z)
    camera.quaternion.setFromEuler(euler)

    // head bob, faded in and out with speed
    const target = playing ? Math.min(1, st.speed / 5.5) : 0
    st.amp += (target - st.amp) * (1 - Math.exp(-dt / 0.15))
    st.phase += (st.speed * dt * 2 * Math.PI) / STRIDE
    if (st.amp > 0.001) camera.position.y += Math.sin(st.phase * 2) * BOB * st.amp

    // sprint FOV
    const fov = st.baseFov + (playing && st.speed > SPRINT ? FOV_KICK : 0)
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt / 0.1))
      camera.updateProjectionMatrix()
    }
  })
  return null
}
