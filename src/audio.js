// The audio hooks Portal.jsx (Metaverse Web, copied unchanged) imports: both play through the
// world's own sound engine in interact/sound.js
import { sound } from './interact/sound.js'

export const fadeOut = (seconds) => sound.fadeOut(seconds)
export const whoosh = () => sound.whoosh()
