import { useMemo } from 'react'
import * as THREE from 'three'
import { Interactable } from './Interactable.jsx'
import { openDialogue } from '../ui/dialogueStore.jsx'
import { discover } from '../ui/discoveries.js'

// DEMO: a sign near the spawn that shows the interaction + dialogue system working.
// Swap it out (and its 'demo-sign' line in ui/discoveries.js CATALOG) once real easter eggs exist.
const POS = [-24.4, 0, 18.6] // 3.4 m in front of SPAWN, which faces north (-z)

const SCRIPT = [
  { speaker: 'Demo sign', text: 'Welcome to Evans Hall. This sign is a demo of the interaction system.' },
  {
    speaker: 'Demo sign',
    text: 'Easter eggs will talk to you like this. Log this sign as a discovery?',
    choices: [
      { text: 'Yes, log it', next: 'yes', onChoice: () => discover('demo-sign') },
      { text: 'No thanks', next: 'no' },
    ],
  },
  { id: 'yes', speaker: 'Demo sign', text: 'Logged. The counter at the top right counts it, through `useDiscoveries()`.', next: 'end' },
  { id: 'no', speaker: 'Demo sign', text: 'Fine. Press E here any time to change your mind.', next: 'end' },
]

function signTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const g = c.getContext('2d')
  g.fillStyle = '#0b0b0d'
  g.fillRect(0, 0, 512, 320)
  g.strokeStyle = '#ff4fa3'
  g.lineWidth = 10
  g.strokeRect(10, 10, 492, 300)
  g.fillStyle = '#ff4fa3'
  g.font = '600 30px "JetBrains Mono", monospace'
  g.textAlign = 'center'
  g.fillText('DEMO', 256, 80)
  g.fillStyle = '#ffffff'
  g.font = 'bold 84px Inter, system-ui, sans-serif'
  g.fillText('Press E', 256, 190)
  g.fillStyle = '#ffd6ea'
  g.font = '26px Inter, system-ui, sans-serif'
  g.fillText('interaction system test', 256, 255)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export default function DemoSign() {
  const mats = useMemo(
    () => ({
      face: new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }),
      post: new THREE.MeshStandardMaterial({ color: '#2a2a30', metalness: 0.6, roughness: 0.4 }),
    }),
    [],
  )
  return (
    <Interactable position={POS} radius={2.6} label="the demo sign" verb="Read" marker="interact" onInteract={() => openDialogue(SCRIPT)}>
      <mesh material={mats.post} position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 10]} />
      </mesh>
      <mesh material={mats.post} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.22, 0.25, 0.04, 20]} />
      </mesh>
      {/* board faces south, toward the spawn */}
      <mesh material={mats.post} position={[0, 1.42, -0.015]}>
        <boxGeometry args={[0.84, 0.54, 0.02]} />
      </mesh>
      <mesh material={mats.face} position={[0, 1.42, 0.001]}>
        <planeGeometry args={[0.8, 0.5]} />
      </mesh>
    </Interactable>
  )
}
