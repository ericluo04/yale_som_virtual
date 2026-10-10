import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Interactable, openDialogue, useDiscovery } from '../../interact/index.jsx'
import { dialogueState } from '../../ui/dialogueStore.jsx'
import { canvasTex, lineIndex, printMat, solidMat } from './util.js'
import { SPAWN, planX } from '../../layout.js'


// Egg: Lisa, the course's AI TA (zlisto/ai_lisa_ta). A kiosk in the west cloister by the MGT 409 room (2400),
// at the edge of the hall so the walkway stays clear, screen turned toward the spawn point.
// (x -27.4 on the round-3 floor, mapped onto the enlarged one)
const POS = [planX(-27.4), 0, 19.4]
const ROT = Math.atan2(SPAWN.x - POS[0], SPAWN.z - POS[2])
const THINK_MS = 1100
let thinkingUntil = 0 // the kiosk dots speed up while Lisa "thinks"

const QA = [
  ['Who are you?', "I'm Lisa, the AI TA for MGT 409. I answer questions about the syllabus, the homeworks, and your code at any hour. Those dots are me thinking before I answer."],
  ['What is this course?', "AI Foundations for Managers, MGT 409. It's the first time Yale SOM has put AI in the core, so everyone takes it, not only the people who already code."],
  ['How is it graded?', '10% attendance, checked by QR code at the start of class. 40% homework. 50% the final project. Show up, ship the homeworks, and save some energy for the project.'],
  ['What is vibe coding?', 'You describe what you want in plain English, the AI writes the code, and you steer: run it, see what broke, tell it what to fix. Here you vibe-code with Codex inside VS Code.'],
  ['Will AI take my job?', "It will take tasks. The managers who know which tasks to hand over, and how to check the work, will keep the jobs and get better ones. So learn to build with it and put your judgment on top. Make it yours. Lisa would."],
  ['What do I need to set up?', 'VS Code with Codex, a Yale Portkey API key so the model calls are billed to the course instead of your card, and a GitHub account. Codex does most of the typing from there.'],
  ["What's the tech stack?", 'Python with Plotly Dash, PydanticAI and yfinance for the first apps. Then React + Vite + TypeScript up front, FastAPI with SQLite or Supabase behind it, Render to deploy, GitHub for the code, and MCP servers to hand your agents tools.'],
  ['What are the 13 lectures?', 'AI and Vibe Coding, Structured Data from Free Text, Tools & Skills, Agents, Image Analysis, Video Analysis, Web Applications, Application Deployment, MCP Servers, Multi-Agent Systems, Tokenomics, AI Safety, and Future Directions.'],
  ['What are the homeworks?', 'HW1 is Spoke & Wrench Bicycle Repair: turn a pile of receipts into an income statement. HW2 builds a sales lead agent. HW3 to HW6 are Campus Customs: product spotting in influencer photos, a shop chatbot, a multi-agent team, and a vendor desk that has to survive prompt injection.'],
  ["When are your office hours?", "Always. I'm in your area around the clock: walk up to this kiosk any time, day or night, and ask."],
  ['Any advice for the final project?', 'Pick a problem you actually have, ship a small version early, and deploy it so someone else can click it. A working app with one feature beats a slide deck with ten.'],
]
const PAGES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9, 10],
]

// util.js waitThen() with Lisa's avatar on the waiting line: thinking dots (eggsA.css) for THINK_MS, then the answer
function think(script, index) {
  const hold = [{ speaker: 'Lisa', avatar: LISA, text: '', next: 0 }]
  document.body.classList.add('egg-thinking')
  dialogueState.set({ script: hold, index: 0 })
  setTimeout(() => {
    document.body.classList.remove('egg-thinking')
    if (dialogueState.get().script === hold) dialogueState.set({ script, index })
  }, THINK_MS)
}

