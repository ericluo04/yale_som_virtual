// Public API for easter eggs. Import from 'src/interact' (or '../interact/index.jsx').
export { useInteractable, interact, interactState } from './registry.js'
export { Interactable, InteractLoop } from './Interactable.jsx'
export { sound, soundState } from './sound.js'
export { ui } from './store.js'
export { openDialogue, closeDialogue, useDialogue, DialogueProvider } from '../ui/dialogueStore.jsx'
export { toast } from '../ui/toast.js'
export { useHudItem, setHudItem, removeHudItem, useCounter, Counter } from '../ui/hudSlots.jsx'
export { useDiscoveries, useDiscovery, discover, CATALOG } from '../ui/discoveries.js'

import { InteractLoop } from './Interactable.jsx'
import { SoundLoop } from './SoundLoop.jsx'
import DemoSign from './DemoSign.jsx'

// Mount once inside <Canvas>: the interact scan, sound, and the demo sign.
export function InteractScene() {
  return (
    <>
      <InteractLoop />
      <SoundLoop />
      <DemoSign />
    </>
  )
}
