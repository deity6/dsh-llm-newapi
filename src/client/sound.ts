/**
 * Tiny synthesized UI sounds via WebAudio — no audio files, no assets.
 * Three delete-family cues: a downward blip for removals, an upward blip
 * for restore/undo, and a low thud for permanent (trash) deletions. All
 * calls are guarded: no AudioContext in jsdom / headless, autoplay policy
 * failures, or disabled prefs degrade to silence.
 *
 * @module dsh-llm-newapi/sound
 */

type SoundKind = 'remove' | 'restore' | 'trash'

let ctx: AudioContext | undefined
let enabled = true

/** Enable/disable from the settings page (default on). */
export function setSoundEnabled(value: boolean): void {
  enabled = value
}

function context(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined
  if (ctx === undefined) {
    try {
      ctx = new AudioContext()
    } catch {
      return undefined
    }
  }
  return ctx
}

/**
 * Play one cue. Called from user gestures (click/tap) so the context can be
 * created and resumed within the gesture.
 * @param kind - which cue to play.
 */
export function playSound(kind: SoundKind): void {
  if (!enabled) return
  const audio = context()
  if (audio === undefined) return
  try {
    if (audio.state === 'suspended') void audio.resume()
    const now = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.connect(gain)
    gain.connect(audio.destination)
    const config = kind === 'remove'
      ? { type: 'sine' as const, from: 520, to: 300, at: 0, dur: 0.12, vol: 0.06 }
      : kind === 'restore'
        ? { type: 'sine' as const, from: 380, to: 640, at: 0, dur: 0.14, vol: 0.06 }
        : { type: 'triangle' as const, from: 200, to: 90, at: 0, dur: 0.25, vol: 0.09 }
    osc.type = config.type
    osc.frequency.setValueAtTime(config.from, now + config.at)
    osc.frequency.exponentialRampToValueAtTime(config.to, now + config.at + config.dur)
    gain.gain.setValueAtTime(config.vol, now + config.at)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + config.at + config.dur)
    osc.start(now + config.at)
    osc.stop(now + config.at + config.dur + 0.02)
  } catch {
    // Autoplay policy or context teardown: silence is fine.
  }
}