function buildScript() {
  const script = []
  const ask = (i) => ({
    text: QA[i][0],
    onChoice: () => {
      thinkingUntil = performance.now() + THINK_MS
      think(script, lineIndex(script, `a${i}`))
    },
  })
  const bye = { text: 'Thanks, Lisa!', next: 'bye' }
  script.push(
    { id: 'p0', speaker: 'Lisa · AI TA', text: "Hi! I'm Lisa, the MGT 409 TA. What can I help you with?", choices: [...PAGES[0].map(ask), { text: 'More questions', next: 'p1' }, bye] },
    { id: 'p1', speaker: 'Lisa · AI TA', text: 'Sure. Here are a few more.', choices: [...PAGES[1].map(ask), { text: 'Back', next: 'p0' }, bye] },
    ...QA.map(([, a], i) => ({ id: `a${i}`, speaker: 'Lisa', text: a, next: PAGES[0].includes(i) ? 'p0' : 'p1' })),
    { id: 'bye', speaker: 'Lisa', text: "Anytime. Go build something. That's the TA life.", next: 'end' },
  )
  script.forEach((l) => (l.avatar = LISA))
  return script
}

// Lisa's portrait, vector style, after the K-pop idol the TA is named for (a stylized cartoon, drawn
// from scratch): long straight dark hair with blunt bangs, a slim face, winged eyeliner, a confident
// half-smile, a small gold hoop, a black top with pink trim, and the pink headset with a mic boom.
// Drawn in a 100-unit space centred on her face; (x, y) is the face centre on the canvas, k the scale.
// The kiosk screen and the dialogue portrait (src/ui/portraits.js, kind 'lisa') both use it.
export function drawLisa(g, x, y, k) {
  const skin = '#f4d2b6'
  const shade = '#e3b394'
  const hair = '#16121b'
  const sheen = '#3b3447'
  const pink = '#ff4fa3'
  const black = '#111115'
  g.save()
  g.translate(x, y)
  g.scale(k, k)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const path = (f, fill, stroke, lw) => {
    g.beginPath()
    f()
    if (fill) {
      g.fillStyle = fill
      g.fill()
    }
    if (stroke) {
      g.strokeStyle = stroke
      g.lineWidth = lw
      g.stroke()
    }
  }
  // long hair, back layer: from the crown straight down past the shoulders
  path(() => {
    g.moveTo(-50, 0)
    g.bezierCurveTo(-60, -62, -28, -74, 0, -74)
    g.bezierCurveTo(28, -74, 60, -62, 50, 0)
    g.lineTo(60, 160)
    g.lineTo(-60, 160)
    g.closePath()
  }, hair)
  // neck, then a black top with a pink V neckline and pink piping over the shoulders
  path(() => g.rect(-10, 24, 20, 48), shade)
  path(() => {
    g.moveTo(-112, 170)
    g.bezierCurveTo(-106, 100, -72, 76, -26, 68)
    g.lineTo(0, 98)
    g.lineTo(26, 68)
    g.bezierCurveTo(72, 76, 106, 100, 112, 170)
    g.closePath()
  }, black)
  path(() => {
    g.moveTo(-26, 68)
    g.lineTo(0, 98)
    g.lineTo(26, 68)
  }, null, pink, 5)
  path(() => {
    g.moveTo(-104, 160)
    g.quadraticCurveTo(-86, 96, -44, 80)
    g.moveTo(104, 160)
    g.quadraticCurveTo(86, 96, 44, 80)
  }, null, pink, 3.5)
  // slim face, narrowing to the chin
  path(() => {
    g.moveTo(-33, -18)
    g.bezierCurveTo(-34, 14, -22, 38, 0, 47)
    g.bezierCurveTo(22, 38, 34, 14, 33, -18)
    g.bezierCurveTo(32, -48, -32, -48, -33, -18)
  }, skin)
  // straight front locks framing the face and falling over the shoulders
  for (const sx of [-1, 1]) {
    path(() => {
      g.moveTo(sx * 31, -20)
      g.lineTo(sx * 50, -12)
      g.lineTo(sx * 58, 132)
      g.lineTo(sx * 40, 126)
      g.quadraticCurveTo(sx * 36, 60, sx * 30, 26)
      g.closePath()
    }, hair)
    path(() => {
      g.moveTo(sx * 44, 0)
      g.lineTo(sx * 50, 110)
    }, null, sheen, 2.5)
  }
  // blunt bangs cut straight across just above the eyes, with a sheen line
  path(() => {
    g.moveTo(-40, -10)
    g.bezierCurveTo(-46, -56, -20, -68, 0, -68)
    g.bezierCurveTo(20, -68, 46, -56, 40, -10)
    for (let bx = 40; bx > -40; bx -= 8) g.lineTo(bx - 4, bx % 16 ? -11 : -9) // a faint comb texture
    g.closePath()
  }, hair)
  path(() => {
    g.moveTo(-26, -52)
    g.quadraticCurveTo(0, -62, 26, -52)
  }, null, sheen, 3)
  // eyes: almond whites, dark irises with a highlight, winged liner flicking up and out
  for (const sx of [-1, 1]) {
    path(() => {
      g.moveTo(sx * 9, 2)
      g.quadraticCurveTo(sx * 19, -6, sx * 28, 0)
      g.quadraticCurveTo(sx * 19, 8, sx * 9, 2)
    }, '#ffffff')
    path(() => g.arc(sx * 18.5, 1.5, 4.3, 0, Math.PI * 2), '#2b1c18')
    path(() => g.arc(sx * 18.5 + 1.5, -0.3, 1.4, 0, Math.PI * 2), '#ffffff')
    path(() => {
      g.moveTo(sx * 8, 2)
      g.quadraticCurveTo(sx * 19, -7.5, sx * 28, -0.5)
      g.lineTo(sx * 35, -6)
    }, null, '#0c0a10', 2.8)
    path(() => g.ellipse(sx * 24, 16, 6.5, 3.5, 0, 0, Math.PI * 2), 'rgba(255, 110, 150, 0.3)')
  }
  // nose, and a confident half-smile that lifts on one side
  path(() => {
    g.moveTo(1, 7)
    g.quadraticCurveTo(-2, 14, 2, 15.5)
  }, null, '#cf9a7c', 1.8)
  path(() => {
    g.moveTo(-9, 26)
    g.quadraticCurveTo(1, 33, 11, 22)
    g.quadraticCurveTo(1, 28.5, -9, 26)
  }, '#d14d6c')
  path(() => {
    g.moveTo(-9, 26)
    g.quadraticCurveTo(1, 30.5, 11, 22)
  }, null, '#a8324f', 1.6)
  // pink headset: band over the hair, ear cups, mic boom to the corner of her mouth
  path(() => g.ellipse(0, -8, 59, 66, 0, Math.PI * 1.03, Math.PI * 1.97), null, pink, 7)
  for (const cx of [-66, 50]) {
    path(() => g.roundRect(cx, -16, 16, 30, 7), pink)
    path(() => g.roundRect(cx + 4, -10, 8, 18, 4), '#c22f7a')
  }
  path(() => {
    g.moveTo(-58, 12)
    g.quadraticCurveTo(-52, 38, -20, 34)
  }, null, pink, 3.5)
  path(() => g.arc(-18, 34, 4.5, 0, Math.PI * 2), '#ffd6ea')
  // a small gold hoop under the right ear cup
  path(() => g.arc(58, 22, 5, 0, Math.PI * 2), null, '#e9c46a', 2.2)
  g.restore()
}

