import { Suspense } from 'react'
import { LIFE_ON } from './common.js'
import Roamers from './Roamers.jsx'
import Frisbee from './Frisbee.jsx'
import { Bursts } from './fx.jsx'

// Everything alive outside the classrooms (the classroom extras mount from LabubuCrowd).
// Mounted from LabubuParty, at world origin. ?off=life switches it all off.
export default function Life() {
  if (!LIFE_ON) return null
  return (
    <Suspense fallback={null}>
      <Roamers />
      <Frisbee />
      <Bursts />
    </Suspense>
  )
}
