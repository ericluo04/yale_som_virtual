import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { EYE, MAX_STEP, SPAWN, collide, floorAt, locate } from './layout.js'
import { DEBUG_CAM, NOLOCK } from './render/debugCam.js'
import { ui } from './interact/store.js'
import { sound } from './interact/sound.js'
import { pushOut } from './interact/registry.js'

const CROUCH_EYE = 1.05
const JUMP_SPEED = 4.2
const GRAVITY = 12
const LOOK_SPEED = 0.005 // radians per touch pixel
const KEY_YAW = (120 * Math.PI) / 180 // arrow-key look, radians per second
const KEY_PITCH = (80 * Math.PI) / 180
// Movement runs at a fixed 120 Hz substep and the camera is drawn between the last two
// substeps, so a long or short frame (shadow redraw, pixel-ratio change) moves the view by
// exactly the time that passed. Frames longer than 50 ms are clamped.
const STEP_DT = 1 / 120
// eye height (floor + standing or crouched eye) follows a critically damped spring with an
// 80 ms smoothing time, so riser steps and crouch ease in and out without a kink
const EYE_OMEGA = 2 / 0.08
// arrow-key and touch look ease toward their target with a 35 ms time constant; the mouse
// under pointer lock turns the camera directly (damping a locked pointer reads as lag)
const LOOK_TAU = 0.035

// what CameraFeel (head bob, sprint FOV) and App (pixel-ratio switches) read about the walk:
// horizontal meters walked since load (dist at the last substep, drawn at the drawn camera
// position) and the smoothed speed in m/s
export const motion = { dist: 0, drawn: 0, speed: 0 }

