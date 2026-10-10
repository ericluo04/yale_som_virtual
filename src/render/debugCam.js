// URL switches for screenshots and tuning. Headless browsers cannot grant pointer lock,
// so ?cam= places the camera directly and skips the start overlay.
//   ?cam=x,y,z,yaw,pitch  position in meters (y is eye height above world zero), yaw and pitch in degrees
//   ?nolock=1             skip the start overlay without moving the camera
//   ?quality=low|high     rendering quality (default high)
//   ?stats=1              fps panel
//   ?off=ao,bloom,smaa,ssr,dof,grade,vignette,feel,post,lights,shadow   switch single render features off
//                         to profile them (feel: head bob, sprint FOV and look damping)
//   ?dpr=1.5              override the pixel-ratio cap
//   ?hud=0                hide the location pill and minimap for clean screenshots
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)

function parseCam(s) {
  if (!s) return null
  const v = s.split(',').map(Number)
  if (v.length < 3 || v.slice(0, 3).some((n) => !Number.isFinite(n))) return null
  const [x, y, z, yaw = 0, pitch = 0] = v
  return { x, y, z, yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180 }
}

export const DEBUG_CAM = parseCam(params.get('cam'))
export const NOLOCK = !!DEBUG_CAM || params.get('nolock') === '1'
export const QUALITY = params.get('quality') === 'low' ? 'low' : 'high'
export const STATS = params.get('stats') === '1'
export const HUD = params.get('hud') !== '0'
export const OFF = new Set((params.get('off') || '').split(',').filter(Boolean))
export const DPR = Number(params.get('dpr')) || null
