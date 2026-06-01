import { useEffect, useRef, useState } from 'react';
import type { Member } from '../types';
import { EmojiPicker } from './EmojiPicker';

export type ReplyingTo = {
  id: string;
  senderName: string;
  bodyPreview: string;
};

// ── Animation types ──────────────────────────────────────────────────────────
export type AnimationType =
  | 'wave' | 'shake' | 'bounce' | 'slide'
  | 'rainbow' | 'neon' | 'glitch' | 'fireworks' | 'confetti' | 'matrix' | 'shatter'
  | 'spin' | 'big' | 'think' | 'fade' | 'drop' | 'pop' | 'flip' | 'pulse' | 'zigzag' | 'ghost' | 'zoom' | 'rush'
  | 'lightning' | 'neonSign' | 'hologram' | 'aurora' | 'inferno' | 'vortex' | 'iceStorm' | 'shockwave' | 'thunderstrike' | 'singularity' | 'supernova' | 'plasma';

export const FREE_ANIMATIONS: AnimationType[] = ['wave', 'shake', 'bounce', 'slide', 'spin', 'big', 'think', 'fade', 'drop', 'pop', 'flip', 'pulse', 'zigzag', 'ghost', 'zoom', 'rush'];
export const PAID_ANIMATIONS: AnimationType[] = ['rainbow', 'neon', 'glitch', 'fireworks', 'confetti', 'matrix', 'shatter', 'lightning', 'neonSign', 'hologram', 'aurora', 'inferno', 'vortex', 'iceStorm', 'shockwave', 'thunderstrike', 'singularity', 'supernova', 'plasma'];
export const PAID_COSTS: Record<string, number> = {
  rainbow: 5, neon: 5, glitch: 6, fireworks: 8, matrix: 8, confetti: 10, shatter: 12,
  lightning: 8, neonSign: 5, hologram: 7, aurora: 5,
  inferno: 12, vortex: 10, iceStorm: 12, shockwave: 10,
  thunderstrike: 25, singularity: 20, supernova: 30, plasma: 25,
};

