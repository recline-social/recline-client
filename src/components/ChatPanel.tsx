import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MessageRow } from './MessageRow';
import { ReportDialog } from './ReportDialog';
import { Composer, type AnimationType, type ReplyingTo } from './Composer';
import { TypingIndicator } from './TypingIndicator';
import type { Channel, DecodedMessage, FileAttachment, Member, User } from '../types';

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
  sparksBalance,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reportTarget, setReportTarget] = useState<{ msgId: string; senderId: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingMoreRef.current) {
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current;
      loadingMoreRef.current = false;
    } else {
      el.scrollTop = el.scrollHeight;
    }
    // Clear reply bar when switching channels
    setReplyingTo(null);
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
    <div className="flex-1 min-w-0 flex flex-col bg-ink-900/40 relative overflow-hidden">
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
          grouped.map(({ msg, showHeader }) => (
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
            />
          ))
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
