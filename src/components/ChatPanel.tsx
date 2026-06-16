import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MessageRow } from './MessageRow';
import { ReportDialog } from './ReportDialog';
import { Composer, type AnimationType, type ReplyingTo } from './Composer';
import { TypingIndicator } from './TypingIndicator';
import type { Channel, DecodedMessage, FileAttachment, Member, PinnedMessage, User } from '../types';


type Props = {
  channel: Channel;
  messages: DecodedMessage[];
  members: Record<string, Member>;
  me: User;
  encrypted: boolean;
  typingIds: string[];
  onSend: (text: string, replyToId?: string | null, animationType?: AnimationType, attachment?: FileAttachment) => Promise<void>;
  sparksBalance?: number;
  onTyping: () => void;
  onUnlock: () => void;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string, newText: string) => Promise<void>;
  onReaction: (messageId: string, emoji: string) => void;
  onSpark?: (messageId: string, amount: number) => Promise<void>;
  onReport?: (messageId: string, senderId: string, reason: string, note: string) => Promise<void>;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  /** Mobile only — opens the channel/sidebar drawer */
  onOpenSidebar?: () => void;
  /** Mobile only — opens the members drawer */
  onOpenMembers?: () => void;
  /** Opens the profile card for a user */
  onClickUser?: (userId: string) => void;
  /** Optional node rendered in the channel header (e.g. BroadcastButton) */
  headerActions?: ReactNode;
  /** True when the channel requires a tier the user doesn't have. */
  isLocked?: boolean;
  /** Opens the subscribe modal (only relevant when isLocked is true). */
  onSubscribe?: () => void;
  /** List of pinned messages for this channel (decrypted). */
  pinnedMessages?: PinnedMessage[];
  /** Called when a message should be pinned or unpinned. */
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  /** Whether the current user has permission to pin/unpin messages. */
  canPin?: boolean;
};