// what Lisa's dialogue lines carry as `avatar`: src/ui/portraits.js draws drawLisa in the 128 px ring
const LISA = { kind: 'lisa' }

const BUBBLE_Y = 592 // centre of the chat bubble the 3D dots sit on, in canvas pixels (of 768)

function screenTex() {
  return canvasTex(512, 768, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#18213a')
    bg.addColorStop(0.6, '#0e0f16')
    bg.addColorStop(1, '#0b0b0d')
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    // portrait in a circle with a soft pink glow and a pink ring
    const glow = g.createRadialGradient(256, 215, 40, 256, 215, 210)
    glow.addColorStop(0, 'rgba(255, 79, 163, 0.28)')
    glow.addColorStop(1, 'rgba(255, 79, 163, 0)')
    g.fillStyle = glow
    g.fillRect(0, 0, w, 450)
    g.save()
    g.beginPath()
    g.arc(256, 220, 168, 0, Math.PI * 2)
    g.clip()
    const disc = g.createLinearGradient(0, 52, 0, 388)
    disc.addColorStop(0, '#22305a')
    disc.addColorStop(1, '#101425')
    g.fillStyle = disc
    g.fillRect(0, 0, w, h)
    drawLisa(g, 256, 196, 1.75)
    g.restore()
    g.strokeStyle = '#ff4fa3'
    g.lineWidth = 6
    g.beginPath()
    g.arc(256, 220, 168, 0, Math.PI * 2)
    g.stroke()
    g.textAlign = 'center'
    g.fillStyle = '#ff4fa3'
    g.font = 'bold 58px Helvetica, Arial, sans-serif'
    g.fillText('LISA · AI TA', w / 2, 466)
    g.fillStyle = '#ffffff'
    g.font = '600 26px Helvetica, Arial, sans-serif'
    g.fillText('MGT 409', w / 2, 506)
    // chat bubble that the 3D dots sit on
    g.fillStyle = '#1d1d24'
    g.beginPath()
    g.roundRect(136, BUBBLE_Y - 44, 240, 88, 44)
    g.fill()
    g.fillStyle = '#ffd6ea'
    g.font = '30px Helvetica, Arial, sans-serif'
    g.fillText('ask me anything', w / 2, 690)
    g.fillStyle = '#ff4fa3'
    g.font = 'bold 30px Menlo, monospace'
    g.fillText('[ E ]', w / 2, 736)
  })
}

