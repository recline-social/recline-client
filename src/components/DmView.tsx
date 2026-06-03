import { useLayoutEffect, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import type { DmChannel, DmMessage, DmCallState, User } from '../types';
import { api } from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '0:00';
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string | null | undefined) {
  if (!type) return '📎';
  if (type.startsWith('image/')) return '🖼';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type === 'application/pdf') return '📄';
  if (type.includes('zip') || type.includes('archive')) return '🗜';
  return '📎';
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

// ── File Attachment View ───────────────────────────────────────────────────────
function FileAttachmentView({ fileUrl, fileName, fileSize, fileType }: {
  fileUrl: string; fileName: string | null | undefined;
  fileSize: number | null | undefined; fileType: string | null | undefined;
}) {
  const isImage = fileType?.startsWith('image/');
  const isVideo = fileType?.startsWith('video/');
  const isAudio = fileType?.startsWith('audio/');

  if (isImage) {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1.5 max-w-xs">
        <img
          src={fileUrl}
          alt={fileName ?? 'image'}
          className="rounded-xl max-h-64 w-auto object-cover border border-white/[0.06] hover:opacity-90 transition-opacity"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {fileName && <p className="text-[10px] text-ink-300 mt-1 truncate max-w-xs">{fileName}</p>}
      </a>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-1.5 max-w-xs">
        <video
          src={fileUrl}
          controls
          className="rounded-xl max-h-48 w-full border border-white/[0.06]"
        />
        {fileName && <p className="text-[10px] text-ink-300 mt-1 truncate">{fileName}</p>}
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="mt-1.5">
        <audio src={fileUrl} controls className="max-w-xs" />
        {fileName && <p className="text-[10px] text-ink-300 mt-1 truncate max-w-xs">{fileName}</p>}
      </div>
    );
  }

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex items-center gap-2.5 bg-ink-800/50 hover:bg-ink-700/60 border border-white/[0.06] rounded-xl px-3 py-2.5 max-w-xs transition-colors"
    >
      <span className="text-xl shrink-0">{fileIcon(fileType)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-ink-100 text-[12px] font-medium truncate">{fileName ?? 'File'}</p>
        {fileSize && <p className="text-ink-300 text-[10px]">{formatBytes(fileSize)}</p>}
      </div>
      <svg className="text-ink-400 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </a>
  );
}

