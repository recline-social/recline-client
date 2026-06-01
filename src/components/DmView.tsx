import { useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import type { DmChannel, DmMessage, User } from '../types';

type Props = {
  dm: DmChannel;
  messages: DmMessage[];
  me: User;
  online: Set<string>;
  onSend: (text: string) => Promise<void>;
  onDelete: (msgId: string) => Promise<void>;
  onClearChat: () => Promise<void>;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  /** Mobile only — opens the DM list drawer */
  onOpenSidebar?: () => void;
  /** Opens the profile card for a user */
  onClickUser?: (userId: string) => void;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DmView({ dm, messages, me, online, onSend, onDelete, onClearChat, hasMore = false, onLoadMore, onOpenSidebar, onClickUser }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadingMoreRef = useRef(false);

  const prevScrollHeightRef = useRef(0);

  const isEncrypted = !!dm.otherPublicKey;
  const isOnline = online.has(dm.otherUserId);

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

  async function handleLoadMore() {
    if (!onLoadMore || loadingMore) return;
    const el = containerRef.current;
    prevScrollHeightRef.current = el?.scrollHeight ?? 0;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await onLoadMore();
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(trimmed);
      setText('');
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

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 px-3 md:px-4 flex items-center gap-2 md:gap-3 border-b border-white/5 bg-ink-900/40 shrink-0">
        {/* Mobile back button */}
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="md:hidden h-9 w-9 grid place-items-center rounded-lg text-ink-300 hover:bg-white/[0.06] hover:text-ink-100 shrink-0"
            aria-label="Back to conversations"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        {/* Avatar with online dot — clickable to open profile card */}
        <button
          onClick={() => onClickUser?.(dm.otherUserId)}
          className="relative shrink-0 focus:outline-none"
          title={`View ${dm.otherDisplayName}'s profile`}
        >
          <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="sm" imageUrl={dm.otherAvatarUrl} status={isOnline ? 'online' : 'offline'} />
        </button>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => onClickUser?.(dm.otherUserId)}
            className="text-[13px] font-semibold text-ink-100 hover:underline focus:outline-none truncate max-w-[140px] sm:max-w-none"
          >
            {dm.otherDisplayName}
          </button>
          <span className={`text-[11px] ml-2 hidden md:inline ${isOnline ? 'text-emerald-400' : 'text-ink-300'}`}>
            {isOnline ? '● Online' : '○ Offline'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isEncrypted ? (
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5 flex items-center gap-1.5">
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              E2E encrypted
            </span>
          ) : (
            <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
              ⚠ peer key pending
            </span>
          )}
          {clearConfirm ? (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-ink-300">{clearError ?? 'Clear your messages?'}</span>
              <button
                onClick={async () => {
                  setClearError(null);
                  try {
                    await onClearChat();
                    setClearConfirm(false);
                  } catch (err: any) {
                    setClearError(err?.message ?? 'Failed to clear');
                  }
                }}
                className="text-[11px] text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded hover:bg-rose-500/10 transition-colors"
              >
                Yes, clear
              </button>
              <button
                onClick={() => { setClearConfirm(false); setClearError(null); }}
                className="text-[11px] text-ink-400 hover:text-ink-200 px-2 py-0.5 rounded hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setClearConfirm(true)}
              title="Remove your messages from this conversation"
              className="text-[11px] text-ink-400 hover:text-rose-300 transition-colors px-2 py-0.5 rounded hover:bg-rose-500/10"
            >
              Clear chat
            </button>
          )}
        </div>
      </div>

      {/* Messages — min-h-0 forces flex to shrink this pane instead of overflowing */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-3 md:px-4 py-4 space-y-1">
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-[11px] text-ink-400 hover:text-ink-200 bg-ink-800/50 hover:bg-ink-700/60 border border-white/[0.06] rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
            >
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
          return (
            <div
              key={msg.id}
              className={`group flex gap-2.5 px-2 py-1 rounded-lg hover:bg-white/[0.02] ${isMine ? 'flex-row-reverse' : ''}`}
            >
              {!isMine && (
                <div className="shrink-0 mt-0.5">
                  <Avatar name={dm.otherDisplayName} id={dm.otherUserId} size="sm" imageUrl={dm.otherAvatarUrl} />
                </div>
              )}
              <div className={`max-w-[85%] sm:max-w-[70%] space-y-0.5 ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words
                    ${msg.failed
                      ? 'bg-rose-900/20 text-rose-400 rounded-br-sm border border-rose-500/20 italic text-[12px]'
                      : isMine
                        ? 'bg-accent-violet/25 text-ink-100 rounded-br-sm'
                        : 'bg-ink-800/60 text-ink-100 rounded-bl-sm'
                    }`}
                >
                  {msg.body}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-ink-300">{formatTime(msg.createdAt)}</span>
                  {isMine && (
                    <button
                      onClick={() => onDelete(msg.id)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-400 hover:text-rose-300 transition-opacity"
                    >
                      delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input — shrink-0 keeps it pinned at the bottom */}
      <form
        onSubmit={handleSend}
        className="px-3 md:px-4 pt-2 shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <div className="flex items-end gap-2 bg-ink-800/50 rounded-xl border border-white/[0.06] px-3 py-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Message ${dm.otherDisplayName}${isEncrypted ? ' (E2E encrypted)' : ''}`}
            rows={1}
            className="flex-1 bg-transparent text-ink-100 placeholder-ink-400 resize-none outline-none max-h-32 min-h-[36px]"
            style={{ scrollbarWidth: 'none', fontSize: '16px' }}
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="h-9 w-9 grid place-items-center rounded-lg bg-accent-violet/20 text-accent-violet hover:bg-accent-violet/30 transition-colors disabled:opacity-30 shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {sendError ? (
          <div className="text-[10px] mt-1 px-1 text-rose-400 flex items-center gap-1">{sendError}</div>
        ) : (
          <div className="text-[10px] mt-1 px-1 flex items-center gap-1.5">
            {isEncrypted ? (
              <span className="text-emerald-500/70">
                ECDH P-256 + HKDF-SHA256 + AES-GCM-256 · server sees only ciphertext
              </span>
            ) : (
              <span className="text-amber-500/70">
                Waiting for peer to register encryption key — messages sent now use TLS only
              </span>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
