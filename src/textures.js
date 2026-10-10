import * as THREE from 'three'

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

// striped oatmeal carpet from the photos
export function carpetTex(repeat = [0.25, 0.25], base = '#d6c9b3') {
  const [c, g] = canvas(512, 512)
  g.fillStyle = base
  g.fillRect(0, 0, 512, 512)
  const r = rng(7)
  const cols = ['#c4b59c', '#e4d9c6', '#b7b2aa', '#cdbfa8', '#efe6d6']
  for (let i = 0; i < 900; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)]
    g.globalAlpha = 0.25 + r() * 0.4
    g.fillRect(r() * 512, 0, 0.6 + r() * 1.6, 512)
  }
  g.globalAlpha = 1
  return tex(c, repeat)
}

// drum glazing: deep Yale-blue glass (near Pantone 289) in 1.2 m horizontal bands with thin
// dark joints and staggered vertical joints; gloss and reflections come from the material
export function drumTex() {
  const [c, g] = canvas(512, 512)
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#0d3f86')
  grd.addColorStop(0.5, '#0f4d92')
  grd.addColorStop(1, '#00356b')
  g.fillStyle = grd
  g.fillRect(0, 0, 512, 512)
  const band = 512 / 6 // the drum walls are 7.2 m tall
  const r = rng(31)
  for (let i = 0; i < 6; i++) {
    const y = i * band
    g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`
    g.fillRect(0, y + 3, 512, band - 6)
    g.fillStyle = 'rgba(2,10,30,0.7)'
    g.fillRect(0, y, 512, 3)
    g.fillStyle = 'rgba(2,10,30,0.45)'
    for (let x = (i % 2) * 64; x < 512; x += 128) g.fillRect(x, y, 2, band)
  }
  return tex(c, [10, 1])
}

// level 1 café back wall (photo 07), one 12 m x 4.1 m tile: warm wood panelling to 2.4 m,
// cream wall above with two striped colour-field paintings
export function cafeTex() {
  const PX = 128 // pixels per metre
  const [c, g] = canvas(12 * PX, 524)
  g.fillStyle = '#efe4cf'
  g.fillRect(0, 0, c.width, c.height)
  const woodTop = c.height - 2.4 * PX
  const r = rng(41)
  for (let x = 0; x < c.width; x += 1.2 * PX) {
    g.fillStyle = `hsl(${24 + r() * 5}, ${48 + r() * 8}%, ${36 + r() * 6}%)`
    g.fillRect(x, woodTop, 1.2 * PX, c.height - woodTop)
    g.fillStyle = 'rgba(30,15,5,0.55)'
    g.fillRect(x, woodTop, 2, c.height - woodTop)
  }
  g.fillStyle = 'rgba(30,15,5,0.4)'
  g.fillRect(0, woodTop, c.width, 3)
  const stripes = ['#e2392f', '#f2b51d', '#2f6fbe', '#3aa35a', '#e86a9a', '#f07a1f', '#7a4fb0']
  for (const [x0, k] of [[1.4, 0], [7.2, 3]]) {
    const x = x0 * PX
    const y = 0.4 * PX
    const w = 2.4 * PX
    const h = 1.15 * PX
    for (let i = 0; i < 14; i++) {
      g.fillStyle = stripes[(i + k) % stripes.length]
      g.fillRect(x + (i * w) / 14, y, w / 14 + 1, h)
    }
    g.strokeStyle = '#2a2420'
    g.lineWidth = 3
    g.strokeRect(x, y, w, h)
  }
  return tex(c, [1, 1])
}

// buttoned leather cushion, one 0.6 x 0.6 m tile as a normal map: soft bulge between seams
// across the tile edges (v), three by three buttons pulled into dimples
export function tuftNormalTex() {
  const N = 256
  const h = new Float32Array(N * N)
  const btn = [1 / 6, 1 / 2, 5 / 6]
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      const dv = Math.min(v, 1 - v) // distance to the seam
      let z = Math.min(1, dv / 0.08) ** 0.5 * 0.6 // bulge rising from the seam
      for (const bu of btn)
        for (const bv of btn) {
          const d2 = ((u - bu) ** 2 + (v - bv) ** 2) / 0.0016
          z -= 0.35 * Math.exp(-d2)
        }
      h[y * N + x] = z
    }
  const [c, g] = canvas(N, N)
  const img = g.createImageData(N, N)
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)]
  const k = 6 // slope gain: height units to normal tilt
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * k
      const ny = (at(x, y + 1) - at(x, y - 1)) * k
      const l = Math.hypot(nx, ny, 1)
      const i = (y * N + x) * 4
      img.data[i] = (nx / l * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / 0.6, 1 / 0.6) // the cushion UVs are metres
  t.anisotropy = 8
  return t
}

export function slatsTex() {
  const [c, g] = canvas(128, 256)
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = '#2e1a0e'
    g.fillRect(0, y, 128, 16)
    g.fillStyle = y % 32 ? '#8d522a' : '#94592e'
    g.fillRect(0, y + 2, 128, 11)
  }
  return tex(c)
}

export function teakTex() {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#b06c38'
  g.fillRect(0, 0, 256, 256)
  const r = rng(3)
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(90,45,15,0.25)' : 'rgba(220,150,90,0.2)'
    g.lineWidth = 1 + r() * 2
    const y = r() * 256
    g.beginPath()
    g.moveTo(0, y)
    g.bezierCurveTo(80, y + r() * 6 - 3, 170, y + r() * 6 - 3, 256, y)
    g.stroke()
  }
  return tex(c)
}

export function sageTex() {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#aeb08a'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = 'rgba(40,45,30,0.55)'
  for (const y of [70, 140, 210]) g.fillRect(0, y, 256, 3)
  return tex(c)
}

export function booksTex() {
  const [c, g] = canvas(512, 256)
  g.fillStyle = '#5a3a20'
  g.fillRect(0, 0, 512, 256)
  const r = rng(11)
  const cols = ['#7a1f2b', '#1f3b6b', '#2d5a3c', '#c9a227', '#e8e1d0', '#3b3b3b', '#8b5a2b', '#ff4fa3']
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = 4
    const y0 = shelf * 64 + 6
    while (x < 508) {
      const w = 5 + r() * 9
      const h = 40 + r() * 14
      g.fillStyle = cols[Math.floor(r() * cols.length)]
      g.fillRect(x, y0 + (54 - h), w, h)
      x += w + 1
    }
  }
  return tex(c)
}

export function stoneTex(repeat) {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#d9ceb5'
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = 'rgba(90,80,60,0.45)'
  g.lineWidth = 2
  for (let row = 0; row < 16; row++) {
    const y = row * 32
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(512, y)
    g.stroke()
    for (let x = (row % 2) * 48; x < 512; x += 96) {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x, y + 32)
      g.stroke()
    }
  }
  return tex(c, repeat)
}

export function lawnTex() {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#34502a'
  g.fillRect(0, 0, 256, 256)
  const r = rng(5)
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(80,120,60,0.35)' : 'rgba(20,40,15,0.3)'
    g.fillRect(r() * 256, r() * 256, 2, 2)
  }
  return tex(c, [0.15, 0.15])
}

// abstract mustard / coral / sage mural (Beinecke Terrace Room)
export function muralTex() {
  const [c, g] = canvas(1024, 512)
  g.fillStyle = '#c9a26a'
  g.fillRect(0, 0, 1024, 512)
  const blobs = [
    ['#8fa58a', 120, 180, 380], ['#d9a21b', 520, 420, 420], ['#e9876a', 760, 120, 300],
    ['#e2671f', 900, 380, 260], ['#8fa58a', 420, 40, 220], ['#f2b8a0', 640, 260, 160],
  ]
  for (const [col, x, y, r] of blobs) {
    g.fillStyle = col
    g.globalAlpha = 0.9
    g.beginPath()
    g.ellipse(x, y, r, r * 0.7, 0.4, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  return tex(c)
}

export function screenTex() {
  const [c, g] = canvas(640, 360)
  const grd = g.createLinearGradient(0, 0, 640, 360)
  grd.addColorStop(0, '#1d3fd1')
  grd.addColorStop(1, '#2f6bff')
  g.fillStyle = grd
  g.fillRect(0, 0, 640, 360)
  g.fillStyle = '#7fd6ff'
  g.font = 'bold 54px Impact, "Arial Narrow", sans-serif'
  g.fillText('MGT 409', 210, 120)
  g.fillText('AI FOUNDATIONS', 150, 180)
  g.fillText('FOR MANAGERS', 160, 240)
  g.fillStyle = '#ff4fa3'
  g.fillText('VIBE ON', 230, 300)
  return tex(c)
}

export function posterTex() {
  const [c, g] = canvas(400, 800)
  g.fillStyle = '#0d0d10'
  g.fillRect(0, 0, 400, 800)
  g.fillStyle = '#ff4fa3'
  g.font = 'bold 70px Georgia, serif'
  g.fillText('MGT 409', 40, 110)
  g.font = '32px Georgia, serif'
  g.fillStyle = '#ffffff'
  g.fillText('Lecture 13', 40, 160)
  g.fillText('Walk the floor.', 40, 200)
  const r = rng(9)
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 5; j++) {
      g.fillStyle = `hsl(${320 + r() * 40}, 70%, ${35 + r() * 35}%)`
      g.fillRect(40 + j * 66, 260 + i * 80, 58, 70)
    }
  return tex(c)
}

export function signTex(name, num) {
  const [c, g] = canvas(256, 320)
  g.fillStyle = '#2a2a2e'
  g.fillRect(0, 0, 256, 320)
  g.fillStyle = '#f1f1f1'
  g.font = '30px Georgia, serif'
  const words = name.split(' ')
  let line = ''
  let y = 60
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (g.measureText(test).width > 220) {
      g.fillText(line, 18, y)
      y += 36
      line = w
    } else line = test
  }
  g.fillText(line, 18, y)
  g.font = '20px Georgia, serif'
  g.fillText(num, 18, 296)
  return tex(c)
}

export function exitTex() {
  const [c, g] = canvas(128, 48)
  g.fillStyle = '#1a0505'
  g.fillRect(0, 0, 128, 48)
  g.fillStyle = '#ff2b2b'
  g.font = 'bold 34px Arial, sans-serif'
  g.fillText('EXIT', 24, 37)
  return tex(c)
}

export function stairOpeningTex() {
  const [c, g] = canvas(256, 360)
  g.fillStyle = '#e8e6e2'
  g.fillRect(0, 0, 256, 360)
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#1e1e22' : '#2c2c31'
    g.fillRect(40, 360 - (i + 1) * 26, 176, 26)
  }
  g.strokeStyle = '#111'
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(36, 340)
  g.lineTo(150, 30)
  g.stroke()
  return tex(c)
}

// building faces across the courtyard: glass with warm lit rooms
export function windowsTex(warm = true) {
  const [c, g] = canvas(512, 256)
  g.fillStyle = '#1d2533'
  g.fillRect(0, 0, 512, 256)
  const r = rng(warm ? 21 : 22)
  for (let x = 0; x < 512; x += 32)
    for (let y = 0; y < 256; y += 64) {
      const lit = r() > 0.25
      g.fillStyle = lit ? (warm ? '#f3d9a4' : '#c9d8f0') : '#2e3a4f'
      g.globalAlpha = lit ? 0.55 + r() * 0.4 : 1
      g.fillRect(x + 2, y + 4, 28, 56)
    }
  g.globalAlpha = 1
  return tex(c, [1, 1])
}

export function skyTex() {
  const [c, g] = canvas(16, 512)
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#1d3a8a')
  grd.addColorStop(0.55, '#5f83d6')
  grd.addColorStop(1, '#c9b9d8')
  g.fillStyle = grd
  g.fillRect(0, 0, 16, 512)
  return tex(c)
}

// made-up stairwell paintings in the spirit of the Stair G portrait
const PALETTES = [
  ['#1b2a6b', '#e63946', '#f4a261', '#2ec4b6', '#ffd166'],
  ['#0f0f12', '#ff4fa3', '#ffd400', '#00b4d8', '#ffffff'],
  ['#3a0ca3', '#f72585', '#4cc9f0', '#ffbe0b', '#06d6a0'],
  ['#264653', '#e76f51', '#e9c46a', '#2a9d8f', '#f4f1de'],
  ['#2b2d42', '#ef233c', '#edf2f4', '#8d99ae', '#ffb703'],
  ['#14213d', '#fca311', '#e5e5e5', '#d00000', '#3a86ff'],
]
export function paintingTex(seed) {
  const [c, g] = canvas(300, 400)
  const r = rng(seed * 97)
  const p = PALETTES[seed % PALETTES.length]
  g.fillStyle = p[0]
  g.fillRect(0, 0, 300, 400)
  // halo rings
  for (let i = 8; i > 0; i--) {
    g.strokeStyle = p[1 + (i % 4)]
    g.lineWidth = 8
    g.beginPath()
    g.arc(150, 150, i * 22, 0, Math.PI * 2)
    g.stroke()
  }
  // patterned bands
  for (let i = 0; i < 14; i++) {
    g.fillStyle = p[1 + Math.floor(r() * 4)]
    g.beginPath()
    const x = r() * 300
    const y = 260 + r() * 140
    g.moveTo(x, y)
    g.lineTo(x + 40, y - 30)
    g.lineTo(x + 80, y)
    g.fill()
  }
  // figure
  const skin = ['#5a3825', '#8d5524', '#c68642', '#3b2219'][seed % 4]
  g.fillStyle = p[1]
  g.fillRect(105, 140, 90, 120) // jacket
  g.fillStyle = p[3]
  g.fillRect(110, 255, 34, 105)
  g.fillRect(156, 255, 34, 105) // legs
  g.fillStyle = '#ffffff'
  g.fillRect(104, 352, 44, 16)
  g.fillRect(152, 352, 44, 16) // sneakers
  g.fillStyle = p[1]
  g.fillRect(104, 362, 44, 6)
  g.fillRect(152, 362, 44, 6)
  g.fillStyle = skin
  g.beginPath()
  g.arc(150, 112, 30, 0, Math.PI * 2)
  g.fill()
  g.fillRect(76, 150, 30, 18)
  g.fillRect(194, 120, 18, 40) // arms
  g.fillStyle = '#111'
  g.fillRect(118, 86, 64, 16) // hair
  for (let i = 0; i < 7; i++) g.fillRect(118 + i * 10, 96, 5, 50 + (i % 3) * 10)
  // dotted pattern on legs
  g.fillStyle = p[4]
  for (let i = 0; i < 30; i++) g.fillRect(112 + (i % 6) * 13, 262 + Math.floor(i / 6) * 18, 4, 4)
  return tex(c)
}

// ---------- library (render/Scenery.jsx book rows, render/Props.jsx prints)
// One shelf row of book spines, 2 m wide by 0.37 m tall at 512 px/m, wrapping in u. Three kinds
// with their own spine colours and heights, so neighbouring shelves stop repeating one tile:
// 0 cloth hardbacks, 1 bright paperbacks, 2 bound journal runs with gilt bands. The space above
// the shorter books is the dark inside of the shelf.
export function bookTileTex(kind) {
  const W = 1024
  const Hh = 192
  const [c, g] = canvas(W, Hh)
  const grd = g.createLinearGradient(0, 0, 0, Hh)
  grd.addColorStop(0, '#0e0c0a')
  grd.addColorStop(1, '#2a241e')
  g.fillStyle = grd
  g.fillRect(0, 0, W, Hh)
  const r = rng(101 + kind * 17)
  const PAL = [
    ['#6e1f24', '#1d2f55', '#2c4a33', '#8a6a3a', '#4a2a1a', '#2b2b2e', '#7d5a2c', '#5b1a32', '#c8b89a'],
    ['#e3ddcc', '#c9a23a', '#b8623a', '#3f7a78', '#1c1c1c', '#9e3a36', '#41618f', '#ece8de', '#6f8a4a', '#b07a8a', '#d8cfb8'],
    ['#00356b', '#5a1420', '#3c3f44', '#1e4d3a', '#7a6a55'],
  ][kind]
  let x = 0
  while (x < W) {
    if (r() < 0.04) {
      x += 20 + r() * 50 // a gap on the shelf
      continue
    }
    // journals come in runs of one colour and one height; the others vary book by book
    const run = kind === 2 ? 4 + Math.floor(r() * 9) : 1
    const col = PAL[Math.floor(r() * PAL.length)]
    const hRun = kind === 2 ? 0.8 + r() * 0.1 : 0
    for (let k = 0; k < run && x < W; k++) {
      const w = kind === 1 ? 9 + r() * 14 : kind === 2 ? 15 + r() * 4 : 14 + r() * 20
      const h = Hh * (kind === 2 ? hRun : kind === 1 ? 0.55 + r() * 0.3 : 0.62 + r() * 0.33)
      const y = Hh - h
      const shade = 0.85 + r() * 0.3
      g.fillStyle = col
      g.globalAlpha = 1
      g.fillRect(x, y, w - 1, h)
      g.fillStyle = shade > 1 ? '#ffffff' : '#000000'
      g.globalAlpha = Math.abs(shade - 1) * 0.6
      g.fillRect(x, y, w - 1, h)
      g.globalAlpha = 1
      // rounded spine: darker edges
      g.fillStyle = 'rgba(0,0,0,0.28)'
      g.fillRect(x, y, 2, h)
      g.fillRect(x + w - 3, y, 2, h)
      if (kind === 2) {
        g.fillStyle = '#c9a54a'
        for (const f of [0.12, 0.2, 0.78]) g.fillRect(x + 2, y + h * f, w - 5, 2)
        g.fillStyle = '#e8d9a8'
        g.fillRect(x + 4, y + h * 0.3, w - 9, h * 0.08)
      } else if (kind === 0) {
        if (r() < 0.7) {
          g.fillStyle = 'rgba(214,190,120,0.8)'
          g.fillRect(x + 2, y + h * 0.1, w - 5, 2)
          g.fillRect(x + 2, y + h * 0.86, w - 5, 2)
        }
        g.fillStyle = 'rgba(230,215,170,0.55)'
        g.fillRect(x + w * 0.35, y + h * 0.25, w * 0.25, h * 0.45)
      } else {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)'
        g.fillRect(x + w * 0.3, y + h * 0.15, w * 0.35, h * 0.5)
        g.fillRect(x + 2, y + h * 0.85, w - 5, h * 0.06)
      }
      x += w
    }
  }
  const t = tex(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

// three large prints over the library shelves: Evans Hall's facade in line art, a Yale blue
// "Ross Library" panel and a world map
export function libraryPrintTex(kind) {
  const W = 1024
  const Hh = 724
  const [c, g] = canvas(W, Hh)
  if (kind === 0) {
    g.fillStyle = '#f3efe4'
    g.fillRect(0, 0, W, Hh)
    g.strokeStyle = '#2b2e33'
    g.lineWidth = 3
    // roof canopy, two floors of curtain wall, the drums behind the glass
    const top = 190
    const base = 560
    g.beginPath()
    g.moveTo(60, top)
    g.lineTo(964, top)
    g.moveTo(80, top + 18)
    g.lineTo(944, top + 18)
    g.stroke()
    g.lineWidth = 2
    for (const y of [top + 18, 300, 410, base]) {
      g.beginPath()
      g.moveTo(110, y)
      g.lineTo(914, y)
      g.stroke()
    }
    g.lineWidth = 1.2
    for (let x = 110; x <= 914; x += 23) {
      g.beginPath()
      g.moveTo(x, top + 18)
      g.lineTo(x, base)
      g.stroke()
    }
    g.lineWidth = 2.5
    for (const [cx, w] of [[250, 150], [430, 120], [600, 120], [780, 150]]) {
      for (const [y0, y1] of [[318, 405], [228, 296]]) {
        g.beginPath()
        g.ellipse(cx, (y0 + y1) / 2, w / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2)
        g.stroke()
      }
    }
    g.beginPath()
    g.moveTo(40, base + 30)
    g.lineTo(984, base + 30)
    g.stroke()
    g.fillStyle = '#2b2e33'
    g.font = '30px Georgia, serif'
    g.textAlign = 'center'
    g.fillText('Edward P. Evans Hall', W / 2, 650)
    g.font = '20px Georgia, serif'
    g.fillText('165 Whitney Avenue  ·  2014', W / 2, 684)
  } else if (kind === 1) {
    g.fillStyle = '#00356b'
    g.fillRect(0, 0, W, Hh)
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 3
    g.strokeRect(40, 40, W - 80, Hh - 80)
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.font = 'bold 150px Georgia, serif'
    g.fillText('ROSS', W / 2, 330)
    g.font = '96px Georgia, serif'
    g.fillText('LIBRARY', W / 2, 450)
    g.fillRect(W / 2 - 160, 500, 320, 3)
    g.font = '34px Georgia, serif'
    g.fillText('Yale School of Management', W / 2, 570)
  } else {
    g.fillStyle = '#e9e4d6'
    g.fillRect(0, 0, W, Hh)
    const px = (lon) => 32 + ((lon + 180) / 360) * (W - 64)
    const py = (lat) => 40 + ((85 - lat) / 145) * (Hh - 80)
    g.strokeStyle = 'rgba(60,70,80,0.18)'
    g.lineWidth = 1
    for (let lon = -180; lon <= 180; lon += 30) {
      g.beginPath()
      g.moveTo(px(lon), py(85))
      g.lineTo(px(lon), py(-60))
      g.stroke()
    }
    for (let lat = -60; lat <= 80; lat += 20) {
      g.beginPath()
      g.moveTo(px(-180), py(lat))
      g.lineTo(px(180), py(lat))
      g.stroke()
    }
    // continents as rough outlines in (lon, lat)
    const LAND = [
      [[-168, 66], [-140, 70], [-95, 72], [-80, 64], [-62, 58], [-55, 50], [-66, 44], [-76, 35], [-81, 25], [-90, 29], [-97, 26], [-105, 20], [-87, 15], [-78, 8], [-85, 12], [-105, 22], [-115, 31], [-124, 40], [-125, 49], [-135, 58], [-152, 58], [-165, 60]],
      [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-58, -38], [-66, -55], [-74, -50], [-71, -20], [-81, -5]],
      [[-55, 82], [-20, 82], [-20, 70], [-45, 60], [-58, 74]],
      [[-10, 36], [-9, 44], [-2, 48], [-5, 54], [5, 58], [10, 54], [20, 56], [28, 66], [20, 70], [40, 68], [60, 70], [100, 76], [140, 72], [180, 68], [160, 60], [142, 52], [130, 42], [122, 30], [120, 22], [108, 10], [100, 14], [98, 8], [92, 22], [80, 15], [76, 8], [72, 20], [58, 25], [50, 30], [36, 36], [28, 41], [20, 40], [12, 44], [8, 44], [3, 42], [-5, 36]],
      [[-17, 15], [-10, 30], [-5, 36], [10, 37], [32, 31], [35, 28], [43, 12], [51, 12], [40, -15], [35, -24], [20, -35], [12, -18], [9, 4], [-8, 4], [-17, 12]],
      [[114, -22], [130, -12], [142, -11], [153, -27], [146, -39], [130, -32], [116, -35]],
      [[130, 33], [140, 35], [142, 43], [136, 37]],
      [[-6, 50], [2, 51], [-3, 58], [-6, 56]],
      [[95, 5], [105, -6], [120, -9], [125, -2], [110, 2]],
    ]
    g.fillStyle = '#8fa48a'
    g.strokeStyle = '#5e6f5a'
    g.lineWidth = 2
    for (const poly of LAND) {
      g.beginPath()
      poly.forEach(([lo, la], i) => (i ? g.lineTo(px(lo), py(la)) : g.moveTo(px(lo), py(la))))
      g.closePath()
      g.fill()
      g.stroke()
    }
    g.fillStyle = '#b3122e'
    g.beginPath()
    g.arc(px(-72.9), py(41.3), 7, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#2b2e33'
    g.font = '24px Georgia, serif'
    g.fillText('New Haven', px(-72.9) + 12, py(41.3) - 10)
    g.font = 'italic 28px Georgia, serif'
    g.textAlign = 'center'
    g.fillText('Global Network for Advanced Management', W / 2, Hh - 22)
  }
  return tex(c)
}
