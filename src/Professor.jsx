import { Suspense, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { preloadModel, useClipPlayer, useRigInstance } from './characters/rig.js'

export const PROFESSORS = {
  dumbledore: { name: 'Albus Dumbledore', robe: '#4b2479', trim: '#c9b6e8', skin: '#efd2bd', hair: '#f1f0ec', height: 1.95 },
  mcgonagall: { name: 'Minerva McGonagall', robe: '#0f3b2a', trim: '#1b5a40', skin: '#f0d6c4', hair: '#5d5a58', height: 1.78 },
  trelawney: { name: 'Sybill Trelawney', robe: '#6b4a32', trim: '#d9a441', skin: '#f2dccb', hair: '#8a6a4a', height: 1.7 },
  slughorn: { name: 'Horace Slughorn', robe: '#5a1f2e', trim: '#c9a44a', skin: '#efc9ae', hair: '#bcb7ad', height: 1.78 },
  snape: { name: 'Severus Snape', robe: '#0b0b0d', trim: '#1c1c22', skin: '#e6dccf', hair: '#0f0e10', height: 1.88 },
  lockhart: { name: 'Gilderoy Lockhart', robe: '#a77fd0', trim: '#e6c9ff', skin: '#f3d3bb', hair: '#e8c870', height: 1.85 },
  moody: { name: 'Alastor Moody', robe: '#3a3a30', trim: '#5a5240', skin: '#d9b39a', hair: '#8f8a80', height: 1.85 },
  flitwick: { name: 'Filius Flitwick', robe: '#22304f', trim: '#3d5a8a', skin: '#f0cfb4', hair: '#f2f2f2', height: 1.05 },
  hagrid: { name: 'Rubeus Hagrid', robe: '#5b4330', trim: '#3b2c1f', skin: '#e2b28f', hair: '#2e2219', height: 2.7 },
}

// Each professor is a rigged GLB from tools/blender/professor.py (public/models/professor_<who>.glb),
// built at the real height in the table above, so nothing is scaled here.
// Clips: Idle (sway), Lecture (open-palm gesture), WandRaise (2.4 s, starts and ends in the Idle pose).
Object.keys(PROFESSORS).forEach((who) => preloadModel(`professor_${who}`))

function ProfessorModel({ who, position = [0, 0, 0], rotation = 0, phase = 0 }) {
  const root = useRef()
  const { object, actions } = useRigInstance(`professor_${who}`)
  const play = useClipPlayer(actions, 0.35)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    root.current.rotation.y = rotation + Math.sin(t * 0.4) * 0.35 // scanning the room
    // same timer as before: the wand goes up on every positive half of sin(1.3 t) (2.4 s, the clip's length);
    // in between the professor alternates lecturing and standing
    const w = t * 1.3
    const cycle = Math.floor(w / (2 * Math.PI))
    const raising = Math.sin(w) > 0
    play(raising ? 'WandRaise' : cycle % 2 ? 'Lecture' : 'Idle', { once: raising })
  })
  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]}>
      <primitive object={object} />
    </group>
  )
}

export default function Professor(props) {
  return (
    <Suspense fallback={null}>
      <ProfessorModel {...props} />
    </Suspense>
  )
}
