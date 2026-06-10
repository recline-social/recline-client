import { useEffect, useRef, useState, useCallback } from 'react';
import type { FileAttachment, Member } from '../types';
import { api } from '../lib/api';
import { EmojiPicker } from './EmojiPickerLazy';

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

// Accepted MIME types for chat file attachments
const ACCEPTED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/x-flac',
  'application/pdf',
  'text/plain', 'text/markdown',
  'application/zip', 'application/x-zip-compressed',
].join(',');

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB — same as server limit

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  placeholder: string;
  disabled?: boolean;
  onSend: (text: string, animationType?: AnimationType, attachment?: FileAttachment) => Promise<void> | void;
  onTyping: () => void;
  replyingTo?: ReplyingTo | null;
  onCancelReply?: () => void;
  members?: Record<string, Member>;
  sparksBalance?: number;
  /** File dropped on the parent ChatPanel — triggers upload automatically */
  externalDroppedFile?: File | null;
  onExternalDropConsumed?: () => void;
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

export function Composer({ placeholder, disabled, onSend, onTyping, replyingTo, onCancelReply, members, sparksBalance, externalDroppedFile, onExternalDropConsumed }: Props) {
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

  // ── File attachment state ──────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile]       = useState<File | null>(null);
  // Local object URL of the original (plaintext) file — the server-side URL now
  // holds ciphertext (E2EF-001), so previews must come from the local File.
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [uploadPct, setUploadPct]           = useState<number>(0);
  const [uploadDone, setUploadDone]         = useState(false);
  const [uploadError, setUploadError]       = useState<string | null>(null);
  const [attachment, setAttachment]         = useState<FileAttachment | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Local drag-over state for composer-box highlight (secondary to ChatPanel overlay)
  const localDragCounterRef = useRef(0);
  const [localDragOver, setLocalDragOver] = useState(false);

  // wasSent=true when called after a successful send — the file is now in a message
  // so we must NOT delete it from the server. For every other path (user clicks ✕,
  // switches channel, navigates away) the file is orphaned and should be removed.
  function clearFile(wasSent = false) {
    if (!wasSent && attachment) {
      // Upload completed but the message was never sent — clean up the server file.
      // Fire-and-forget: 409 means it was already used (race), which is fine.
      api.deleteUpload(attachment.url).catch(() => {});
    }
    xhrRef.current?.abort();
    xhrRef.current = null;
    setPendingFile(null);
    setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setUploadPct(0);
    setUploadDone(false);
    setUploadError(null);
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Single upload entry-point — used by picker, local drop, and external panel drop
  const startUpload = useCallback((file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setSendError(`File too large — max 200 MB (your file is ${fmtBytes(file.size)})`);
      return;
    }
    xhrRef.current?.abort();
    setPendingFile(file);
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });
    setUploadPct(0);
    setUploadDone(false);
    setUploadError(null);
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    api.uploadFile(file, (pct) => setUploadPct(pct))
      .then((att) => {
        setAttachment({ url: att.url, name: att.name, size: att.size, type: att.type });
        setUploadDone(true);
        xhrRef.current = null;
      })
      .catch((err: Error) => { setUploadError(err.message); xhrRef.current = null; });
  }, []);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    startUpload(file);
  }

  // Drag directly onto the composer box (fallback / secondary path)
  function handleComposerDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    localDragCounterRef.current = 0;
    setLocalDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) startUpload(file);
  }

  // External file dropped on the parent ChatPanel — consume it
  useEffect(() => {
    if (externalDroppedFile) {
      startUpload(externalDroppedFile);
      onExternalDropConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDroppedFile]);

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

  // Close animation picker on outside click
  useEffect(() => {
    if (!animPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (animPickerRef.current && !animPickerRef.current.contains(e.target as Node)) {
        setAnimPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [animPickerOpen]);

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
    const hasAttachment = !!pendingFile;
    if (!text && !hasAttachment) return;
    if (disabled) return;
    setSendError(null);

    // If upload is still in progress, wait for it (or show error)
    if (pendingFile && !uploadDone && !uploadError) {
      setSendError('Still uploading — wait a moment then try again');
      return;
    }
    if (uploadError) {
      setSendError(`Upload failed: ${uploadError}`);
      return;
    }

    // Detect inline free-animation tag prefix (e.g. ~wave~ Hello)
    let animationType: AnimationType | undefined = selectedAnim ?? undefined;
    if (!animationType && text) {
      const tagged = detectAnimationTag(text);
      if (tagged) {
        text = tagged.text.trim();
        if (!text && !hasAttachment) return;
        animationType = tagged.animationType;
      }
    }

    try {
      await onSend(text || '​', animationType ?? undefined, attachment ?? undefined);
      setValue('');
      setMentionQuery(null);
      setSelectedAnim(null);
      setAnimPickerOpen(false);
      clearFile(true); // file was sent — don't delete from server
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
    if (e.key === 'Escape') setAnimPickerOpen(false);
    if (e.key === 'Escape' && replyingTo) onCancelReply?.();
  }

  return (
    <div
      className="px-3 md:px-5 pt-1 shrink-0"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        onChange={handleFilePick}
      />
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

      {/* File preview card */}
      {pendingFile && (
        <div className="mb-1.5 rounded-xl bg-ink-800/70 border border-white/[0.06] overflow-hidden">
          {/* Image preview — from the local file, not the server (which holds ciphertext) */}
          {previewUrl && (
            <img
              src={previewUrl}
              alt={pendingFile.name}
              className="w-full max-h-48 object-contain bg-black/30"
            />
          )}
          <div className="flex items-center gap-2.5 px-3 py-2">
            {/* File type icon */}
            <div className="w-8 h-8 rounded-lg bg-ink-700 shrink-0 flex items-center justify-center text-[18px]">
              {pendingFile.type.startsWith('image/') ? '🖼️'
               : pendingFile.type.startsWith('video/') ? '🎬'
               : pendingFile.type.startsWith('audio/') ? '🎵'
               : pendingFile.type === 'application/pdf' ? '📄'
               : pendingFile.type.includes('zip') ? '🗜️'
               : '📎'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-ink-100 truncate">{pendingFile.name}</p>
              <p className="text-[10px] text-ink-400">{fmtBytes(pendingFile.size)}</p>
              {/* Progress bar */}
              {!uploadDone && !uploadError && (
                <div className="mt-1 h-1 rounded-full bg-ink-700 overflow-hidden">
                  <div
                    className="h-full bg-accent-violet transition-all duration-200 rounded-full"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              )}
              {uploadDone && (
                <p className="text-[10px] text-emerald-400 mt-0.5">✓ Ready to send</p>
              )}
              {uploadError && (
                <p className="text-[10px] text-rose-400 mt-0.5">✕ {uploadError}</p>
              )}
            </div>
            <button
              onClick={() => clearFile()}
              className="shrink-0 text-ink-400 hover:text-rose-300 transition-colors"
              title="Remove file"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
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

        <div
          className={`panel-inner rounded-2xl px-3 py-2 flex items-end gap-2 transition-shadow ${
            localDragOver
              ? 'ring-2 ring-accent-violet/60 focus-within:ring-accent-violet/60'
              : 'focus-within:ring-2 focus-within:ring-accent-violet/30'
          }`}
          onDragEnter={(e) => { e.preventDefault(); localDragCounterRef.current++; setLocalDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); if (--localDragCounterRef.current === 0) setLocalDragOver(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleComposerDrop}
        >
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
          {/* Paperclip — file attachment */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            title="Attach file (max 200 MB)"
            aria-label="Attach file"
            className={`shrink-0 h-[36px] w-[36px] grid place-items-center rounded-xl border transition-colors
              ${pendingFile
                ? 'bg-accent-violet/20 border-accent-violet/40 text-accent-violet'
                : 'bg-ink-700/60 border-white/[0.06] text-ink-300 hover:text-ink-100 hover:bg-ink-700/80'
              }
              disabled:opacity-40 disabled:pointer-events-none`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

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