export function ChatPanel({
  channel,
  messages,
  members,
  me,
  encrypted,
  typingIds,
  onSend,
  onTyping,
  onUnlock,
  onDelete,
  onEdit,
  onReaction,
  onSpark,
  onReport,
  hasMore = false,
  onLoadMore,
  onOpenSidebar,
  onOpenMembers,
  onClickUser,
  headerActions,
  isLocked,
  onSubscribe,
  sparksBalance,
  pinnedMessages,
  onPin,
  onUnpin,
  canPin,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reportTarget, setReportTarget] = useState<{ msgId: string; senderId: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const loadingMoreRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevChannelIdRef = useRef(channel.id);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);

  // ── Panel-level drag-and-drop ──────────────────────────────────────────────
  const dragCounterRef = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [panelDroppedFile, setPanelDroppedFile] = useState<File | null>(null);

  function handlePanelDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current++;
    if (Array.from(e.dataTransfer.types).includes('Files')) setIsDraggingOver(true);
  }
  function handlePanelDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (--dragCounterRef.current === 0) setIsDraggingOver(false);
  }
  function handlePanelDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handlePanelDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    if (!encrypted) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setPanelDroppedFile(file);
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const channelChanged = prevChannelIdRef.current !== channel.id;
    prevChannelIdRef.current = channel.id;
    if (loadingMoreRef.current) {
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current;
      loadingMoreRef.current = false;
    } else if (channelChanged) {
      el.scrollTop = el.scrollHeight;
    } else {
      // Only auto-scroll if the user is already near the bottom; don't yank
      // them away while reading older messages.
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < 80) el.scrollTop = el.scrollHeight;
    }
    // Clear reply bar only when switching channels
    if (channelChanged) setReplyingTo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, channel.id]);

  async function handleLoadMore() {
    if (!onLoadMore || loadingMore) return;
    const el = scrollRef.current;
    prevScrollHeightRef.current = el?.scrollHeight ?? 0;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try { await onLoadMore(); } finally { setLoadingMore(false); }
  }

  const grouped = useMemo(() => {
    const arr: { msg: DecodedMessage; showHeader: boolean }[] = [];
    let prev: DecodedMessage | null = null;
    for (const m of messages) {
      const showHeader =
        !prev || prev.senderId !== m.senderId || m.createdAt - prev.createdAt > 5 * 60_000;
      arr.push({ msg: m, showHeader });
      prev = m;
    }
    return arr;
  }, [messages]);

  return (
    <div
      className="flex-1 min-w-0 flex flex-col bg-ink-900/40 relative overflow-hidden"
      onDragEnter={handlePanelDragEnter}
      onDragLeave={handlePanelDragLeave}
      onDragOver={handlePanelDragOver}
      onDrop={handlePanelDrop}
    >
      {/* Full-panel drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-accent-violet/[0.06] border-2 border-dashed border-accent-violet/50">
          <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-ink-900/95 border border-accent-violet/30 shadow-2xl">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent-violet">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <p className="text-ink-100 font-semibold text-sm">Drop to attach</p>
            <p className="text-ink-400 text-xs">Images, video, audio, PDF, ZIP and more</p>
          </div>
        </div>
      )}
      <header className="h-12 px-3 md:px-5 flex items-center justify-between border-b border-white/5 bg-ink-900/60 backdrop-blur shrink-0 gap-2">
        {/* Mobile hamburger — opens channel list */}
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="md:hidden h-9 w-9 grid place-items-center rounded-lg text-ink-300 hover:bg-white/[0.06] hover:text-ink-100 shrink-0"
            aria-label="Open channel list"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-ink-300 hidden sm:inline">#</span>
          <h2 className="text-[14px] font-semibold truncate">{channel.name}</h2>
          {channel.topic && (
            <>
              <span className="h-3.5 w-px bg-white/10 mx-1 hidden sm:block" />
              <span className="text-[11px] text-ink-300 truncate max-w-[180px] hidden sm:block" title={channel.topic}>
                {channel.topic}
              </span>
            </>
          )}
          {!channel.topic && (
            <>
              <span className="h-3.5 w-px bg-white/10 mx-2 hidden md:block" />
              <span className="text-[11px] text-ink-300 truncate hidden md:block">
                {encrypted ? 'End-to-end encrypted in your browser' : 'Server locked — passphrase required'}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Pinned messages button */}
          {(pinnedMessages !== undefined) && (
            <button
              onClick={() => setShowPins((p) => !p)}
              title="Pinned messages"
              aria-label="Pinned messages"
              className={`relative h-8 flex items-center gap-1.5 px-2.5 rounded-lg border transition-colors text-[12px] font-medium ${
                showPins
                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                  : 'bg-ink-800/60 border-white/[0.06] text-ink-300 hover:bg-ink-700/60 hover:text-ink-100'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={showPins ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
              <span className="hidden sm:inline">Pins</span>
              {(pinnedMessages.length > 0) && (
                <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-500/30 text-amber-200 text-[10px] font-bold tabular-nums">
                  {pinnedMessages.length}
                </span>
              )}
            </button>
          )}
          {/* Extra header actions (e.g. BroadcastButton) */}
          {headerActions}
          {encrypted ? (
            <span className="pill bg-emerald-500/10 text-emerald-300 shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="hidden sm:inline">secure</span>
            </span>
          ) : (
            <button onClick={onUnlock} className="pill bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 shrink-0">
              unlock
            </button>
          )}

          {/* Mobile members button */}
          {onOpenMembers && (
            <button
              onClick={onOpenMembers}
              className="md:hidden h-9 w-9 grid place-items-center rounded-lg text-ink-300 hover:bg-white/[0.06] hover:text-ink-100 shrink-0"
              aria-label="Open member list"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Pinned messages drawer */}
      {showPins && pinnedMessages !== undefined && (
        <div className="shrink-0 border-b border-white/5 bg-ink-900/80 max-h-72 overflow-y-auto">
          <div className="px-4 py-2.5 flex items-center justify-between sticky top-0 bg-ink-900/95 backdrop-blur border-b border-white/[0.04] z-10">
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
              <span className="text-[12px] font-semibold text-ink-200">
                {pinnedMessages.length === 0
                  ? 'No pinned messages'
                  : `${pinnedMessages.length} pinned message${pinnedMessages.length === 1 ? '' : 's'}`}
              </span>
            </div>
            <button
              onClick={() => setShowPins(false)}
              className="h-6 w-6 grid place-items-center rounded-md text-ink-400 hover:text-ink-200 hover:bg-white/[0.06] transition-colors"
              aria-label="Close pins"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {pinnedMessages.length === 0 ? (
            <p className="px-4 py-5 text-[12px] text-ink-400 text-center">
              No messages are pinned in this channel yet.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {pinnedMessages.map((pin) => (
                <li key={pin.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[12px] font-semibold text-ink-200 truncate">
                        {pin.senderName ?? 'Unknown'}
                      </span>
                      <span className="text-[10px] text-ink-400 shrink-0">
                        {new Date(pin.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-300 leading-snug break-words">
                      {pin.body.length > 100 ? pin.body.slice(0, 100) + '…' : pin.body}
                    </p>
                  </div>
                  {canPin && onUnpin && (
                    <button
                      onClick={() => onUnpin(pin.id)}
                      title="Unpin message"
                      className="shrink-0 h-6 px-2 rounded-md text-[11px] font-medium text-ink-400 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-colors"
                    >
                      Unpin
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isLocked ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent-violet/10 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-violet">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-semibold text-ink-100 mb-1">This channel is members-only</div>
            <div className="text-[13px] text-ink-400">Subscribe to a tier to unlock access to #{channel.name}.</div>
          </div>
          {onSubscribe && (
            <button onClick={onSubscribe} className="btn-primary px-6 py-2 text-sm">
              See plans
            </button>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto py-4">
            {hasMore && (
              <div className="flex justify-center pb-2 pt-1">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-[11px] text-ink-400 hover:text-ink-200 bg-ink-800/50 hover:bg-ink-700/60 border border-white/[0.06] rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}
            {messages.length === 0 ? (
              <EmptyState channelName={channel.name} encrypted={encrypted} />
            ) : (
              grouped.map(({ msg, showHeader }) => {
                const isPinned = pinnedMessages?.some((p) => p.id === msg.id) ?? false;
                return (
                  <MessageRow
                    key={msg.id}
                    msg={msg}
                    sender={members[msg.senderId]}
                    showHeader={showHeader}
                    isSelf={msg.senderId === me.id}
                    meId={me.id}
                    members={members}
                    sparksBalance={sparksBalance}
                    onDelete={msg.senderId === me.id ? () => onDelete(msg.id) : undefined}
                    onEdit={msg.senderId === me.id ? (newText) => onEdit(msg.id, newText) : undefined}
                    onReaction={encrypted ? (emoji) => onReaction(msg.id, emoji) : undefined}
                    onSpark={onSpark && encrypted && msg.senderId !== me.id ? (msgId, amount) => onSpark(msgId, amount) : undefined}
                    onReport={onReport && msg.senderId !== me.id
                      ? () => setReportTarget({ msgId: msg.id, senderId: msg.senderId })
                      : undefined}
                    onReply={encrypted ? (m) => {
                      const senderName = members[m.senderId]?.displayName ?? members[m.senderId]?.username ?? 'unknown';
                      setReplyingTo({
                        id: m.id,
                        senderName,
                        bodyPreview: m.failed ? '[encrypted]' : m.body,
                      });
                    } : undefined}
                    onClickUser={onClickUser}
                    onPin={canPin && encrypted
                      ? () => (isPinned ? onUnpin?.(msg.id) : onPin?.(msg.id))
                      : undefined}
                    isPinned={isPinned}
                  />
                );
              })
            )}
          </div>

          <div className="shrink-0"><TypingIndicator typing={typingIds} members={members} /></div>

          <Composer
            placeholder={`Message #${channel.name}`}
            disabled={!encrypted}
            onSend={async (text, animationType, attachment) => {
              const currentReplyToId = replyingTo?.id ?? null;
              setReplyingTo(null);
              await onSend(text, currentReplyToId, animationType, attachment);
            }}
            onTyping={onTyping}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            members={members}
            sparksBalance={sparksBalance}
            externalDroppedFile={panelDroppedFile}
            onExternalDropConsumed={() => setPanelDroppedFile(null)}
          />

          {reportTarget && onReport && (
            <ReportDialog
              open
              onClose={() => setReportTarget(null)}
              reportedUsername={members[reportTarget.senderId]?.username}
              onSubmit={async (reason, note) => {
                await onReport(reportTarget.msgId, reportTarget.senderId, reason, note);
                setReportTarget(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ channelName, encrypted }: { channelName: string; encrypted: boolean }) {
  return (
    <div className="h-full grid place-items-center px-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto h-14 w-14 grid place-items-center rounded-2xl bg-accent-violet/15 text-accent-violet mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-ink-100">#{channelName}</h3>
        <p className="text-sm text-ink-300 mt-1">
          {encrypted
            ? 'This is the start of your encrypted channel. Messages are encrypted in your browser before they leave your device.'
            : 'Enter the server passphrase to unlock and read this channel.'}
        </p>
      </div>
    </div>
  );
}
