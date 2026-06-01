/**
 * callSounds.ts — in-call sound effect layer.
 *
 * Audio objects are pre-allocated at module init so first-play latency is
 * negligible. currentTime is reset on every call so rapid re-triggers never
 * wait for the previous play to finish.
 *
 * Variant rationale:
 *   join_call  → E_minimal_pulse  (only variant that ships this event)
 *   leave_call → D_warm_ceramic   (only variant that ships this event)
 *   mute / unmute / deafen / undeafen → C_soft_mechanical (clean, product-like)
 */

export type CallSoundEvent =
  | 'join_call'
  | 'leave_call'
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen';

const FILES: Record<CallSoundEvent, string> = {
  join_call:  '/sounds/recline_E_minimal_pulse_join_call.wav',
  leave_call: '/sounds/recline_D_warm_ceramic_leave_call.wav',
  mute:       '/sounds/recline_C_soft_mechanical_mute.wav',
  unmute:     '/sounds/recline_C_soft_mechanical_unmute.wav',
  deafen:     '/sounds/recline_C_soft_mechanical_deafen.wav',
  undeafen:   '/sounds/recline_C_soft_mechanical_undeafen.wav',
};

export const CALL_SOUND_VOLUME = 0.5;

const _pool: Partial<Record<CallSoundEvent, HTMLAudioElement>> = {};

function acquire(ev: CallSoundEvent): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!_pool[ev]) {
    const el = new Audio(FILES[ev]);
    el.volume = CALL_SOUND_VOLUME;
    el.preload = 'auto';
    _pool[ev] = el;
  }
  return _pool[ev]!;
}

// Pre-warm all six sounds at module load — avoids first-play decode stutter.
if (typeof window !== 'undefined') {
  for (const ev of Object.keys(FILES) as CallSoundEvent[]) acquire(ev);
}

/**
 * Fire a call sound. Silently ignored if the browser's autoplay policy
 * hasn't been unlocked yet (i.e., before the first user gesture).
 */
export function playCallSound(ev: CallSoundEvent): void {
  const el = acquire(ev);
  if (!el) return;
  el.currentTime = 0;
  el.play().catch(() => { /* autoplay policy — no-op until first gesture */ });
}
