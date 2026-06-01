import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import { MarkdownContent } from './MarkdownContent';
import { EmojiPicker } from './EmojiPicker';
import { userColor } from '../lib/colors';
import { TEXT_CLASS, ROW_CLASS, triggerParticles } from '../lib/messageAnimations';
import type { DecodedMessage, Member } from '../types';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '✅'];
const SPARK_QUICK_AMOUNTS = [5, 10, 25, 50];

type Props = {
  msg: DecodedMessage;
  sender?: Member;
  showHeader: boolean;
  isSelf: boolean;
  onDelete?: () => void;
  onEdit?: (newText: string) => Promise<void>;
  onReaction?: (emoji: string) => void;
  onReport?: () => void;
  onReply?: (msg: DecodedMessage) => void;
  onClickUser?: (userId: string) => void;
  onSpark?: (messageId: string, amount: number) => void;
  members?: Record<string, Member>;
  meId?: string;
  sparksBalance?: number;
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDayTime(ts: number) {
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

// TEXT_CLASS and ROW_CLASS imported from messageAnimations.ts

// ── Spark picker — portal so it escapes overflow/stacking context of message row ──
function SparkPickerPortal({
  anchorRef, sparksBalance, sparkCustom, onCustomChange, sparkSending, onSend, onClose,
}: {
  anchorRef: React.RefObject<HTMLDivElement>;
  sparksBalance?: number;
  sparkCustom: string;
  onCustomChange: (v: string) => void;
  sparkSending: boolean;
  onSend: (amount: number) => void;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Calculate position from anchor button
  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.top - 8, right: window.innerWidth - r.right });
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose, anchorRef]);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const customVal = parseInt(sparkCustom, 10);
  const customValid = !Number.isNaN(customVal) && customVal >= 1 && customVal <= 500;
  const customAffordable = sparksBalance === undefined || customVal <= sparksBalance;

  return (
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        bottom: `calc(100vh - ${pos.top}px)`,
        right: `${pos.right}px`,
        zIndex: 9999,
        width: 220,
        background: 'linear-gradient(160deg,#130b28 0%,#0d0d17 100%)',
        border: '1px solid rgba(251,191,36,0.2)',
        borderRadius: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(251,191,36,0.06)',
        padding: '14px',
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.7)' }}>✦ Spark this message</span>
        {sparksBalance !== undefined && (
          <span style={{ fontSize:11, color:'#fbbf24', fontWeight:600 }}>{sparksBalance} ✦</span>
        )}
      </div>

      {/* Out-of-sparks banner */}
      {sparksBalance !== undefined && sparksBalance < Math.min(...SPARK_QUICK_AMOUNTS) && (
        <div style={{
          marginBottom: 10, padding: '8px 10px', borderRadius: 10,
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
          fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, textAlign: 'center',
        }}>
          Not enough Sparks.{' '}
          <span
            style={{ color: '#fbbf24', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => {
              onClose();
              // open profile dialog sparks tab — dispatch a custom event the app listens for
              window.dispatchEvent(new CustomEvent('recline:open-sparks'));
            }}
          >
            Get more ✦
          </span>
        </div>
      )}

      {/* Quick amounts */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:10 }}>
        {SPARK_QUICK_AMOUNTS.map((amt) => {
          const canAfford = sparksBalance === undefined || amt <= sparksBalance;
          return (
            <button
              key={amt}
              onClick={() => onSend(amt)}
              disabled={sparkSending || !canAfford}
              style={{
                padding: '7px 0', borderRadius:10, fontSize:12, fontWeight:700, cursor: canAfford && !sparkSending ? 'pointer' : 'not-allowed',
                background: canAfford ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)',
                border: canAfford ? '1px solid rgba(251,191,36,0.28)' : '1px solid rgba(255,255,255,0.06)',
                color: canAfford ? '#fbbf24' : 'rgba(255,255,255,0.2)',
                opacity: sparkSending ? 0.5 : 1,
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { if (canAfford) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.22)'; }}
              onMouseLeave={(e) => { if (canAfford) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.12)'; }}
            >
              {amt}
            </button>
          );
        })}
      </div>

      {/* Custom amount */}
      <div style={{ display:'flex', gap:6 }}>
        <input
          type="number"
          min={1} max={500}
          value={sparkCustom}
          onChange={(e) => onCustomChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && customValid && customAffordable) onSend(customVal); }}
          placeholder="Custom"
          autoFocus
          style={{
            flex:1, minWidth:0,
            background: 'rgba(255,255,255,0.06)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            borderRadius:10, padding:'8px 10px',
            fontSize:12, color:'rgba(255,255,255,0.9)',
            outline:'none', fontFamily:'inherit',
            boxSizing: 'border-box' as const,
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(251,191,36,0.5)'; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        />
        <button
          onClick={() => { if (customValid && customAffordable) onSend(customVal); }}
          disabled={sparkSending || !customValid || !customAffordable}
          style={{
            padding:'8px 12px', borderRadius:10, fontSize:12, fontWeight:700,
            cursor: customValid && customAffordable && !sparkSending ? 'pointer' : 'not-allowed',
            background: 'rgba(251,191,36,0.18)',
            border: '1px solid rgba(251,191,36,0.3)',
            color: '#fbbf24',
            opacity: sparkSending || !customValid || !customAffordable ? 0.4 : 1,
            transition: 'all 0.15s',
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </div>

      {/* Validation hint */}
      {sparkCustom && (
        <p style={{ fontSize:10, marginTop:6, color: !customValid ? '#f87171' : !customAffordable ? '#f87171' : 'rgba(255,255,255,0.3)' }}>
          {!customValid ? 'Enter 1–500' : !customAffordable ? 'Not enough Sparks' : `Costs ${customVal} ✦`}
        </p>
      )}
    </div>
  );
}

export function MessageRow({ msg, sender, showHeader, isSelf, onDelete, onEdit, onReaction, onReport, onReply, onClickUser, onSpark, members, meId, sparksBalance }: Props) {
  const name = sender?.displayName ?? sender?.username ?? 'unknown';
  const c = userColor(sender?.id ?? msg.senderId, isSelf);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [sparkOpen, setSparkOpen] = useState(false);
  const [sparkCustom, setSparkCustom] = useState('');
  const [sparkSending, setSparkSending] = useState(false);
  const [sparkPulsing, setSparkPulsing] = useState(false);
  const editRef      = useRef<HTMLTextAreaElement>(null);
  const pickerRef    = useRef<HTMLDivElement>(null);
  const sparkRef     = useRef<HTMLDivElement>(null);
  const animBodyRef  = useRef<HTMLDivElement>(null);
  const animRowRef   = useRef<HTMLDivElement>(null);
  const animCooldown = useRef<number>(0); // timestamp of last replay — prevents spaz loop

  function handleSendSpark(amount: number) {
    if (!onSpark || sparkSending) return;
    if (amount < 1 || amount > 500) return;
    if (sparksBalance !== undefined && amount > sparksBalance) return;
    setSparkSending(true);
    onSpark(msg.id, amount);
    setSparkOpen(false);
    setSparkCustom('');
    // Brief delay to let state propagate before re-enabling
    setTimeout(() => setSparkSending(false), 1000);
  }

  // Trigger particle effects on mount for particle-type animations
  useEffect(() => {
    if (!msg.animationType || !animRowRef.current) return;
    triggerParticles(animRowRef.current, msg.animationType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay animation on hover — 2.5s cooldown prevents spaz loop when
  // animation shifts elements causing rapid leave/enter cycles
  const handleAnimMouseEnter = useCallback(() => {
    const type = msg.animationType;
    if (!type) return;
    const now = Date.now();
    if (now - animCooldown.current < 2500) return;
    animCooldown.current = now;

    const textEl = animBodyRef.current;
    const textCls = TEXT_CLASS[type];
    if (textEl && textCls) {
      textEl.classList.remove(textCls);
      requestAnimationFrame(() => requestAnimationFrame(() => textEl.classList.add(textCls)));
    }
    const rowEl = animRowRef.current;
    const rowCls = ROW_CLASS[type];
    if (rowEl && rowCls) {
      rowEl.classList.remove(rowCls);
      requestAnimationFrame(() => requestAnimationFrame(() => rowEl.classList.add(rowCls)));
    }
    if (rowEl) triggerParticles(rowEl, type);
  }, [msg.animationType]);

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
    if (!trimmed || !onEdit) { setEditing(false); return; }
    if (trimmed === msg.body) { setEditing(false); return; }
    try { await onEdit(trimmed); } catch { /* keep editing on error */ }
    setEditing(false);
  }

  const hasReactions = (msg.reactions?.length ?? 0) > 0;
  const totalSparks = msg.totalSparks ?? 0;

  // Pulse the spark badge whenever totalSparks increments
  const prevSparkRef = useRef(totalSparks);
  if (prevSparkRef.current !== totalSparks && totalSparks > prevSparkRef.current) {
    prevSparkRef.current = totalSparks;
    // Use setTimeout(0) to set state after render — avoids "setState during render"
    setTimeout(() => {
      setSparkPulsing(true);
      setTimeout(() => setSparkPulsing(false), 600);
    }, 0);
  }

  return (
    <div
      ref={animRowRef}
      onMouseEnter={msg.animationType ? handleAnimMouseEnter : undefined}
      className={[
        'group relative flex gap-3 px-5 transition-colors',
        showHeader ? 'mt-4' : 'mt-0.5',
        msg.animationType && !msg.failed && ROW_CLASS[msg.animationType]
          ? ROW_CLASS[msg.animationType]
          : '',
      ].filter(Boolean).join(' ')}
      style={totalSparks > 0 ? {
        background: 'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.04) 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.07)',
      } : undefined}
      onBlur={(e) => {
        if (pickerRef.current && !pickerRef.current.contains(e.relatedTarget as Node)) {
          setPickerOpen(false);
          setFullPickerOpen(false);
        }
        if (sparkRef.current && !sparkRef.current.contains(e.relatedTarget as Node)) {
          setSparkOpen(false);
        }
      }}
    >
      {/* Avatar / timestamp */}
      <div className="w-9 shrink-0 pt-0.5">
        {showHeader ? (
          <button
            onClick={() => onClickUser?.(sender?.id ?? msg.senderId)}
            className="focus:outline-none"
            tabIndex={-1}
          >
            <Avatar name={name} id={sender?.id ?? msg.senderId} size="md" isSelf={isSelf} imageUrl={sender?.avatarUrl} />
          </button>
        ) : (
          <div className="opacity-0 group-hover:opacity-100 text-[10px] text-ink-300 text-right pt-1 font-mono select-none">
            {fmtTime(msg.createdAt)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-0.5">
        {showHeader && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <button
              onClick={() => onClickUser?.(sender?.id ?? msg.senderId)}
              className="font-semibold text-[14px] hover:underline focus:outline-none"
              style={{ color: c.text }}
            >
              {name}
            </button>
            {isSelf && (
              <span
                className="pill text-[10px]"
                style={{ background: c.soft, color: c.text, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
              >
                You
              </span>
            )}
            <span className="text-[11px] text-ink-300">{fmtDayTime(msg.createdAt)}</span>
          </div>
        )}

        {/* Quoted reply block */}
        {msg.decodedReply && (
          <div className="flex items-start gap-2 mb-1 group/reply">
            {/* Left accent border */}
            <div className="w-0.5 self-stretch rounded-full bg-ink-400/50 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-ink-300 mr-1.5">
                {msg.decodedReply.senderName}
              </span>
              <span className={`text-[11px] leading-snug ${msg.decodedReply.failed ? 'text-rose-300/70 italic' : 'text-ink-400'}`}>
                {msg.decodedReply.failed
                  ? msg.decodedReply.body
                  : (msg.decodedReply.body.length > 120
                      ? msg.decodedReply.body.slice(0, 120) + '…'
                      : msg.decodedReply.body)}
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
          <div
            ref={animBodyRef}
            className={[
              'text-[14px] leading-[1.55] break-words',
              msg.failed ? 'text-rose-300/80 italic' : 'text-ink-100',
              msg.animationType && !msg.failed && TEXT_CLASS[msg.animationType]
                ? TEXT_CLASS[msg.animationType]
                : '',
            ].filter(Boolean).join(' ')}
          >
            {msg.failed ? (
              msg.body
            ) : (
              <MarkdownContent text={msg.body} meId={meId} />
            )}
            {msg.editedAt && !msg.failed && (
              <span className="text-[10px] text-ink-400/70 ml-1.5 select-none">(edited)</span>
            )}
          </div>
        )}

        {/* Spark total badge */}
        {totalSparks > 0 && !editing && (
          <div className="flex items-center mt-1">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold select-none transition-all duration-300 ${
                sparkPulsing
                  ? 'scale-110 bg-amber-400/25 text-amber-300 border border-amber-400/50'
                  : 'bg-amber-500/10 text-amber-400/80 border border-amber-500/20'
              }`}
            >
              <span className="text-[10px] leading-none">✦</span>
              <span className="tabular-nums">{totalSparks}</span>
            </span>
          </div>
        )}

        {/* Reactions row */}
        {hasReactions && !editing && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {msg.reactions!.map((r) => {
              const reacted = meId ? r.userIds.includes(meId) : false;
              const tip = r.userIds
                .slice(0, 5)
                .map((uid) => members?.[uid]?.displayName ?? uid)
                .join(', ') + (r.userIds.length > 5 ? ` +${r.userIds.length - 5}` : '');
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReaction?.(r.emoji)}
                  title={tip}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] border transition-all
                    ${
                      reacted
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

      {/* Hover action bar */}
      {!editing && (
        <div className="absolute right-3 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          {onReaction && (
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => { setPickerOpen((p) => !p); setFullPickerOpen(false); }}
                title="Add reaction"
                className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-base hover:bg-ink-700/90 transition-colors"
                aria-label="Add reaction"
              >
                😀
              </button>
              {pickerOpen && (
                <div className="absolute bottom-full mb-1.5 right-0 z-50">
                  {/* Quick reactions bar + "+" button */}
                  <div className="flex gap-0.5 p-1.5 rounded-xl bg-ink-800 border border-white/10 shadow-2xl mb-1">
                    {QUICK_REACTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => { onReaction(e); setPickerOpen(false); }}
                        className="text-xl w-9 h-9 grid place-items-center rounded-lg hover:bg-white/[0.08] transition-colors hover:scale-110"
                        title={e}
                      >
                        {e}
                      </button>
                    ))}
                    {/* More emoji button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setFullPickerOpen((p) => !p); }}
                      title="More emoji"
                      aria-label="More emoji"
                      className={`text-sm w-9 h-9 grid place-items-center rounded-lg transition-colors font-semibold
                        ${fullPickerOpen
                          ? 'bg-accent-violet/25 text-accent-violet'
                          : 'text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
                        }`}
                    >
                      +
                    </button>
                  </div>
                  {/* Full emoji picker */}
                  {fullPickerOpen && (
                    <EmojiPicker
                      onSelect={(emoji) => {
                        onReaction(emoji);
                        setPickerOpen(false);
                        setFullPickerOpen(false);
                      }}
                      onClose={() => { setFullPickerOpen(false); setPickerOpen(false); }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
          {onSpark && !isSelf && (
            <div ref={sparkRef}>
              <button
                onClick={() => {
                  if (!sparkOpen) {
                    // Force a layout read so portal knows where to place itself
                    setSparkOpen(true);
                  } else {
                    setSparkOpen(false);
                    setSparkCustom('');
                  }
                }}
                title="Spark this message"
                className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/15 transition-colors text-[13px] font-semibold"
                aria-label="Spark message"
              >
                ✦
              </button>
              {sparkOpen && createPortal(
                <SparkPickerPortal
                  anchorRef={sparkRef}
                  sparksBalance={sparksBalance}
                  sparkCustom={sparkCustom}
                  onCustomChange={setSparkCustom}
                  sparkSending={sparkSending}
                  onSend={handleSendSpark}
                  onClose={() => { setSparkOpen(false); setSparkCustom(''); }}
                />,
                document.body,
              )}
            </div>
          )}
          {onReply && (
            <button
              onClick={() => onReply(msg)}
              title="Reply"
              className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-ink-300 hover:text-accent-violet hover:bg-accent-violet/15 transition-colors"
              aria-label="Reply to message"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 17 4 12 9 7" />
                <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
              </svg>
            </button>
          )}
          {isSelf && onEdit && !msg.failed && (
            <button
              onClick={startEdit}
              title="Edit message"
              className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-ink-300 hover:text-sky-300 hover:bg-sky-500/15 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          {isSelf && onDelete && (
            <button
              onClick={onDelete}
              title="Delete message"
              className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-ink-300 hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          )}
          {!isSelf && onReport && (
            <button
              onClick={onReport}
              title="Report message"
              className="h-7 w-7 grid place-items-center rounded-md bg-ink-800/90 border border-white/5 text-ink-300 hover:text-amber-300 hover:bg-amber-500/15 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