// Inline syntax tags that prefix the message text
const ANIM_TAG_MAP: { re: RegExp; type: AnimationType }[] = [
  { re: /^~wave~\s*/,   type: 'wave'   },
  { re: /^\*shake\*\s*/, type: 'shake'  },
  { re: /^\^bounce\^\s*/, type: 'bounce' },
  { re: /^>slide<\s*/,  type: 'slide'  },
  { re: /^\+spin\+\s*/,   type: 'spin'   },
  { re: /^!big!\s*/,      type: 'big'    },
  { re: /^\?think\?\s*/,  type: 'think'  },
  { re: /^-fade-\s*/,     type: 'fade'   },
  { re: /^_drop_\s*/,     type: 'drop'   },
  { re: /^#pop#\s*/,      type: 'pop'    },
  { re: /^@flip@\s*/,     type: 'flip'   },
  { re: /^%pulse%\s*/,    type: 'pulse'  },
  { re: /^&zigzag&\s*/,   type: 'zigzag' },
  { re: /^=ghost=\s*/,    type: 'ghost'  },
  { re: /^<zoom<\s*/,     type: 'zoom'   },
  { re: /^>>fast>>\s*/,   type: 'rush'   },
];

/** Detect a free animation tag prefix and return the stripped text + type, or null. */
export function detectAnimationTag(text: string): { text: string; animationType: AnimationType } | null {
  for (const { re, type } of ANIM_TAG_MAP) {
    if (re.test(text)) {
      return { text: text.replace(re, ''), animationType: type };
    }
  }
  return null;
}

type Props = {
  placeholder: string;
  disabled?: boolean;
  onSend: (text: string, animationType?: AnimationType) => Promise<void> | void;
  onTyping: () => void;
  replyingTo?: ReplyingTo | null;
  onCancelReply?: () => void;
  members?: Record<string, Member>;
  sparksBalance?: number;
};

// Detect an in-progress @mention at the cursor: returns the query string after @, or null.
function getMentionQuery(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const match = /@([\w\s]*)$/.exec(before);
  if (!match) return null;
  // Don't trigger if there's a completed mention token just before cursor
  const start = match.index;
  return { query: match[1], start };
}

export function Composer({ placeholder, disabled, onSend, onTyping, replyingTo, onCancelReply, members, sparksBalance }: Props) {
  const [value, setValue] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [animPickerOpen, setAnimPickerOpen] = useState(false);
  const [selectedAnim, setSelectedAnim] = useState<AnimationType | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingThrottle = useRef<number | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);
  const animPickerRef = useRef<HTMLDivElement>(null);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Build sorted member list for autocomplete
  const memberList = members ? Object.values(members) : [];

  // Filter members by query
  const mentionMatches = mentionQuery
    ? memberList
        .filter((m) => {
          const q = mentionQuery.query.toLowerCase();
          return (
            m.displayName.toLowerCase().includes(q) ||
            m.username.toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  // Focus the textarea when a reply is set
  useEffect(() => {
    if (replyingTo && taRef.current) taRef.current.focus();
  }, [replyingTo?.id]);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  // Reset mention index when matches change
  useEffect(() => { setMentionIndex(0); }, [mentionMatches.length]);

  function emitTyping() {
    if (typingThrottle.current && Date.now() - typingThrottle.current < 3000) return;
    typingThrottle.current = Date.now();
    onTyping();
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    emitTyping();
    const cursor = e.target.selectionStart ?? v.length;
    const mq = getMentionQuery(v, cursor);
    setMentionQuery(mq);
  }

  function insertMention(member: Member) {
    if (!mentionQuery || !taRef.current) return;
    const cursor = taRef.current.selectionStart ?? value.length;
    const before = value.slice(0, mentionQuery.start);
    const after = value.slice(cursor);
    const token = `@[${member.displayName}](${member.id}) `;
    const next = before + token + after;
    setValue(next);
    setMentionQuery(null);
    // Move cursor to end of inserted token
    requestAnimationFrame(() => {
      if (taRef.current) {
        const pos = before.length + token.length;
        taRef.current.setSelectionRange(pos, pos);
        taRef.current.focus();
      }
    });
  }

  function insertEmoji(emoji: string) {
    const ta = taRef.current;
    if (!ta) {
      setValue((v) => v + emoji);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    // Restore cursor position after the inserted emoji
    requestAnimationFrame(() => {
      if (taRef.current) {
        const pos = start + emoji.length;
        taRef.current.setSelectionRange(pos, pos);
        taRef.current.focus();
      }
    });
  }

  async function submit() {
    let text = value.trim();
    if (!text || disabled) return;
    setSendError(null);

    // Detect inline free-animation tag prefix (e.g. ~wave~ Hello)
    let animationType: AnimationType | undefined = selectedAnim ?? undefined;
    if (!animationType) {
      const tagged = detectAnimationTag(text);
      if (tagged) {
        text = tagged.text.trim();
        if (!text) return; // tag with no body — don't send
        animationType = tagged.animationType;
      }
    }

    try {
      await onSend(text, animationType ?? undefined);
      setValue('');
      setMentionQuery(null);
      setSelectedAnim(null);
      setAnimPickerOpen(false);
    } catch (err: any) {
      setSendError(err?.message ?? 'Failed to send — press Enter to retry');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Mention popup navigation
    if (mentionQuery && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && replyingTo) onCancelReply?.();
  }

  return (
    <div
      className="px-3 md:px-5 pt-1 shrink-0"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
    >
      {/* Reply preview bar */}
      {replyingTo && (
        <div className="mb-1.5 flex items-center gap-2 rounded-xl bg-ink-800/70 border border-white/[0.06] px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-violet shrink-0">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
          <span className="text-[11px] text-ink-300 shrink-0">Replying to</span>
          <span className="text-[11px] font-semibold text-accent-violet shrink-0">{replyingTo.senderName}</span>
          <span className="text-[11px] text-ink-400 truncate flex-1">{replyingTo.bodyPreview}</span>
          <button onClick={onCancelReply} className="shrink-0 text-ink-400 hover:text-ink-200 transition-colors ml-1" aria-label="Cancel reply">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* @mention autocomplete popup */}
      {mentionQuery && mentionMatches.length > 0 && (
        <div className="mb-1.5 rounded-xl bg-ink-900 border border-white/[0.08] shadow-2xl overflow-hidden">
          {mentionMatches.map((m, i) => (
            <button
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === mentionIndex ? 'bg-accent-violet/20 text-ink-100' : 'text-ink-200 hover:bg-white/[0.04]'
              }`}
            >
              {/* Avatar */}
              <div className="w-6 h-6 rounded-full bg-ink-700 shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-ink-300">
                {m.avatarUrl
                  ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : m.displayName.slice(0, 1).toUpperCase()
                }
              </div>
              <span className="text-[13px] font-medium">{m.displayName}</span>
              {m.username !== m.displayName && (
                <span className="text-[11px] text-ink-400 ml-auto">@{m.username}</span>
              )}
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-white/[0.05] text-[10px] text-ink-500">
            ↑↓ navigate · Enter/Tab to select · Esc to dismiss
          </div>
        </div>
      )}

      <div className="relative">
        {/* Emoji picker popover */}
        {emojiOpen && (
          <div
            ref={emojiWrapRef}
            className="absolute bottom-full mb-2 right-0 z-50"
          >
            <EmojiPicker
              onSelect={insertEmoji}
              onClose={() => setEmojiOpen(false)}
            />
          </div>
        )}

        <div className="panel-inner rounded-2xl px-3 py-2 flex items-end gap-2 focus-within:ring-2 focus-within:ring-accent-violet/30 transition-shadow">
          <textarea
            ref={taRef}
            value={value}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? 'Unlock this space to send messages' : placeholder}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent resize-none outline-none text-ink-100 placeholder:text-ink-300/50 py-1.5 min-h-[36px]"
            style={{ fontSize: '16px' }}
          />
          {/* Animation picker button */}
          <div className="relative shrink-0" ref={animPickerRef}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => { setAnimPickerOpen((o) => !o); setEmojiOpen(false); }}
              title="Animated message"
              aria-label="Animated message"
              className={`h-[36px] w-[36px] grid place-items-center rounded-xl border transition-colors text-[15px]
                ${animPickerOpen || selectedAnim
                  ? 'bg-accent-violet/20 border-accent-violet/40 text-accent-violet'
                  : 'bg-ink-700/60 border-white/[0.06] text-ink-300 hover:text-ink-100 hover:bg-ink-700/80'
                }
                disabled:opacity-40 disabled:pointer-events-none`}
            >
              ✨
            </button>
            {animPickerOpen && (
              <div className="absolute bottom-full mb-2 right-0 z-50 w-72 rounded-2xl bg-ink-900 border border-white/[0.08] shadow-2xl p-3">
                <div className="text-[11px] text-ink-400 font-semibold uppercase tracking-wider mb-2 px-0.5">Free animations</div>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {FREE_ANIMATIONS.map((anim) => (
                    <button
                      key={anim}
                      type="button"
                      onClick={() => {
                        setSelectedAnim(selectedAnim === anim ? null : anim);
                        setAnimPickerOpen(false);
                      }}
                      className={`rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-all capitalize border
                        ${selectedAnim === anim
                          ? 'bg-accent-violet/25 border-accent-violet/50 text-accent-violet'
                          : 'bg-ink-800/60 border-white/[0.06] text-ink-200 hover:bg-ink-700/60 hover:text-ink-100'
                        }`}
                    >
                      {anim}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-ink-400 font-semibold uppercase tracking-wider mb-2 px-0.5">
                  Paid animations
                  {sparksBalance !== undefined && (
                    <span className="ml-1.5 text-amber-400 font-semibold normal-case">✦ {sparksBalance}</span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {PAID_ANIMATIONS.map((anim) => {
                    const cost = PAID_COSTS[anim];
                    const canAfford = sparksBalance === undefined || sparksBalance >= cost;
                    return (
                      <button
                        key={anim}
                        type="button"
                        disabled={!canAfford}
                        onClick={() => {
                          setSelectedAnim(selectedAnim === anim ? null : anim);
                          setAnimPickerOpen(false);
                        }}
                        title={`${cost} sparks`}
                        className={`rounded-lg px-1 py-1.5 text-[10px] font-medium transition-all capitalize border flex flex-col items-center gap-0.5
                          ${selectedAnim === anim
                            ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                            : canAfford
                              ? 'bg-ink-800/60 border-white/[0.06] text-ink-200 hover:bg-ink-700/60 hover:text-ink-100'
                              : 'bg-ink-800/30 border-white/[0.03] text-ink-500 cursor-not-allowed'
                          }`}
                      >
                        <span>{anim}</span>
                        <span className="text-amber-400/70 text-[9px]">✦{cost}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedAnim && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-accent-violet/10 border border-accent-violet/20 px-2.5 py-1.5">
                    <span className="text-[11px] text-accent-violet font-medium">
                      {selectedAnim} animation selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedAnim(null)}
                      className="text-[10px] text-ink-400 hover:text-ink-200 transition-colors ml-2"
                    >
                      clear
                    </button>
                  </div>
                )}
                <div className="mt-2.5 pt-2 border-t border-white/[0.05] text-[10px] text-ink-500 leading-relaxed">
                  Free: ~wave~ shake ^bounce^ &gt;slide&lt; · Type syntax or pick above
                </div>
              </div>
            )}
          </div>
          {/* Emoji button */}
          <button
            ref={emojiButtonRef}
            type="button"
            disabled={disabled}
            onClick={() => { setEmojiOpen((o) => !o); setAnimPickerOpen(false); }}
            title="Insert emoji"
            aria-label="Insert emoji"
            className={`shrink-0 h-[36px] w-[36px] grid place-items-center rounded-xl border transition-colors
              ${emojiOpen
                ? 'bg-accent-violet/20 border-accent-violet/40 text-accent-violet'
                : 'bg-ink-700/60 border-white/[0.06] text-ink-300 hover:text-ink-100 hover:bg-ink-700/80'
              }
              disabled:opacity-40 disabled:pointer-events-none`}
          >
            {/* Smile SVG icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="btn-primary !rounded-xl !px-3 !py-2 disabled:!bg-ink-700 disabled:!shadow-none shrink-0 min-h-[36px] min-w-[36px]"
            title="Send (Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {sendError ? (
        <div className="mt-1 px-1 text-[11px] text-rose-400 flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {sendError}
        </div>
      ) : (
        <div className="mt-1 px-1 text-[11px] text-ink-300/60 hidden md:block">
          {disabled ? 'Unlock this space to send messages.' : 'Messages are encrypted in your browser. The server only sees ciphertext.'}
        </div>
      )}
    </div>
  );
}
