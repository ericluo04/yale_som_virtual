import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF, useAnimations } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Shared loader for the Blender-built character GLBs in public/models (see tools/blender/).
// Files are Draco-compressed; the decoder is served from public/draco.
const BASE = import.meta.env.BASE_URL
export const DRACO = `${BASE}draco/`
export const modelUrl = (name) => `${BASE}models/${name}.glb`
export const useModel = (name) => useGLTF(modelUrl(name), DRACO)
export const preloadModel = (name) => useGLTF.preload(modelUrl(name), DRACO)

// grayscale fur strands, used as a bump map on every material named Fur/Frog/Coat/Brindle
let furBump
export function furBumpTex() {
  if (furBump) return furBump
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#808080'
  g.fillRect(0, 0, 256, 256)
  let s = 7
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < 6000; i++) {
    const v = 90 + Math.floor(r() * 130)
    g.strokeStyle = `rgba(${v},${v},${v},0.6)`
    const x = r() * 256
    const y = r() * 256
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + r() * 4 - 2, y + 3 + r() * 6)
    g.stroke()
  }
  furBump = new THREE.CanvasTexture(c)
  furBump.wrapS = furBump.wrapT = THREE.RepeatWrapping
  furBump.repeat.set(4, 4)
  return furBump
}
const FURRY = new Set(['Fur', 'Frog', 'Coat', 'Brindle'])
export function dressMaterial(m) {
  if (FURRY.has(m.name)) {
    m.bumpMap = furBumpTex()
    m.bumpScale = 1.2
  }
  return m
}

// A private copy of a skinned GLB scene with its own materials (so tints don't leak between characters).
// `setup(object, cloneMat)` runs once on the copy; cloneMat(name) swaps in a private clone of that material.
export function useRigInstance(name, setup, deps = []) {
  const { scene, animations } = useModel(name)
  const object = useMemo(() => {
    const o = cloneSkinned(scene)
    const mine = new Map()
    o.traverse((m) => {
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false // skinned bounds follow the bind pose, not the animation
      m.material = dressMaterial(m.material)
    })
    const cloneMat = (matName) => {
      if (!mine.has(matName)) {
        let base
        o.traverse((m) => m.isMesh && m.material.name === matName && (base = m.material))
        if (!base) return null
        const c = base.clone()
        mine.set(matName, c)
        o.traverse((m) => m.isMesh && m.material === base && (m.material = c))
      }
      return mine.get(matName)
    }
    setup?.(o, cloneMat)
    return o
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, ...deps])
  const { actions, mixer } = useAnimations(animations, object)
  return { object, actions, mixer }
}

// Plays one clip at a time and cross-fades on change. Returns play(name, opts).
export function useClipPlayer(actions, fade = 0.3) {
  const cur = useRef(null)
  useEffect(() => () => (cur.current = null), [actions])
  return (name, { timeScale = 1, time, once = false } = {}) => {
    const next = actions[name]
    if (!next) return null
    next.timeScale = timeScale
    if (cur.current === next) return next
    next.reset()
    if (once) {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    } else next.setLoop(THREE.LoopRepeat, Infinity)
    if (time !== undefined) next.time = time
    next.play()
    if (cur.current) next.crossFadeFrom(cur.current, cur.current ? fade : 0, false)
    cur.current = next
    return next
  }
}
