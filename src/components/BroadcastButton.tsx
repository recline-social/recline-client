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

type Props = {
  serverId: string;
  sparksBalance: number;
  socket: Socket | null;
};

export function BroadcastButton({ serverId, sparksBalance, socket }: Props) {
  const [open, setOpen]               = useState(false);
  const [selectedType, setSelectedType] = useState('text');
  const [content, setContent]         = useState('');
  const [url, setUrl]                 = useState('');
  const [queueDepth, setQueueDepth]   = useState(0);
  const [surgeMult, setSurgeMult]     = useState(1.0);
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const textareaRef                   = useRef<HTMLTextAreaElement>(null);
  const inputRef                      = useRef<HTMLInputElement>(null);

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
      style={{
        position: 'fixed', inset: 0,
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Modal card */}
      <div
        style={{
          width: '100%', maxWidth: '440px',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(160deg, #130b28 0%, #0d0d17 100%)',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: '20px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.08), 0 0 60px rgba(139,92,246,0.06)',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em',
              background: 'linear-gradient(90deg,#fbbf24,#f59e0b)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              ✦ Space Broadcast
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
              Flash a message to everyone watching right now
            </div>
          </div>
          <button
            onClick={close}
            style={{
              width: 32, height: 32, display: 'grid', placeItems: 'center',
              borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
            aria-label="Close"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>

          {/* Type selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '12px' }}>
            {TYPES.map((t) => {
              const sel = selectedType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelectedType(t.id); setError(null); setSuccess(null); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '12px 6px',
                    borderRadius: '14px',
                    background: sel ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.04)',
                    border: sel ? '1.5px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    color: sel ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: sel ? '0 0 16px rgba(139,92,246,0.12)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{t.icon}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: '9px', opacity: 0.55 }}>✦ {Math.round(t.cost * surgeMult)}</span>
                </button>
              );
            })}
          </div>

          {/* Description */}
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px', lineHeight: 1.5 }}>
            {selected.desc}
          </p>

          {/* Message input */}
          {needsText && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                {selectedType === 'takeover' ? 'Message text' : 'Message'}
              </label>
              <textarea
                ref={textareaRef}
                value={content}
                maxLength={500}
                rows={3}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What do you want to broadcast?"
                style={{
                  width: '100%', resize: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '13px', color: 'rgba(255,255,255,0.9)',
                  lineHeight: 1.55,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.55)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
              <div style={{ textAlign: 'right', fontSize: '10px', color: 'rgba(255,255,255,0.22)', marginTop: '3px' }}>
                {content.length}/500
              </div>
            </div>
          )}

          {/* URL input */}
          {needsUrl && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                {selectedType === 'image' ? 'Image URL' : selectedType === 'sound' ? 'Audio URL' : 'Media URL (optional)'}
              </label>
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '13px', color: 'rgba(255,255,255,0.9)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.55)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>
          )}

          {/* Queue + cost */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: '12px', marginBottom: '10px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
              {queueDepth === 0
                ? <span style={{ color: '#34d399' }}>🟢 Queue clear — sends immediately</span>
                : <span style={{ color: '#fbbf24' }}>⏳ {queueDepth} in queue</span>
              }
              {surgeMult > 1.0 && (
                <span style={{ color: '#f87171', marginLeft: 8, fontSize: '11px' }}>{surgeMult}× surge</span>
              )}
            </div>
            <div style={{
              fontSize: '13px', fontWeight: 700,
              background: canAfford ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#f87171,#ef4444)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              ✦ {finalCost} Sparks
            </div>
          </div>

          {/* Feedback messages */}
          {!canAfford && !error && (
            <p style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px' }}>
              Not enough Sparks — balance: {sparksBalance} ✦
            </p>
          )}
          {error   && <p style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px' }}>{error}</p>}
          {success && <p style={{ fontSize: '11px', color: '#34d399', marginBottom: '8px' }}>✓ {success}</p>}
        </div>

        {/* ── Footer actions (never scrolls away) ─ */}
        <div style={{
          display: 'flex', gap: '8px',
          padding: '14px 20px 18px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <button
            onClick={close}
            style={{
              flex: 1, padding: '11px 0', borderRadius: '12px', fontSize: '13px',
              fontWeight: 500, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.45)', transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !canAfford}
            style={{
              flex: 2, padding: '11px 0', borderRadius: '12px', fontSize: '13px',
              fontWeight: 700, cursor: sending || !canAfford ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.32) 0%, rgba(34,211,238,0.2) 100%)',
              border: '1.5px solid rgba(139,92,246,0.4)',
              color: '#c4b5fd', opacity: sending || !canAfford ? 0.4 : 1,
              transition: 'all 0.15s',
              fontFamily: 'inherit',
              boxShadow: !sending && canAfford ? '0 0 20px rgba(139,92,246,0.15)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!sending && canAfford) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg,rgba(139,92,246,0.42) 0%,rgba(34,211,238,0.28) 100%)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg,rgba(139,92,246,0.32) 0%,rgba(34,211,238,0.2) 100%)';
            }}
          >
            {sending ? 'Sending…' : `Send Broadcast · ✦ ${finalCost}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); setSuccess(null); }}
        style={{
          width: 32, height: 32, display: 'grid', placeItems: 'center',
          borderRadius: '10px', background: 'transparent',
          border: '1px solid transparent', cursor: 'pointer',
          color: 'rgba(251,191,36,0.65)', transition: 'all 0.15s', flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#fbbf24';
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.1)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(251,191,36,0.2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(251,191,36,0.65)';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
        }}
        title="Send a space broadcast"
        aria-label="Send broadcast"
      >
        <span style={{ fontSize: '14px', lineHeight: 1, userSelect: 'none' }}>✦</span>
      </button>
      {modal}
    </>
  );
}
