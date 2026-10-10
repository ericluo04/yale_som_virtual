import { useEffect } from 'react'
import { createStore, useStore } from '../interact/store.js'
import { toast } from './toast.js'

// The easter-egg catalog. Add one line per egg: id -> the title shown in the toast.
// N in "discoveries X / N" is the size of this catalog plus any id registered at runtime.
export const CATALOG = {}

const LS = 'evans.discoveries.v1'
const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LS) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const save = (found) => {
  try {
    localStorage.setItem(LS, JSON.stringify(found))
  } catch {
    // storage blocked: progress lasts for this visit only
  }
}

export const discoveryState = createStore({ found: load(), catalog: { ...CATALOG } })

const total = (s) => Object.keys(s.catalog).length

// Mark an egg found. Returns false if it was already found. Plays the chime and shows a toast.
export function discover(id, title) {
  const s = discoveryState.get()
  if (!s.catalog[id]) discoveryState.set({ catalog: { ...s.catalog, [id]: title ?? id } })
  if (s.found.includes(id)) return false
  const found = [...s.found, id]
  discoveryState.set({ found })
  save(found)
  const t = discoveryState.get()
  toast(title ?? t.catalog[id], { title: `Discovery ${found.length} / ${total(t)}`, kind: 'discovery', ms: 4500 })
  return true
}

export function resetDiscoveries() {
  discoveryState.set({ found: [] })
  save([])
}

// All discoveries: { found: string[], count, total, has(id), discover(id, title?), reset() }
export function useDiscoveries() {
  const s = useStore(discoveryState)
  return {
    found: s.found,
    count: s.found.length,
    total: total(s),
    has: (id) => s.found.includes(id),
    discover,
    reset: resetDiscoveries,
  }
}

// One egg: registers id in the catalog (so it counts toward N) and returns { found, discover }.
export function useDiscovery(id, title) {
  useEffect(() => {
    const s = discoveryState.get()
    if (!s.catalog[id] || (title && s.catalog[id] !== title)) discoveryState.set({ catalog: { ...s.catalog, [id]: title ?? id } })
  }, [id, title])
  const found = useStore(discoveryState, (s) => s.found.includes(id))
  return { found, discover: () => discover(id, title) }
}
