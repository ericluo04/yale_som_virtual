import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Interactable, openDialogue, useDiscovery } from '../../interact/index.jsx'
import { canvasTex, lineIndex, printMat, solidMat, waitThen } from './util.js'

// Egg: Lisa, the course's AI TA (zlisto/ai_lisa_ta). A kiosk in the west cloister by the MGT 409 room (2400),
// at the edge of the hall so the walkway stays clear, screen turned toward the spawn point.
const POS = [-27.4, 0, 19.4]
const ROT = Math.atan2(-24.4 - POS[0], 22 - POS[2])
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
  ['Any advice for the final project?', 'Pick a problem you actually have, ship a small version early, and deploy it so someone else can click it. A working app with one feature beats a slide deck with ten.'],
]
const PAGES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
]

function buildScript() {
  const script = []
  const ask = (i) => ({
    text: QA[i][0],
    onChoice: () => {
      thinkingUntil = performance.now() + THINK_MS
      waitThen(THINK_MS, { speaker: 'Lisa' }, script, lineIndex(script, `a${i}`))
    },
  })
  const bye = { text: 'Thanks, Lisa!', next: 'bye' }
  script.push(
    { id: 'p0', speaker: 'Lisa · AI TA', text: "Hi! I'm Lisa, the MGT 409 TA. What can I help you with?", choices: [...PAGES[0].map(ask), { text: 'More questions', next: 'p1' }, bye] },
    { id: 'p1', speaker: 'Lisa · AI TA', text: 'Sure. Here are a few more.', choices: [...PAGES[1].map(ask), { text: 'Back', next: 'p0' }, bye] },
    ...QA.map(([, a], i) => ({ id: `a${i}`, speaker: 'Lisa', text: a, next: PAGES[0].includes(i) ? 'p0' : 'p1' })),
    { id: 'bye', speaker: 'Lisa', text: 'Anytime. Go build something.', next: 'end' },
  )
  return script
}

function screenTex() {
  return canvasTex(512, 768, (g, w, h) => {
    g.fillStyle = '#0b0b0d'
    g.fillRect(0, 0, w, h)
    g.textAlign = 'center'
    g.fillStyle = '#ff4fa3'
    g.font = 'bold 120px Helvetica, Arial, sans-serif'
    g.fillText('LISA', w / 2, 210)
    g.fillStyle = '#ffffff'
    g.font = '600 44px Helvetica, Arial, sans-serif'
    g.fillText('·  AI TA  ·', w / 2, 280)
    g.fillStyle = '#9fb6d6'
    g.font = '30px Menlo, monospace'
    g.fillText('MGT 409', w / 2, 340)
    // chat bubble that the 3D dots sit on
    g.fillStyle = '#1d1d24'
    g.beginPath()
    g.roundRect(96, 420, 320, 120, 60)
    g.fill()
    g.fillStyle = '#ffd6ea'
    g.font = '30px Helvetica, Arial, sans-serif'
    g.fillText('ask me anything', w / 2, 650)
    g.fillStyle = '#ff4fa3'
    g.font = 'bold 30px Menlo, monospace'
    g.fillText('[ E ]', w / 2, 700)
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
        {/* bubble centre on the canvas is (256, 480) of 512 x 768 */}
        <group position={[0, 0.39 - (480 / 768) * 0.78, 0]}>
          <Dots />
        </group>
      </group>
    </Interactable>
  )
}
