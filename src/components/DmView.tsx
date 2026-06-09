import { useLayoutEffect, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import { MarkdownContent } from './MarkdownContent';
import { EmojiPicker } from './EmojiPicker';
import { userColor } from '../lib/colors';
import type { DmChannel, DmMessage, DmCallState, User } from '../types';
import { api } from '../lib/api';

// ── URL safety guard — prevents javascript: and data: URIs from server-supplied URLs ──
// Server returns relative /uploads/ paths; these are safe (no XSS vector) and must be
// allowed through so img/video/audio src and anchor href resolve correctly in the browser.
function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  // Relative /uploads/ paths are server-stored files — safe to use directly
  if (url.startsWith('/uploads/')) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDayTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;
  if (isYest) return `Yesterday at ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function fmtDuration(startedAt: number | null): string {
  if (!startedAt) return '0:00';
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string | null | undefined): string {
  if (!type) return '📎';
  if (type.startsWith('image/')) return '🖼';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type === 'application/pdf') return '📄';
  if (type.includes('zip') || type.includes('archive')) return '🗜';
  return '📎';
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '✅'];
const GROUP_GAP_MS = 5 * 60 * 1000; // 5 min — same sender within this window = no header

// ── File attachment ───────────────────────────────────────────────────────────
function FileAttachmentView({ fileUrl, fileName, fileSize, fileType }: {
  fileUrl: string;
  fileName: string | null | undefined;
  fileSize: number | null | undefined;
  fileType: string | null | undefined;
}) {
  const isImage = fileType?.startsWith('image/');
  const isVideo = fileType?.startsWith('video/');
  const isAudio = fileType?.startsWith('audio/');

  if (isImage) {
    return (
      <a href={isSafeUrl(fileUrl) ? fileUrl : '#'} target="_blank" rel="noopener noreferrer"
        className="block mt-1.5 rounded-xl overflow-hidden max-w-sm border border-white/[0.06] hover:border-white/10 transition-colors">
        <img src={isSafeUrl(fileUrl) ? fileUrl : undefined} alt={fileName ?? 'image'}
          className="w-full max-h-64 object-contain bg-black/20" loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div className="px-2.5 py-1.5 bg-ink-800/60 flex items-center gap-2">
          <span className="text-[11px] text-ink-300 truncate flex-1">{fileName}</span>
          {fileSize && <span className="text-[10px] text-ink-500 shrink-0">{fmtBytes(fileSize)}</span>}
        </div>
      </a>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-1.5 rounded-xl overflow-hidden max-w-sm border border-white/[0.06]">
        <video src={isSafeUrl(fileUrl) ? fileUrl : undefined} controls preload="metadata" className="w-full max-h-64 bg-black" style={{ display: 'block' }} />
        <div className="px-2.5 py-1.5 bg-ink-800/60 flex items-center gap-2">
          <span className="text-[11px] text-ink-300 truncate flex-1">{fileName}</span>
          {fileSize && <span className="text-[10px] text-ink-500 shrink-0">{fmtBytes(fileSize)}</span>}
        </div>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="mt-1.5 rounded-xl overflow-hidden max-w-sm border border-white/[0.06] bg-ink-800/60 px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🎵</span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-100 truncate">{fileName ?? 'Audio'}</p>
            {fileSize && <p className="text-[10px] text-ink-400">{fmtBytes(fileSize)}</p>}
          </div>
        </div>
        <audio src={isSafeUrl(fileUrl) ? fileUrl : undefined} controls preload="metadata" className="w-full h-8" style={{ display: 'block' }} />
      </div>
    );
  }

  return (
    <a href={isSafeUrl(fileUrl) ? fileUrl : '#'} target="_blank" rel="noopener noreferrer"
      className="mt-1.5 flex items-center gap-3 max-w-sm rounded-xl border border-white/[0.06] bg-ink-800/60 px-3 py-2.5 hover:bg-ink-700/60 hover:border-white/10 transition-colors">
      <span className="text-2xl shrink-0">{fileIcon(fileType)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ink-100 truncate">{fileName ?? 'File'}</p>
        {fileSize && <p className="text-[10px] text-ink-400">{fmtBytes(fileSize)}</p>}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-400 shrink-0">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </a>
  );
}

// ── DM Call Bar ───────────────────────────────────────────────────────────────
function DmCallBar({ call }: { call: DmCallState }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (call.status !== 'active' || !call.startedAt) return;
    const tick = () => setElapsed(fmtDuration(call.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.status, call.startedAt]);

  const isActive = call.status === 'active';
  return (
    <div className="px-3 md:px-4 py-1.5 bg-emerald-500/[0.06] border-b border-emerald-500/15 flex items-center gap-2 shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
      <span className="text-[11px] text-emerald-400/80">
        {call.status === 'outgoing-ringing' ? `Calling ${call.peerName}…`
          : call.status === 'connecting' ? 'Connecting…'
          : `In call · ${call.peerName}${elapsed ? ` · ${elapsed}` : ''}`}
      </span>
    </div>
  );
}

// ── Video overlay (floating PiP) ──────────────────────────────────────────────
function DmVideoOverlay({ call, onClose }: { call: DmCallState; onClose: () => void }) {
  const peerVideoRef = useRef<HTMLVideoElement>(null);
  const selfVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (peerVideoRef.current && call.peerStream) peerVideoRef.current.srcObject = call.peerStream; }, [call.peerStream]);
  useEffect(() => {
    if (selfVideoRef.current && call.localStream && !call.isVideoOff) selfVideoRef.current.srcObject = call.localStream;
    else if (selfVideoRef.current) selfVideoRef.current.srcObject = null;
  }, [call.localStream, call.isVideoOff]);

  return createPortal(
    <div className="fixed bottom-20 right-4 z-[150] w-72 bg-ink-900 border border-white/[0.09] rounded-2xl overflow-hidden shadow-2xl">
      <div className="relative bg-ink-950 aspect-video">
        {call.peerStream
          ? <video ref={peerVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><Avatar name={call.peerName} id={call.peerUserId} size="lg" imageUrl={call.peerAvatarUrl} /></div>}
        {call.localStream && !call.isVideoOff && (
          <div className="absolute bottom-2 right-2 w-20 h-14 rounded-lg overflow-hidden border border-white/[0.12] bg-ink-900">
            <video ref={selfVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          </div>
        )}
        <button onClick={onClose} className="absolute top-2 right-2 h-6 w-6 grid place-items-center rounded-full bg-black/50 text-ink-300 hover:text-ink-100 transition-colors">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
        </button>
      </div>
      <div className="px-3 py-2"><p className="text-[12px] text-ink-200 font-medium truncate">{call.peerName}</p></div>
    </div>,
    document.body,
  );
}

function DmCallAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />;
}

// ── Per-message row ───────────────────────────────────────────────────────────
type RowProps = {
  msg: DmMessage;
  dm: DmChannel;
  me: User;
  showHeader: boolean;
  onReact: (emoji: string) => void;
  onReply: (msg: DmMessage) => void;
  onEdit: (msgId: string, newText: string) => Promise<void>;
  onDelete: (msgId: string) => Promise<void>;
  onClickUser?: (userId: string) => void;
};

function DmMessageRow({ msg, dm, me, showHeader, onReact, onReply, onEdit, onDelete, onClickUser }: RowProps) {
  const isSelf = msg.senderId === me.id;
  const name = isSelf ? me.displayName : dm.otherDisplayName;
  const avatarUrl = isSelf ? (me as any).avatarUrl ?? null : dm.otherAvatarUrl ?? null;
  const c = userColor(msg.senderId, isSelf);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  function startEdit() {
    setEditValue(msg.body);
    setEditing(true);
    setTimeout(() => {
      if (editRef.current) {
        editRef.current.focus();
        editRef.current.selectionStart = editRef.current.value.length;
      }
    }, 10);
  }

  async function saveEdit() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === msg.body) { setEditing(false); return; }
    try { await onEdit(msg.id, trimmed); } catch { /* keep open on error */ }
    setEditing(false);
  }

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setFullPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [pickerOpen]);

  const hasReactions = (msg.reactions?.length ?? 0) > 0;

  return (
    <div
      className={[
        'group relative flex gap-3 px-5 transition-colors hover:bg-white/[0.015]',
        showHeader ? 'mt-4' : 'mt-0.5',
      ].join(' ')}
    >
      {/* Avatar column */}
      <div className="w-9 shrink-0 pt-0.5">
        {showHeader ? (
          <button onClick={() => onClickUser?.(msg.senderId)} className="focus:outline-none" tabIndex={-1}>
            <Avatar name={name} id={msg.senderId} size="md" isSelf={isSelf} imageUrl={avatarUrl} />
          </button>
        ) : (
          <div className="opacity-0 group-hover:opacity-100 text-[10px] text-ink-300 text-right pt-1.5 font-mono select-none leading-none">
            {fmtTime(msg.createdAt)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-0.5">
        {showHeader && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <button
              onClick={() => onClickUser?.(msg.senderId)}
              className="font-semibold text-[14px] hover:underline focus:outline-none"
              style={{ color: c.text }}
            >
              {name}
            </button>
            {isSelf && (
              <span className="pill text-[10px]" style={{ background: c.soft, color: c.text, boxShadow: `inset 0 0 0 1px ${c.ring}` }}>
                You
              </span>
            )}
            <span className="text-[11px] text-ink-300">{fmtDayTime(msg.createdAt)}</span>
          </div>
        )}

        {/* Quoted reply block */}
        {msg.decodedReply && (
          <div className="flex items-start gap-2 mb-1">
            <div className="w-0.5 self-stretch rounded-full bg-ink-400/50 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-ink-300 mr-1.5">{msg.decodedReply.senderName}</span>
              <span className={`text-[11px] leading-snug ${msg.decodedReply.failed ? 'text-rose-300/70 italic' : 'text-ink-400'}`}>
                {msg.decodedReply.failed
                  ? msg.decodedReply.body
                  : msg.decodedReply.body.length > 120
                    ? msg.decodedReply.body.slice(0, 120) + '…'
                    : msg.decodedReply.body}
              </span>
            </div>
          </div>
        )}

        {/* Body or edit field */}
        {editing ? (
          <div className="mt-0.5 pr-4">
            <textarea
              ref={editRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                if (e.key === 'Escape') setEditing(false);
              }}
              rows={Math.min(editValue.split('\n').length + 1, 8)}
              className="w-full bg-ink-800/80 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-ink-100 resize-none outline-none focus:border-accent-violet/40 transition-colors"
            />
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-ink-400">
              <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium">Save</button>
              <span>·</span>
              <span>Enter to save</span>
              <span>·</span>
              <button onClick={() => setEditing(false)} className="hover:text-ink-200 transition-colors">Cancel (Esc)</button>
            </div>
          </div>
        ) : (
          <div className={`text-[14px] leading-[1.55] break-words ${msg.failed ? 'text-rose-300/80 italic' : 'text-ink-100'}`}>
            {msg.failed ? msg.body : <MarkdownContent text={msg.body} meId={me.id} />}
            {msg.editedAt && !msg.failed && (
              <span className="text-[10px] text-ink-400/70 ml-1.5 select-none">(edited)</span>
            )}
            {msg.isPlaintext && !msg.failed && (
              <span className="text-[10px] text-amber-400/70 ml-1" title="This message was not end-to-end encrypted">⚠ unencrypted</span>
            )}
          </div>
        )}

        {/* File attachment */}
        {!editing && msg.fileUrl && (
          <FileAttachmentView fileUrl={msg.fileUrl} fileName={msg.fileName} fileSize={msg.fileSize} fileType={msg.fileType} />
        )}

        {/* Reactions */}
        {hasReactions && !editing && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {msg.reactions!.map((r) => {
              const reacted = r.userIds.includes(me.id);
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(r.emoji)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] border transition-all
                    ${reacted
                      ? 'bg-accent-violet/20 border-accent-violet/40 text-accent-violet hover:bg-accent-violet/30'
                      : 'bg-ink-800/60 border-white/[0.06] text-ink-200 hover:bg-ink-700/60 hover:border-white/10'
                    }`}
                >
                  <span className="leading-none">{r.emoji}</span>
                  <span className="text-[11px] font-semibold tabular-nums">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Action bar — always visible on touch (no hover), hover-reveal on desktop (UX-002) */}
      {!editing && (
        <div className="absolute right-3 top-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          {/* Emoji react */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => { setPickerOpen((p) => !p); setFullPickerOpen(false); }}
              title="Add reaction"
              className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-base hover:bg-ink-700/90 transition-colors"
            >
              😀
            </button>
            {pickerOpen && (
              <div className="absolute bottom-full mb-1.5 right-0 z-50">
                <div className="flex gap-0.5 p-1.5 rounded-xl bg-ink-800 border border-white/10 shadow-2xl mb-1">
                  {QUICK_REACTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { onReact(e); setPickerOpen(false); }}
                      className="text-xl w-9 h-9 grid place-items-center rounded-lg hover:bg-white/[0.08] transition-colors hover:scale-110"
                    >
                      {e}
                    </button>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); setFullPickerOpen((p) => !p); }}
                    title="More emoji"
                    className={`text-sm w-9 h-9 grid place-items-center rounded-lg transition-colors font-semibold
                      ${fullPickerOpen ? 'bg-accent-violet/25 text-accent-violet' : 'text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'}`}
                  >
                    +
                  </button>
                </div>
                {fullPickerOpen && (
                  <EmojiPicker
                    onSelect={(emoji) => { onReact(emoji); setPickerOpen(false); setFullPickerOpen(false); }}
                    onClose={() => { setFullPickerOpen(false); setPickerOpen(false); }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Reply */}
          <button
            onClick={() => onReply(msg)}
            title="Reply"
            className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-ink-300 hover:text-accent-violet hover:bg-accent-violet/15 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>

          {/* Edit — own messages only */}
          {isSelf && !msg.failed && (
            <button
              onClick={startEdit}
              title="Edit message"
              className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-ink-300 hover:text-sky-300 hover:bg-sky-500/15 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}

          {/* Delete — own messages only */}
          {isSelf && (
            <button
              onClick={() => onDelete(msg.id)}
              title="Delete message"
              className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-ink-300 hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
type Props = {
  dm: DmChannel;
  messages: DmMessage[];
  me: User;
  online: Set<string>;
  onSend: (text: string, file?: { fileUrl: string; fileName: string; fileSize: number; fileType: string }, replyToId?: string | null) => Promise<void>;
  onDelete: (msgId: string) => Promise<void>;
  onEdit: (msgId: string, newText: string) => Promise<void>;
  onClearChat: () => Promise<void>;
  onReact: (dmMessageId: string, emoji: string) => void;
  onTyping: () => void;
  isTyping: boolean;
  call: DmCallState | null;
  onCallStart: (hasVideo: boolean) => void;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  onOpenSidebar?: () => void;
  onClickUser?: (userId: string) => void;
  // CRYPTO-004: TOFU — peer's key safety number, and whether it changed since first seen.
  peerFingerprint?: string;
  peerKeyChanged?: boolean;
  onAcceptPeerKey?: () => void;
};

// ── Main component ────────────────────────────────────────────────────────────
export function DmView({
  dm, messages, me, online, onSend, onDelete, onEdit, onClearChat, onReact, onTyping, isTyping,
  call, onCallStart, hasMore = false, onLoadMore, onOpenSidebar, onClickUser,
  peerFingerprint, peerKeyChanged, onAcceptPeerKey,
}: Props) {
  const [showFingerprint, setShowFingerprint] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  // Reply state
  const [replyingTo, setReplyingTo] = useState<DmMessage | null>(null);
  // File attachment
  const [attachedFile, setAttachedFile] = useState<{ fileUrl: string; fileName: string; fileSize: number; fileType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingMoreRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevScrollHeightRef = useRef(0);

  const isEncrypted = !!dm.otherPublicKey;
  const isOnline = online.has(dm.otherUserId);

  // Scroll to bottom on new messages
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (loadingMoreRef.current) {
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current;
      loadingMoreRef.current = false;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Focus composer when replying
  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  async function handleLoadMore() {
    if (!onLoadMore || loadingMore) return;
    const el = containerRef.current;
    prevScrollHeightRef.current = el?.scrollHeight ?? 0;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try { await onLoadMore(); } finally { setLoadingMore(false); }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    onTyping();
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 3000);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !attachedFile) || sending) return;
    setSending(true);
    setSendError(null);
    const rid = replyingTo?.id ?? null;
    try {
      await onSend(trimmed, attachedFile ?? undefined, rid);
      setText('');
      setAttachedFile(null);
      setReplyingTo(null);
    } catch (err: any) {
      setSendError(err?.message ?? 'Failed to send — try again');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
    if (e.key === 'Escape' && replyingTo) { e.preventDefault(); setReplyingTo(null); }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setSendError('File too large (max 200 MB)');
      if (e.target) e.target.value = '';
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const result = await api.uploadFile(file, (pct) => setUploadProgress(pct));
      setAttachedFile({ fileUrl: result.url, fileName: result.name, fileSize: file.size, fileType: file.type });
    } catch (err: any) {
      setSendError(err?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="h-12 px-3 md:px-4 flex items-center gap-2 md:gap-3 border-b border-white/5 bg-ink-900/40 shrink-0">
        {onOpenSidebar && (
          <button onClick={onOpenSidebar} className="md:hidden h-9 w-9 grid place-items-center rounded-lg text-ink-300 hover:bg-white/[0.06] hover:text-ink-100 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        )}

        <button onClick={() => onClickUser?.(dm.otherUserId)} className="relative shrink-0 focus:outline-none">
          <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="sm" imageUrl={dm.otherAvatarUrl} status={isOnline ? 'online' : 'offline'} />
        </button>

        <div className="min-w-0 flex-1">
          <button onClick={() => onClickUser?.(dm.otherUserId)} className="text-[13px] font-semibold text-ink-100 hover:underline focus:outline-none truncate max-w-[120px] sm:max-w-none">
            {dm.otherDisplayName}
          </button>
          <span className={`text-[11px] ml-2 hidden md:inline ${isOnline ? 'text-emerald-400' : 'text-ink-300'}`}>
            {isOnline ? '● Online' : '○ Offline'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!call && (
            <>
              <button onClick={() => onCallStart(false)} title="Voice call"
                className="h-7 w-7 grid place-items-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-emerald-400 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.62 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.12 4.18 2 2 0 0 1 5.09 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l.46-.46a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 18v-.08z"/></svg>
              </button>
              <button onClick={() => onCallStart(true)} title="Video call"
                className="h-7 w-7 grid place-items-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-accent-violet transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
              </button>
            </>
          )}

          {isEncrypted ? (
            <button
              onClick={() => setShowFingerprint((s) => !s)}
              title="Show encryption key fingerprint"
              className={`text-[11px] rounded px-2 py-0.5 hidden sm:flex items-center gap-1.5 transition-colors ${
                peerKeyChanged
                  ? 'text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15'
                  : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15'
              }`}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              {peerKeyChanged ? '⚠ key changed' : 'E2E'}
            </button>
          ) : (
            <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5 hidden sm:block">⚠ pending</span>
          )}

          {clearConfirm ? (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-ink-300">{clearError ?? 'Clear?'}</span>
              <button
                onClick={async () => { setClearError(null); try { await onClearChat(); setClearConfirm(false); } catch (err: any) { setClearError(err?.message ?? 'Failed'); } }}
                className="text-[11px] text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded hover:bg-rose-500/10"
              >Yes</button>
              <button onClick={() => { setClearConfirm(false); setClearError(null); }} className="text-[11px] text-ink-400 hover:text-ink-200 px-1.5 py-0.5 rounded hover:bg-white/[0.04]">No</button>
            </div>
          ) : (
            <button onClick={() => setClearConfirm(true)} className="text-[11px] text-ink-400 hover:text-rose-300 transition-colors px-2 py-0.5 rounded hover:bg-rose-500/10 hidden md:block">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* CRYPTO-004: peer key changed since first seen — possible rotation or MITM */}
      {peerKeyChanged && (
        <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-2.5 text-[12px]">
          <span className="text-amber-400 mt-0.5">⚠</span>
          <div className="min-w-0 flex-1">
            <div className="text-amber-200 font-medium">{dm.otherDisplayName}'s encryption key changed.</div>
            <div className="text-amber-300/80 mt-0.5">
              This happens when they reset their device or rotate keys — but could also indicate someone intercepting.
              {peerFingerprint && <> Verify the new fingerprint <span className="font-mono text-amber-100">{peerFingerprint}</span> with them before continuing.</>}
            </div>
          </div>
          {onAcceptPeerKey && (
            <button
              onClick={onAcceptPeerKey}
              className="shrink-0 text-[11px] font-semibold text-amber-100 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded px-2.5 py-1 transition-colors"
            >
              Accept new key
            </button>
          )}
        </div>
      )}

      {/* CRYPTO-004: fingerprint reveal for manual out-of-band verification */}
      {showFingerprint && !peerKeyChanged && peerFingerprint && (
        <div className="px-4 py-2 bg-ink-900/60 border-b border-white/5 text-[11px] text-ink-300 flex items-center gap-2">
          <span className="text-emerald-400">🔒</span>
          <span>Key fingerprint:</span>
          <span className="font-mono text-ink-100 tracking-wide">{peerFingerprint}</span>
          <span className="text-ink-500 hidden md:inline">— compare with {dm.otherDisplayName} to verify no one is in the middle.</span>
        </div>
      )}

      {/* Call status bar */}
      {call && call.status !== 'incoming-ringing' && <DmCallBar call={call} />}

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto py-4">
        {hasMore && (
          <div className="flex justify-center pb-2 px-5">
            <button onClick={handleLoadMore} disabled={loadingMore}
              className="text-[11px] text-ink-400 hover:text-ink-200 bg-ink-800/50 hover:bg-ink-700/60 border border-white/[0.06] rounded-full px-4 py-1.5 transition-colors disabled:opacity-50">
              {loadingMore ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
            <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="lg" imageUrl={dm.otherAvatarUrl} />
            <p className="text-ink-200 text-sm font-medium">{dm.otherDisplayName}</p>
            <p className="text-ink-300 text-xs">@{dm.otherUsername}</p>
            <p className="text-ink-400 text-xs mt-2">Send a message to start the conversation.</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const showHeader = !prev
            || prev.senderId !== msg.senderId
            || msg.createdAt - prev.createdAt > GROUP_GAP_MS;

          return (
            <DmMessageRow
              key={msg.id}
              msg={msg}
              dm={dm}
              me={me}
              showHeader={showHeader}
              onReact={(emoji) => onReact(msg.id, emoji)}
              onReply={setReplyingTo}
              onEdit={onEdit}
              onDelete={onDelete}
              onClickUser={onClickUser}
            />
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-3 px-5 mt-2">
            <div className="w-9 shrink-0 flex justify-center">
              <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="sm" imageUrl={dm.otherAvatarUrl} />
            </div>
            <div className="flex items-center gap-1 bg-ink-800/60 rounded-2xl rounded-bl-sm px-3 py-2">
              <span className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSend}
        className="px-3 md:px-4 pt-2 shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        {/* Reply banner */}
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 bg-ink-800/40 border border-white/[0.06] rounded-lg px-3 py-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-400 shrink-0">
              <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold text-ink-300 mr-1.5">
                Replying to {replyingTo.senderId === me.id ? 'yourself' : dm.otherDisplayName}
              </span>
              <span className="text-[11px] text-ink-400 truncate">
                {replyingTo.body.length > 80 ? replyingTo.body.slice(0, 80) + '…' : replyingTo.body}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-ink-400 hover:text-rose-400 transition-colors shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
            </button>
          </div>
        )}

        {/* File preview */}
        {attachedFile && (
          <div className="mb-2 flex items-center gap-2 bg-ink-800/50 border border-white/[0.06] rounded-lg px-3 py-2">
            <span className="text-base">{fileIcon(attachedFile.fileType)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-ink-200 text-[12px] font-medium truncate">{attachedFile.fileName}</p>
              <p className="text-ink-400 text-[10px]">{fmtBytes(attachedFile.fileSize)}</p>
            </div>
            <button type="button" onClick={() => setAttachedFile(null)} className="text-ink-400 hover:text-rose-400 transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
            </button>
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="mb-2 flex items-center gap-2">
            <div className="flex-1 h-1 bg-ink-800 rounded-full overflow-hidden">
              <div className="h-full bg-accent-violet transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
            </div>
            <span className="text-[10px] text-ink-400">{uploadProgress}%</span>
          </div>
        )}

        <div className="flex items-end gap-2 bg-ink-800/50 rounded-xl border border-white/[0.06] px-3 py-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-9 w-9 grid place-items-center rounded-lg text-ink-400 hover:text-ink-200 hover:bg-white/[0.06] transition-colors disabled:opacity-40 shrink-0"
            title="Attach file"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />

          <textarea
            ref={inputRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={onKeyDown}
            placeholder={`Message ${dm.otherDisplayName}${isEncrypted ? ' (E2E encrypted)' : ''}`}
            rows={1}
            className="flex-1 bg-transparent text-ink-100 placeholder-ink-400 resize-none outline-none max-h-32 min-h-[36px]"
            style={{ scrollbarWidth: 'none', fontSize: '16px' }}
          />

          <button
            type="submit"
            disabled={(!text.trim() && !attachedFile) || sending || uploading}
            className="h-9 w-9 grid place-items-center rounded-lg bg-accent-violet/20 text-accent-violet hover:bg-accent-violet/30 transition-colors disabled:opacity-30 shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>

        {sendError ? (
          <div className="text-[10px] mt-1 px-1 text-rose-400">{sendError}</div>
        ) : (
          <div className="text-[10px] mt-1 px-1">
            {isEncrypted
              ? <span className="text-emerald-500/70">ECDH P-256 + HKDF-SHA256 + AES-GCM-256 · server sees only ciphertext</span>
              : <span className="text-amber-500/70">Waiting for peer to register encryption key</span>}
          </div>
        )}
      </form>
    </div>
  );
}