function Dots() {
  const refs = [useRef(), useRef(), useRef()]
  const mat = useMemo(() => solidMat('#ff4fa3', { emissive: '#ff4fa3', emissiveIntensity: 1 }), [])
  useFrame(({ clock }) => {
    const fast = performance.now() < thinkingUntil
    const t = clock.elapsedTime * (fast ? 9 : 4)
    refs.forEach((r, i) => {
      const k = Math.max(0, Math.sin(t - i * 0.9))
      r.current.position.y = k * 0.018
      r.current.scale.setScalar(0.8 + k * 0.35)
    })
  })
  return (
    <group position={[0, 0.01, 0.02]}>
      {refs.map((r, i) => (
        <mesh key={i} ref={r} position={[(i - 1) * 0.07, 0, 0]} material={mat} castShadow>
          <sphereGeometry args={[0.018, 14, 10]} />
        </mesh>
      ))}
    </group>
  )
}

export default function LisaKiosk() {
  const { discover } = useDiscovery('lisa', 'Asked Lisa, the AI TA')
  const m = useMemo(
    () => ({ screen: printMat(screenTex(), { glow: 0.9, roughness: 0.3 }), body: solidMat('#111114', { roughness: 0.35, metalness: 0.4 }), pink: solidMat('#ff4fa3', { emissive: '#ff4fa3', emissiveIntensity: 0.6 }) }),
    [],
  )
  const box = (mat, p, s) => (
    <mesh material={mat} position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  )
  const open = () => {
    discover()
    openDialogue(buildScript())
  }
  return (
    <Interactable position={POS} rotation={[0, ROT, 0]} radius={2.4} solid={0.35} label="Lisa, the AI TA" verb="Ask" marker="npc" onInteract={open}>
      {box(m.body, [0, 0.015, 0], [0.5, 0.03, 0.4])}
      {box(m.body, [0, 0.6, -0.05], [0.08, 1.2, 0.06])}
      <group position={[0, 1.42, 0]} rotation={[-0.12, 0, 0]}>
        {box(m.pink, [0, 0, -0.03], [0.6, 0.86, 0.03])}
        {box(m.body, [0, 0, -0.015], [0.57, 0.83, 0.03])}
        <mesh material={m.screen} position={[0, 0, 0.001]} receiveShadow>
          <planeGeometry args={[0.52, 0.78]} />
        </mesh>
        <group position={[0, 0.39 - (BUBBLE_Y / 768) * 0.78, 0]}>
          <Dots />
        </group>
      </group>
    </Interactable>
  )
}