// ── DM Call Bar (active/outgoing call status inside DmView) ───────────────────
function DmCallBar({ call, onMute, onToggleVideo, onHangUp, onToggleVideoView, showVideo }: {
  call: DmCallState;
  onMute: () => void;
  onToggleVideo: () => void;
  onHangUp: () => void;
  onToggleVideoView: () => void;
  showVideo: boolean;
}) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (call.status !== 'active' || !call.startedAt) return;
    const tick = () => setElapsed(formatDuration(call.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.status, call.startedAt]);

  const isOutgoing = call.status === 'outgoing-ringing';
  const isConnecting = call.status === 'connecting';
  const isActive = call.status === 'active';

  return (
    <div className="px-3 md:px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/15 flex items-center gap-2 shrink-0">
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        <span className="text-[12px] font-medium text-ink-200 truncate">
          {isOutgoing && `Calling ${call.peerName}…`}
          {isConnecting && 'Connecting…'}
          {isActive && `${call.peerName} ${elapsed ? `· ${elapsed}` : ''}`}
        </span>
        {call.hasVideo && (
          <span className="text-[10px] text-ink-400 bg-ink-800/50 border border-white/[0.05] px-1.5 py-0.5 rounded-full shrink-0">
            video
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isActive && call.hasVideo && (
          <button
            onClick={onToggleVideoView}
            title={showVideo ? 'Hide video' : 'Show video'}
            className={`h-7 w-7 grid place-items-center rounded-lg transition-colors ${showVideo ? 'bg-accent-violet/20 text-accent-violet' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-200'}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/>
              <rect x="3" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
        )}
        {(isActive || isConnecting) && (
          <>
            <button
              onClick={onMute}
              title={call.isMuted ? 'Unmute' : 'Mute'}
              className={`h-7 w-7 grid place-items-center rounded-lg transition-colors ${call.isMuted ? 'bg-rose-500/15 text-rose-400' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-200'}`}
            >
              {call.isMuted ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3m-4 0h8"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
            </button>
            {call.hasVideo && (
              <button
                onClick={onToggleVideo}
                title={call.isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                className={`h-7 w-7 grid place-items-center rounded-lg transition-colors ${call.isVideoOff ? 'bg-rose-500/15 text-rose-400' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-200'}`}
              >
                {call.isVideoOff ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
                )}
              </button>
            )}
          </>
        )}
        <button
          onClick={onHangUp}
          title="Hang up"
          className="h-7 px-2 flex items-center gap-1 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors text-[11px] font-medium"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 13 19.79 19.79 0 0 1 1.19 4.37 2 2 0 0 1 3.17 2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.07 9.91"/>
            <line x1="23" y1="1" x2="1" y2="23"/>
          </svg>
          End
        </button>
      </div>
    </div>
  );
}

// ── Video overlay (floating panel shown when call.hasVideo && showVideo) ──────
function DmVideoOverlay({ call, onClose }: { call: DmCallState; onClose: () => void }) {
  const peerVideoRef = useRef<HTMLVideoElement>(null);
  const selfVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (peerVideoRef.current && call.peerStream) {
      peerVideoRef.current.srcObject = call.peerStream;
    }
  }, [call.peerStream]);

  useEffect(() => {
    if (selfVideoRef.current && call.localStream && !call.isVideoOff) {
      selfVideoRef.current.srcObject = call.localStream;
    } else if (selfVideoRef.current) {
      selfVideoRef.current.srcObject = null;
    }
  }, [call.localStream, call.isVideoOff]);

  return createPortal(
    <div className="fixed bottom-20 right-4 z-[150] w-72 bg-ink-900 border border-white/[0.09] rounded-2xl overflow-hidden shadow-2xl">
      <div className="relative bg-ink-950 aspect-video">
        {call.peerStream ? (
          <video ref={peerVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Avatar name={call.peerName} id={call.peerUserId} size="lg" imageUrl={call.peerAvatarUrl} />
          </div>
        )}
        {/* Self video — small pip */}
        {call.localStream && !call.isVideoOff && (
          <div className="absolute bottom-2 right-2 w-20 h-14 rounded-lg overflow-hidden border border-white/[0.12] bg-ink-900">
            <video ref={selfVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 h-6 w-6 grid place-items-center rounded-full bg-black/50 text-ink-300 hover:text-ink-100 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
        </button>
      </div>
      <div className="px-3 py-2">
        <p className="text-[12px] text-ink-200 font-medium truncate">{call.peerName}</p>
      </div>
    </div>,
    document.body,
  );
}

// ── Audio element for peer's audio stream ─────────────────────────────────────
function DmCallAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />;
}

// ── Props ──────────────────────────────────────────────────────────────────────
type Props = {
  dm: DmChannel;
  messages: DmMessage[];
  me: User;
  online: Set<string>;
  onSend: (text: string, file?: { fileUrl: string; fileName: string; fileSize: number; fileType: string }) => Promise<void>;
  onDelete: (msgId: string) => Promise<void>;
  onClearChat: () => Promise<void>;
  onReact: (dmMessageId: string, emoji: string) => void;
  onTyping: () => void;
  isTyping: boolean; // is the other person typing?
  /** Active DM call state — null if no call in progress */
  call: DmCallState | null;
  onCallStart: (hasVideo: boolean) => void;
  onCallHangUp: () => void;
  onCallMute: () => void;
  onCallToggleVideo: () => void;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  onOpenSidebar?: () => void;
  onClickUser?: (userId: string) => void;
};

export function DmView({
  dm, messages, me, online, onSend, onDelete, onClearChat, onReact, onTyping, isTyping,
  call, onCallStart, onCallHangUp, onCallMute, onCallToggleVideo,
  hasMore = false, onLoadMore, onOpenSidebar, onClickUser,
}: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  // File attachment state
  const [attachedFile, setAttachedFile] = useState<{ fileUrl: string; fileName: string; fileSize: number; fileType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // Reaction picker state: messageId that's showing the picker
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingMoreRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevScrollHeightRef = useRef(0);

  const isEncrypted = !!dm.otherPublicKey;
  const isOnline = online.has(dm.otherUserId);
  const hasActiveCall = !!call && call.status !== 'outgoing-ringing' && call.status !== 'incoming-ringing';

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

  // Close reaction picker on outside click
  useEffect(() => {
    if (!reactionPickerFor) return;
    const handler = () => setReactionPickerFor(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reactionPickerFor]);

  async function handleLoadMore() {
    if (!onLoadMore || loadingMore) return;
    const el = containerRef.current;
    prevScrollHeightRef.current = el?.scrollHeight ?? 0;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try { await onLoadMore(); } finally { setLoadingMore(false); }
  }

  // Debounced typing event
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    onTyping();
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingTimerRef.current = null;
    }, 3000);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !attachedFile) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(trimmed, attachedFile ?? undefined);
      setText('');
      setAttachedFile(null);
    } catch (err: any) {
      setSendError(err?.message ?? 'Failed to send — try again');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const result = await api.uploadFile(file, (pct) => setUploadProgress(pct));
      setAttachedFile({
        fileUrl: result.url,
        fileName: result.name,
        fileSize: file.size,
        fileType: file.type,
      });
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
    <div
      className="flex-1 min-w-0 flex flex-col overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="h-12 px-3 md:px-4 flex items-center gap-2 md:gap-3 border-b border-white/5 bg-ink-900/40 shrink-0">
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="md:hidden h-9 w-9 grid place-items-center rounded-lg text-ink-300 hover:bg-white/[0.06] hover:text-ink-100 shrink-0"
          >
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
          {/* Call buttons — only show when no call is active */}
          {!call && (
            <>
              <button
                onClick={() => onCallStart(false)}
                title="Voice call"
                className="h-7 w-7 grid place-items-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-emerald-400 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.62 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.12 4.18 2 2 0 0 1 5.09 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l.46-.46a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 18v-.08z"/></svg>
              </button>
              <button
                onClick={() => onCallStart(true)}
                title="Video call"
                className="h-7 w-7 grid place-items-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-accent-violet transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
              </button>
            </>
          )}

          {isEncrypted ? (
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5 hidden sm:flex items-center gap-1.5">
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              E2E
            </span>
          ) : (
            <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5 hidden sm:block">⚠ pending</span>
          )}

          {clearConfirm ? (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-ink-300">{clearError ?? 'Clear?'}</span>
              <button onClick={async () => { setClearError(null); try { await onClearChat(); setClearConfirm(false); } catch (err: any) { setClearError(err?.message ?? 'Failed'); } }} className="text-[11px] text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded hover:bg-rose-500/10">Yes</button>
              <button onClick={() => { setClearConfirm(false); setClearError(null); }} className="text-[11px] text-ink-400 hover:text-ink-200 px-1.5 py-0.5 rounded hover:bg-white/[0.04]">No</button>
            </div>
          ) : (
            <button onClick={() => setClearConfirm(true)} className="text-[11px] text-ink-400 hover:text-rose-300 transition-colors px-2 py-0.5 rounded hover:bg-rose-500/10 hidden md:block">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Active/outgoing call bar ─────────────────────────────────────── */}
      {call && call.status !== 'incoming-ringing' && (
        <DmCallBar
          call={call}
          onMute={onCallMute}
          onToggleVideo={onCallToggleVideo}
          onHangUp={onCallHangUp}
          onToggleVideoView={() => setShowVideo((v) => !v)}
          showVideo={showVideo}
        />
      )}

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-3 md:px-4 py-4 space-y-1">
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button onClick={handleLoadMore} disabled={loadingMore} className="text-[11px] text-ink-400 hover:text-ink-200 bg-ink-800/50 hover:bg-ink-700/60 border border-white/[0.06] rounded-full px-4 py-1.5 transition-colors disabled:opacity-50">
              {loadingMore ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="lg" imageUrl={dm.otherAvatarUrl} />
            <p className="text-ink-200 text-sm font-medium">{dm.otherDisplayName}</p>
            <p className="text-ink-300 text-xs">@{dm.otherUsername}</p>
            <p className="text-ink-400 text-xs mt-2">Send a message to start the conversation.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.senderId === me.id;
          const hasFile = !!msg.fileUrl;
          const hasText = !!msg.body && msg.body !== '[encrypted]' && msg.body !== '[legacy]';

          return (
            <div
              key={msg.id}
              className={`group flex gap-2.5 px-2 py-1 rounded-lg hover:bg-white/[0.02] relative ${isMine ? 'flex-row-reverse' : ''}`}
              onMouseLeave={() => setReactionPickerFor(null)}
            >
              {!isMine && (
                <div className="shrink-0 mt-0.5">
                  <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="sm" imageUrl={dm.otherAvatarUrl} />
                </div>
              )}
              <div className={`max-w-[85%] sm:max-w-[70%] space-y-0.5 ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Message bubble */}
                {hasText && (
                  <div className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words
                    ${msg.failed
                      ? 'bg-rose-900/20 text-rose-400 rounded-br-sm border border-rose-500/20 italic text-[12px]'
                      : isMine
                        ? 'bg-accent-violet/25 text-ink-100 rounded-br-sm'
                        : 'bg-ink-800/60 text-ink-100 rounded-bl-sm'
                    }`}>
                    {msg.body}
                  </div>
                )}

                {/* File attachment */}
                {hasFile && <FileAttachmentView fileUrl={msg.fileUrl!} fileName={msg.fileName} fileSize={msg.fileSize} fileType={msg.fileType} />}

                {/* Reactions */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {msg.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        onClick={() => onReact(msg.id, r.emoji)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors
                          ${r.userIds.includes(me.id)
                            ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
                            : 'bg-ink-800/60 border-white/[0.06] text-ink-300 hover:border-white/[0.12]'
                          }`}
                      >
                        <span>{r.emoji}</span>
                        <span className="font-medium">{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Timestamp + actions */}
                <div className={`flex items-center gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                  <span className="text-[10px] text-ink-300">{formatTime(msg.createdAt)}</span>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    {/* Quick react button */}
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id); }}
                        className="text-[10px] text-ink-400 hover:text-ink-200 p-0.5 rounded"
                        title="React"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      </button>
                      {reactionPickerFor === msg.id && (
                        <div
                          className={`absolute z-50 bottom-6 ${isMine ? 'right-0' : 'left-0'} flex gap-1 bg-ink-800 border border-white/[0.09] rounded-xl px-2 py-1.5 shadow-xl`}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => { onReact(msg.id, emoji); setReactionPickerFor(null); }}
                              className="text-base hover:scale-125 transition-transform p-0.5"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isMine && (
                      <button onClick={() => onDelete(msg.id)} className="text-[10px] text-rose-400 hover:text-rose-300">
                        delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-2 px-2 pb-1">
            <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="sm" imageUrl={dm.otherAvatarUrl} />
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
        {/* File preview */}
        {attachedFile && (
          <div className="mb-2 flex items-center gap-2 bg-ink-800/50 border border-white/[0.06] rounded-lg px-3 py-2">
            <span className="text-base">{fileIcon(attachedFile.fileType)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-ink-200 text-[12px] font-medium truncate">{attachedFile.fileName}</p>
              <p className="text-ink-400 text-[10px]">{formatBytes(attachedFile.fileSize)}</p>
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
          {/* File attach button */}
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
            {isEncrypted ? (
              <span className="text-emerald-500/70">ECDH P-256 + HKDF-SHA256 + AES-GCM-256 · server sees only ciphertext</span>
            ) : (
              <span className="text-amber-500/70">Waiting for peer to register encryption key</span>
            )}
          </div>
        )}
      </form>

      {/* Peer audio stream (always mounted when call is active) */}
      {hasActiveCall && <DmCallAudio stream={call!.peerStream} />}

      {/* Video overlay */}
      {hasActiveCall && showVideo && call!.hasVideo && (
        <DmVideoOverlay call={call!} onClose={() => setShowVideo(false)} />
      )}
    </div>
  );
}
