import { useEffect, useRef, useState } from 'react';

export type BroadcastPayload = {
  id: string;
  type: string;
  contentText?: string;
  contentUrl?: string;
  senderName: string;
  sparkCost: number;
};

const AUTO_DISMISS: Record<string, number> = {
  text:     7000,
  image:    12000,
  sound:    8000,
  takeover: 10000,
};

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ duration, color }: { duration: number; color: string }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-2xl">
      <div
        style={{
          height: '100%',
          background: color,
          width: '100%',
          transformOrigin: 'left',
          animation: `bc-shrink ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

// ── Sender badge ──────────────────────────────────────────────────────────────
function SenderBadge({ name, cost, type }: { name: string; cost: number; type: string }) {
  const icon = type === 'sound' ? '♫' : type === 'image' ? '🖼' : type === 'takeover' ? '⚡' : '✦';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{
          background: 'rgba(139,92,246,0.18)',
          border: '1px solid rgba(139,92,246,0.28)',
          color: '#c4b5fd',
        }}
      >
        <span>{icon}</span>
        <span>Space Broadcast</span>
      </div>
      <span className="text-[11px] text-white/50">by <span className="text-white/75 font-medium">{name}</span></span>
      {cost > 0 && (
        <span
          className="text-[11px] font-semibold"
          style={{
            background: 'linear-gradient(90deg,#fbbf24,#f59e0b)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          ✦ {cost}
        </span>
      )}
    </div>
  );
}

// ── Individual broadcast renderer ─────────────────────────────────────────────
function BroadcastItem({ bc, onDone }: { bc: BroadcastPayload; onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = AUTO_DISMISS[bc.type] ?? 7000;

  useEffect(() => {
    // Small delay so CSS transition fires
    const raf = requestAnimationFrame(() => setTimeout(() => setVisible(true), 16));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 400);
    }, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bc.id]);

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(onDone, 400);
  }

  // ── text / sound — notification toast bottom-right ───────────────────────
  if (bc.type === 'text' || bc.type === 'sound') {
    return (
      <div
        className="fixed bottom-6 right-5 z-[150] w-full max-w-sm pointer-events-auto"
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease',
        }}
      >
        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #0f0a1e 0%, #0d0d16 100%)',
            border: '1px solid rgba(139,92,246,0.3)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.07), 0 0 40px rgba(139,92,246,0.06)',
          }}
        >
          {/* Accent glow top edge */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.6) 50%, transparent 100%)' }}
          />

          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base select-none"
                style={{
                  background: 'linear-gradient(135deg,rgba(139,92,246,0.25),rgba(34,211,238,0.15))',
                  border: '1px solid rgba(139,92,246,0.3)',
                  color: bc.type === 'sound' ? '#22d3ee' : '#a78bfa',
                }}
              >
                {bc.type === 'sound' ? '♫' : '✦'}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <SenderBadge name={bc.senderName} cost={bc.sparkCost} type={bc.type} />
                {bc.contentText && (
                  <p className="mt-2 text-[14px] text-white/90 font-medium leading-snug break-words">
                    {bc.contentText}
                  </p>
                )}
                {bc.type === 'sound' && bc.contentUrl && (
                  <audio
                    src={bc.contentUrl}
                    autoPlay
                    className="w-full mt-2 h-8 rounded-lg"
                    style={{ filter: 'invert(0.85) hue-rotate(225deg)' }}
                  />
                )}
              </div>

              {/* Dismiss */}
              <button
                onClick={dismiss}
                className="shrink-0 w-6 h-6 grid place-items-center rounded-lg text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                aria-label="Dismiss"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <ProgressBar duration={duration} color="rgba(139,92,246,0.6)" />
        </div>
      </div>
    );
  }

  // ── image — centred floating card ────────────────────────────────────────
  if (bc.type === 'image') {
    return (
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-6 pointer-events-none"
        style={{
          background: visible ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
          backdropFilter: visible ? 'blur(3px)' : 'blur(0px)',
          transition: 'background 0.4s ease, backdrop-filter 0.4s ease',
        }}
      >
        <div
          className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl pointer-events-auto"
          style={{
            background: 'linear-gradient(160deg,#0f0a1e 0%,#0d0d16 100%)',
            border: '1px solid rgba(139,92,246,0.28)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(139,92,246,0.08)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.94)',
            transition: 'opacity 0.4s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg,transparent,rgba(139,92,246,0.6),transparent)' }}
          />

          {bc.contentUrl && (
            <div className="relative">
              <img
                src={bc.contentUrl}
                alt="Broadcast"
                className="w-full max-h-[55vh] object-contain"
                style={{ background: 'rgba(0,0,0,0.3)' }}
              />
            </div>
          )}

          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SenderBadge name={bc.senderName} cost={bc.sparkCost} type={bc.type} />
              {bc.contentText && (
                <p className="mt-1.5 text-[13px] text-white/80 leading-snug">{bc.contentText}</p>
              )}
            </div>
            <button
              onClick={dismiss}
              className="shrink-0 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              Dismiss
            </button>
          </div>

          <ProgressBar duration={duration} color="rgba(139,92,246,0.5)" />
        </div>
      </div>
    );
  }

  // ── takeover — full-screen dramatic overlay ───────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center"
      style={{
        background: visible ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(12px) saturate(0.6)' : 'blur(0px)',
        transition: 'background 0.5s ease, backdrop-filter 0.5s ease',
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: visible
            ? 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(139,92,246,0.12) 0%, transparent 70%)'
            : 'none',
          transition: 'background 0.5s ease',
        }}
      />

      <div
        className="relative w-full max-w-xl mx-6 rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(160deg,rgba(18,10,38,0.99) 0%,rgba(11,11,20,0.99) 100%)',
          border: '1px solid rgba(139,92,246,0.32)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.85), 0 0 80px rgba(139,92,246,0.1)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.93)',
          transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Top accent line */}
        <div
          className="h-[2px] w-full"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(139,92,246,0.8),rgba(34,211,238,0.5),transparent)' }}
        />

        {bc.contentUrl && (
          <img
            src={bc.contentUrl}
            alt="Broadcast"
            className="w-full max-h-64 object-contain"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          />
        )}

        <div className="px-8 py-7 text-center">
          {/* ✦ glyph */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5 text-base select-none"
            style={{
              background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.18))',
              border: '1px solid rgba(139,92,246,0.4)',
              color: '#a78bfa',
              boxShadow: '0 0 24px rgba(139,92,246,0.2)',
            }}
          >
            ⚡
          </div>

          {bc.contentText && (
            <p className="text-xl font-semibold text-white/95 leading-snug mb-4 break-words">
              {bc.contentText}
            </p>
          )}

          <div className="flex justify-center mb-6">
            <SenderBadge name={bc.senderName} cost={bc.sparkCost} type={bc.type} />
          </div>

          <button
            onClick={dismiss}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'rgba(139,92,246,0.2)',
              border: '1px solid rgba(139,92,246,0.35)',
              color: '#c4b5fd',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.32)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.2)'; }}
          >
            Dismiss
          </button>
        </div>

        <ProgressBar duration={duration} color="rgba(139,92,246,0.7)" />
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
type Props = { queue: BroadcastPayload[]; onDequeue: () => void };

export function BroadcastOverlay({ queue, onDequeue }: Props) {
  const current = queue[0] ?? null;
  if (!current) return null;
  return <BroadcastItem key={current.id} bc={current} onDone={onDequeue} />;
}
