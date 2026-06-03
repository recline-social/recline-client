import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Socket } from 'socket.io-client';
import { api } from '../lib/api';

const TYPES = [
  { id: 'text',     label: 'Text',     cost: 25,  icon: '✦',  desc: 'A text message flashed to everyone watching' },
  { id: 'image',    label: 'Image',    cost: 60,  icon: '🖼',  desc: 'Flash an image to everyone watching' },
  { id: 'sound',    label: 'Sound',    cost: 50,  icon: '♫',  desc: 'Play an audio clip for everyone watching' },
  { id: 'takeover', label: 'Takeover', cost: 150, icon: '⚡', desc: 'Full-screen flash with text + media' },
];

const OWNER_REVENUE_SHARE_PCT = 20; // must stay in sync with server/src/broadcasts.ts OWNER_REVENUE_SHARE

type Props = {
  serverId: string;
  sparksBalance: number;
  socket: Socket | null;
  /** True when the current user owns this server — shows revenue share hint and skips cost UI */
  isOwner?: boolean;
};

export function BroadcastButton({ serverId, sparksBalance, socket, isOwner = false }: Props) {
  const [open, setOpen]                 = useState(false);
  const [selectedType, setSelectedType] = useState('text');
  const [content, setContent]           = useState('');
  const [url, setUrl]                   = useState('');
  const [queueDepth, setQueueDepth]     = useState(0);
  const [surgeMult, setSurgeMult]       = useState(1.0);
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);
  const textareaRef                     = useRef<HTMLTextAreaElement>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);

  const selected  = TYPES.find((t) => t.id === selectedType)!;
  const baseCost  = selected.cost;
  const finalCost = Math.round(baseCost * surgeMult);
  const canAfford = sparksBalance >= finalCost;

  useEffect(() => {
    if (!open) return;
    let live = true;
    api.broadcasts.queue(serverId).then((r) => {
      if (!live) return;
      setQueueDepth(r.depth);
      setSurgeMult(r.surgeMult);
    }).catch(() => {});
    // Focus the right input after render
    setTimeout(() => {
      if (selectedType === 'text' || selectedType === 'takeover') textareaRef.current?.focus();
      else inputRef.current?.focus();
    }, 80);
    return () => { live = false; };
  }, [open, serverId]);

  // Refocus when switching type
  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      if (selectedType === 'text' || selectedType === 'takeover') textareaRef.current?.focus();
      else inputRef.current?.focus();
    }, 40);
  }, [selectedType, open]);

  // Live queue updates
  useEffect(() => {
    if (!socket) return;
    const h = (d: { serverId: string; depth: number; surgeMult: number }) => {
      if (d.serverId !== serverId) return;
      setQueueDepth(d.depth);
      setSurgeMult(d.surgeMult);
    };
    socket.on('broadcast:queue_update', h);
    return () => { socket.off('broadcast:queue_update', h); };
  }, [socket, serverId]);

  // Lock body scroll + ESC
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    setSuccess(null);
    setContent('');
    setUrl('');
  }

  async function handleSend() {
    if (sending) return;
    setError(null);
    setSuccess(null);

    const contentText = (selectedType === 'text' || selectedType === 'takeover') ? content.trim() : undefined;
    const contentUrl  = (selectedType === 'image' || selectedType === 'sound' || selectedType === 'takeover') ? url.trim() : undefined;

    if (selectedType === 'text' && !contentText) { setError('Enter a message first.'); return; }
    if ((selectedType === 'image' || selectedType === 'sound') && !contentUrl) { setError('Enter a URL first.'); return; }

    setSending(true);
    try {
      const r = await api.broadcasts.submit(serverId, { type: selectedType, text: contentText, url: contentUrl });
      setSuccess(r.immediate ? 'Broadcast fired!' : `Queued — position ${r.position} · ✦ ${r.sparkCost}`);
      setContent('');
      setUrl('');
      api.broadcasts.queue(serverId).then((q) => { setQueueDepth(q.depth); setSurgeMult(q.surgeMult); }).catch(() => {});
    } catch (err: any) {
      setError(err?.message ?? 'Failed — please try again');
    } finally {
      setSending(false);
    }
  }

  const needsText = selectedType === 'text' || selectedType === 'takeover';
  const needsUrl  = selectedType === 'image' || selectedType === 'sound' || selectedType === 'takeover';

  const modal = open ? createPortal(
    // Backdrop — click outside to close
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Modal card */}
      <div
        className="w-full max-w-[440px] max-h-[calc(100vh-32px)] flex flex-col bg-ink-900 border border-white/[0.09] rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.02)] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-accent-amber text-sm">✦</span>
              <h2 className="text-[15px] font-semibold text-ink-100 tracking-tight">Space Broadcast</h2>
            </div>
            <p className="text-[11px] text-ink-400 mt-0.5 leading-snug">
              Flash a message to everyone watching right now
            </p>
          </div>
          <button
            onClick={close}
            className="h-8 w-8 grid place-items-center rounded-xl border border-white/[0.07] text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors shrink-0"
            aria-label="Close"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────── */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Type selector */}
          <div className="grid grid-cols-4 gap-2">
            {TYPES.map((t) => {
              const sel = selectedType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelectedType(t.id); setError(null); setSuccess(null); }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-xl border text-[11px] font-semibold transition-all duration-150 ${
                    sel
                      ? 'bg-accent-violet/10 border-accent-violet/30 text-accent-violet shadow-[0_0_14px_rgba(79,117,255,0.08)]'
                      : 'bg-ink-800/60 border-white/[0.07] text-ink-400 hover:text-ink-200 hover:bg-ink-800 hover:border-white/[0.12]'
                  }`}
                >
                  <span className="text-lg leading-none">{t.icon}</span>
                  <span>{t.label}</span>
                  <span className={`text-[10px] ${sel ? 'text-accent-amber/80' : 'text-ink-500'}`}>
                    ✦ {Math.round(t.cost * surgeMult)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Description */}
          <p className="text-[12px] text-ink-400 leading-relaxed -mt-1">{selected.desc}</p>

          {/* Message input */}
          {needsText && (
            <div>
              <label className="block text-[11px] font-medium text-ink-300 mb-1.5">
                {selectedType === 'takeover' ? 'Message text' : 'Message'}
              </label>
              <textarea
                ref={textareaRef}
                value={content}
                maxLength={500}
                rows={3}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What do you want to broadcast?"
                className="input w-full resize-none"
              />
              <div className="text-right text-[10px] text-ink-500 mt-1">{content.length}/500</div>
            </div>
          )}

          {/* URL input */}
          {needsUrl && (
            <div>
              <label className="block text-[11px] font-medium text-ink-300 mb-1.5">
                {selectedType === 'image' ? 'Image URL' : selectedType === 'sound' ? 'Audio URL' : 'Media URL (optional)'}
              </label>
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="input w-full"
              />
            </div>
          )}

          {/* Queue + cost */}
          <div className="flex items-center justify-between bg-ink-800/50 border border-white/[0.06] rounded-xl px-4 py-3">
            <div className="text-[12px]">
              {queueDepth === 0
                ? <span className="text-emerald-400">Queue clear · sends immediately</span>
                : <span className="text-accent-amber">{queueDepth} in queue</span>
              }
              {!isOwner && surgeMult > 1.0 && (
                <span className="text-rose-400 ml-2 text-[11px]">{surgeMult}× surge</span>
              )}
            </div>
            {isOwner ? (
              <div className="text-[12px] text-emerald-400 font-semibold">Free · Owner</div>
            ) : (
              <div className={`text-[13px] font-bold ${canAfford ? 'text-accent-amber' : 'text-rose-400'}`}>
                ✦ {finalCost} Sparks
              </div>
            )}
          </div>

          {/* Owner revenue hint — shown only to server owners */}
          {isOwner && (
            <div className="flex items-center gap-2 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl px-3 py-2.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" className="shrink-0">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
              <span className="text-[11px] text-emerald-400 leading-snug">
                You earn <span className="font-semibold">{OWNER_REVENUE_SHARE_PCT}%</span> of Sparks spent on member broadcasts in your space
              </span>
            </div>
          )}

          {/* Feedback messages */}
          {!canAfford && !error && (
            <p className="text-[12px] text-rose-400">Not enough Sparks — balance: {sparksBalance} ✦</p>
          )}
          {error   && <p className="text-[12px] text-rose-400">{error}</p>}
          {success && <p className="text-[12px] text-emerald-400">✓ {success}</p>}
        </div>

        {/* ── Footer actions (never scrolls away) ─ */}
        <div className="flex gap-2 px-5 pb-5 pt-3 border-t border-white/[0.07] shrink-0">
          <button onClick={close} className="btn btn-ghost flex-1">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !canAfford}
            className="btn btn-primary flex-[2]"
          >
            {sending ? 'Sending…' : `Send · ✦ ${finalCost}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {/* ── Trigger — amber labeled pill, visible in chat header ── */}
      <button
        onClick={() => { setOpen(true); setError(null); setSuccess(null); }}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-accent-amber/10 border border-accent-amber/25 text-accent-amber text-[12px] font-semibold hover:bg-accent-amber/[0.18] hover:border-accent-amber/40 transition-all duration-150 shrink-0"
        title="Send a space broadcast"
        aria-label="Send broadcast"
      >
        <span className="text-[10px] leading-none select-none">✦</span>
        <span>Broadcast</span>
      </button>
      {modal}
    </>
  );
}