// PC controls work like a shooter: WASD move, mouse or arrow keys look, Shift sprint, Space hop, C crouch.
// Touch controls come in through touchRef: { active, move: [x, y], look: [dx, dy], jump }.
export default function Player({ lockRef, mapRef, touchRef, onLock, onWhere }) {
  const { camera, gl } = useThree()
  const controls = useMemo(() => new PointerLockControls(camera, gl.domElement), [camera, gl])
  const keys = useRef({})
  const where = useRef('')
  const eye = useRef(EYE)
  const devY = useRef(null) // dev teleport can pin the camera height
  // simulation state: current (x, y, z) and previous substep (px, py, pz); y is floor + eye
  // without the jump, v its spring velocity; rx, rz is where the camera was last drawn, so a
  // move by anything else (dev teleport, ?cam=) resets the simulation there
  const sim = useRef(null)
  const look = useRef({ yaw: 0, pitch: 0 }) // arrow and touch look still to apply
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  useEffect(() => {
    camera.position.set(SPAWN.x, EYE, SPAWN.z)
    camera.rotation.set(0, 0, 0)
    if (DEBUG_CAM) {
      camera.position.set(DEBUG_CAM.x, DEBUG_CAM.y, DEBUG_CAM.z)
      camera.rotation.set(DEBUG_CAM.pitch, DEBUG_CAM.yaw, 0, 'YXZ')
      devY.current = DEBUG_CAM.y
    }
    lockRef.current = () => controls.lock()
    // the dialogue closes with a click or key press, which is a user gesture, so lock can come back
    ui.set({
      relock: () => {
        try {
          gl.domElement.requestPointerLock()?.catch?.(() => {})
        } catch {
          // browser refused (cooldown after Esc); the start overlay takes over
        }
      },
    })
    const on = () => onLock(true)
    const off = () => {
      keys.current = {} // keys held during Esc never get a keyup
      onLock(false)
    }
    controls.addEventListener('lock', on)
    controls.addEventListener('unlock', off)
    const down = (e) => {
      keys.current[e.code] = true
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
    const up = (e) => (keys.current[e.code] = false)
    const blur = () => (keys.current = {})
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      controls.removeEventListener('lock', on)
      controls.removeEventListener('unlock', off)
      controls.dispose()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [camera, controls, gl, lockRef, onLock])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // dev only: teleport for screenshots by setting <body data-go="[x, z, yawDeg]">
    if (import.meta.env.DEV && document.body.dataset.go) {
      const [x, z, yaw, pitch = 0, y = null] = JSON.parse(document.body.dataset.go)
      devY.current = y
      delete document.body.dataset.go
      camera.position.set(x, EYE, z)
      camera.rotation.set(pitch, (yaw * Math.PI) / 180, 0, 'YXZ')
    }
    const st = sim.current
    if (!st || Math.abs(camera.position.x - st.rx) > 1e-6 || Math.abs(camera.position.z - st.rz) > 1e-6) {
      const { x, z } = camera.position
      const y = floorAt(x, z) + eye.current
      sim.current = { x, z, y, px: x, pz: z, py: y, v: 0, jumpY: 0, jumpV: 0, acc: 0, rx: x, rz: z }
    }
    const S = sim.current
    const touch = touchRef.current
    // a dialogue (ui.frozen) stops movement and look; ?nolock walks without pointer lock
    const frozen = ui.get().frozen
    const playing = controls.isLocked || touch.active || NOLOCK
    const active = playing && !frozen
    if (playing !== ui.get().playing || touch.active !== ui.get().touch) ui.set({ playing, touch: touch.active })

    // touch look: drag on the right side of the screen
    const L = look.current
    if (active && touch.active && (touch.look[0] || touch.look[1])) {
      L.yaw -= touch.look[0] * LOOK_SPEED
      L.pitch -= touch.look[1] * LOOK_SPEED
    }
    touch.look[0] = 0
    touch.look[1] = 0

    // arrow keys look: left/right yaw, up/down pitch, clamped to the mouse's pitch limits
    const k = keys.current
    const ay = active ? (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0) : 0
    const ap = active ? (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0) : 0
    L.yaw += ay * KEY_YAW * dt
    L.pitch += ap * KEY_PITCH * dt
    if (!active) L.yaw = L.pitch = 0
    if (Math.abs(L.yaw) > 1e-5 || Math.abs(L.pitch) > 1e-5) {
      const kk = 1 - Math.exp(-dt / LOOK_TAU)
      euler.setFromQuaternion(camera.quaternion)
      euler.y += L.yaw * kk
      const lo = Math.max(-1.45, Math.PI / 2 - controls.maxPolarAngle)
      const hi = Math.min(1.45, Math.PI / 2 - controls.minPolarAngle)
      euler.x = Math.max(lo, Math.min(hi, euler.x + L.pitch * kk))
      camera.quaternion.setFromEuler(euler)
      L.yaw -= L.yaw * kk
      L.pitch -= L.pitch * kk
    }

    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()

    let f = 0
    let s = 0
    let sprint = false
    if (active) {
      f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
      s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
      sprint = k.ShiftLeft || k.ShiftRight
    }
    if (active && touch.active && (touch.move[0] || touch.move[1])) {
      f = -touch.move[1]
      s = touch.move[0]
      sprint = Math.hypot(f, s) > 0.95 // push the stick all the way to hurry
    }
    let mx = fwd.x * f - fwd.z * s
    let mz = fwd.z * f + fwd.x * s
    const l = Math.hypot(mx, mz)
    if (l > 1) {
      mx /= l
      mz /= l
    }
    const crouching = active && k.KeyC
    const speed = l > 0.05 ? (crouching ? 2.4 : sprint ? 9.5 : 5.5) : 0 // m/s; brisk walk, sprint is a jog
    const wantJump = (active && k.Space) || touch.jump
    touch.jump = false
    if (active && wantJump && S.jumpY === 0) S.jumpV = JUMP_SPEED
    const eyeTarget = crouching ? CROUCH_EYE : EYE
    eye.current = eyeTarget

    S.acc += dt
    for (let n = 0; S.acc >= STEP_DT && n < 8; n++) {
      S.acc -= STEP_DT
      S.px = S.x
      S.pz = S.z
      S.py = S.y + S.jumpY
      if (speed) {
        const pos = { x: S.x + mx * speed * STEP_DT, z: S.z + mz * speed * STEP_DT }
        collide(pos)
        pushOut(pos) // solid interactables (signs, NPCs)
        // risers: walk up one step at a time; anything taller acts like a wall
        const cur = floorAt(S.x, S.z)
        if (floorAt(pos.x, pos.z) - cur <= MAX_STEP) {
          S.x = pos.x
          S.z = pos.z
        } else if (floorAt(pos.x, S.z) - cur <= MAX_STEP) {
          S.x = pos.x // slide along the edge
        } else if (floorAt(S.x, pos.z) - cur <= MAX_STEP) {
          S.z = pos.z
        }
      }
      const moved = Math.hypot(S.x - S.px, S.z - S.pz)
      S.moved = moved
      motion.dist += moved
      motion.speed += (moved / STEP_DT - motion.speed) * (1 - Math.exp(-STEP_DT / 0.08))
      // jump
      S.jumpV -= GRAVITY * STEP_DT
      S.jumpY = Math.max(0, S.jumpY + S.jumpV * STEP_DT)
      if (S.jumpY === 0) S.jumpV = 0
      // eye height spring (semi-implicit Euler; stable while EYE_OMEGA * STEP_DT is well under 1)
      const target = floorAt(S.x, S.z) + eyeTarget
      S.v += (-2 * EYE_OMEGA * S.v - EYE_OMEGA * EYE_OMEGA * (S.y - target)) * STEP_DT
      S.y += S.v * STEP_DT
    }
    // draw between the previous and the current substep
    const a = S.acc / STEP_DT
    camera.position.x = S.px + (S.x - S.px) * a
    camera.position.z = S.pz + (S.z - S.pz) * a
    camera.position.y = devY.current ?? S.py + (S.y + S.jumpY - S.py) * a
    S.rx = camera.position.x
    S.rz = camera.position.z
    motion.drawn = motion.dist - (S.moved || 0) * (1 - a)

    if (import.meta.env.DEV) document.body.dataset.pos = `${camera.position.x.toFixed(2)},${camera.position.z.toFixed(2)},${fwd.x.toFixed(2)},${fwd.z.toFixed(2)}|${touch.move.map((v) => v.toFixed(2))}`
    mapRef.current?.(camera.position.x, camera.position.z, fwd.x, fwd.z)
    const w = locate(camera.position.x, camera.position.z)
    if (w !== where.current) {
      where.current = w
      onWhere(w)
      sound.setPlace(w)
    }
  })
  return null
}
