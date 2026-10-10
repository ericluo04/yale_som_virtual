import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Stats } from '@react-three/drei'
import * as THREE from 'three'
import World from './World.jsx'
import Effects from './render/Effects.jsx'
import Player from './Player.jsx'
import Minimap from './Minimap.jsx'
import TouchControls from './TouchControls.jsx'
import { EYE, SPAWN } from './layout.js'
import { DPR, HUD, NOLOCK, OFF, QUALITY, STATS } from './render/debugCam.js'
import { InteractScene, ui } from './interact/index.jsx'
import { useStore } from './interact/store.js'
import InteractUI from './ui/InteractUI.jsx'
import EggsA from './eggs/eggsA.jsx'
import EggsB from './eggs/eggsB.jsx'

export default function App() {
  const [locked, setLocked] = useState(false)
  const [where, setWhere] = useState('')
  const [showMap, setShowMap] = useState(true)
  // high quality starts at dpr 1 and climbs toward 2 in 0.1 steps while the frame rate holds
  // at the display rate; after three up-down flips it settles at 1. Post-processing at dpr 2
  // is about 30 fps on an M1 at 1440x900.
  const [dpr, setDpr] = useState(DPR ?? 1)
  const lockRef = useRef()
  const mapRef = useRef()
  const onLock = useCallback((v) => setLocked(v), [])
  const onWhere = useCallback((w) => setWhere(w), [])
  // phones have no pointer lock, so they get a joystick + drag-to-look instead
  const [isTouch] = useState(() => matchMedia('(pointer: coarse)').matches) // phones + tablets; touchscreen laptops still get mouse mode
  const [touchOn, setTouchOn] = useState(false)
  const touchRef = useRef({ active: false, move: [0, 0], look: [0, 0], jump: false })
  const setTouch = (on) => {
    touchRef.current.active = on
    touchRef.current.move = [0, 0]
    setTouchOn(on)
  }
  const frozen = useStore(ui, (s) => s.frozen) // a dialogue is open: keep the start overlay away
  const playing = locked || touchOn || frozen
  useEffect(() => {
    const k = (e) => e.code === 'KeyM' && setShowMap((v) => !v)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <>
      <Canvas
        camera={{ fov: 72, near: 0.05, far: 800, position: [SPAWN.x, EYE, SPAWN.z] }}
        dpr={dpr}
        shadows={QUALITY === 'low' || OFF.has('shadow') ? false : 'soft'}
        gl={{ antialias: QUALITY === 'low', powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.0
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
      >
        <World />
        <Player lockRef={lockRef} mapRef={mapRef} touchRef={touchRef} onLock={onLock} onWhere={onWhere} />
        <InteractScene />
        <EggsA />
        <EggsB />
        {/* N8AO keeps stale half-res buffers across a pixel-ratio change, so the chain remounts */}
        <Effects key={dpr} />
        {QUALITY !== 'low' && !DPR && (
          <PerformanceMonitor factor={0} step={0.1} flipflops={3} bounds={() => [52, 59]} onChange={({ factor }) => setDpr(1 + factor)} onFallback={() => setDpr(1)} />
        )}
        {STATS && <Stats />}
      </Canvas>

      {HUD && <div className="where">
        <span className="dot" />
        {where}
      </div>}
      <div className={showMap && HUD ? 'mapwrap' : 'mapwrap hidden'}>
        <Minimap drawRef={mapRef} />
      </div>
      {HUD && <button className="maptoggle" onClick={() => setShowMap((s) => !s)}>
        {showMap ? 'hide map' : 'map'}
      </button>}
      {playing && <div className="crosshair" />}
      <InteractUI />
      {touchOn && <TouchControls touchRef={touchRef} onPause={() => setTouch(false)} />}

      {!playing && !NOLOCK && (
        <div className="overlay" onClick={() => (isTouch ? setTouch(true) : lockRef.current?.())}>
          <div className="card">
            <div className="kicker">Yale SOM · Evans Hall</div>
            <h1>Floor 2</h1>
            <p className="sub">Classroom drums, the cloister, Ross Library, the Beinecke Terrace Room, and the courtyard.</p>
            <button className="go">{isTouch ? 'Tap to walk in' : 'Click to walk in'}</button>
            {!isTouch && (
              <button
                className="go alt"
                onClick={(e) => {
                  e.stopPropagation()
                  setTouch(true)
                }}
              >
                Use on-screen joystick
              </button>
            )}
            {isTouch ? (
              <div className="keys">
                <span><b>Left thumb</b> joystick to walk (push all the way to hurry)</span>
                <span><b>Right thumb</b> drag to look</span>
              </div>
            ) : (
              <div className="keys">
                <span><b>W A S D</b> walk</span>
                <span><b>Mouse</b> look</span>
                <span><b>Shift</b> sprint</span>
                <span><b>Space</b> jump</span>
                <span><b>C</b> crouch</span>
                <span><b>M</b> map</span>
                <span><b>E</b> interact</span>
                <span><b>N</b> sound</span>
                <span><b>Esc</b> pause</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
