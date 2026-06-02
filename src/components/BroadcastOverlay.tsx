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
function ProgressBar({ duration }: { duration: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-2xl">
      <div
        className="h-full w-full bg-accent-violet/60 origin-left"
        style={{ animation: `bc-shrink ${duration}ms linear forwards` }}
      />
    </div>
  );
}

// ── Sender badge ──────────────────────────────────────────────────────────────
function SenderBadge({ name, cost, type }: { name: string; cost: number; type: string }) {
  const icon = type === 'sound' ? '♫' : type === 'image' ? '🖼' : type === 'takeover' ? '⚡' : '✦';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="pill bg-accent-violet/10 text-accent-violet border border-accent-violet/20">
        <span>{icon}</span>
        <span>Space Broadcast</span>
      </span>
      <span className="text-[11px] text-ink-400">
        by <span className="text-ink-200 font-medium">{name}</span>
      </span>
      {cost > 0 && (
        <span className="text-[11px] font-semibold text-accent-amber">✦ {cost}</span>
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
        <div className="relative rounded-2xl overflow-hidden bg-ink-900 border border-white/[0.09] shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.02)]">
          {/* Thin top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-violet/50 to-transparent" />
          {/* Left accent strip */}
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent-violet rounded-l-2xl" />

          <div className="pl-5 pr-4 pt-3.5 pb-3">
            <div className="flex items-start gap-3">
              {/* Icon tile */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm select-none border ${
                bc.type === 'sound'
                  ? 'bg-ink-800 border-white/[0.08] text-accent-teal'
                  : 'bg-accent-violet/10 border-accent-violet/20 text-accent-violet'
              }`}>
                {bc.type === 'sound' ? '♫' : '✦'}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <SenderBadge name={bc.senderName} cost={bc.sparkCost} type={bc.type} />
                {bc.contentText && (
                  <p className="mt-2 text-[14px] text-ink-100 font-medium leading-snug break-words">
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
                className="shrink-0 w-6 h-6 grid place-items-center rounded-lg text-ink-500 hover:text-ink-200 hover:bg-white/[0.06] transition-colors"
                aria-label="Dismiss"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <ProgressBar duration={duration} />
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
          background: visible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
          backdropFilter: visible ? 'blur(4px)' : 'blur(0px)',
          transition: 'background 0.4s ease, backdrop-filter 0.4s ease',
        }}
      >
        <div
          className="relative w-full max-w-lg rounded-2xl overflow-hidden bg-ink-900 border border-white/[0.09] shadow-[0_32px_80px_rgba(0,0,0,0.8)] pointer-events-auto"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.94)',
            transition: 'opacity 0.4s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-violet/50 to-transparent z-10" />

          {bc.contentUrl && (
            <img
              src={bc.contentUrl}
              alt="Broadcast"
              className="w-full max-h-[55vh] object-contain bg-ink-950/50"
            />
          )}

          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SenderBadge name={bc.senderName} cost={bc.sparkCost} type={bc.type} />
              {bc.contentText && (
                <p className="mt-1.5 text-[13px] text-ink-200 leading-snug">{bc.contentText}</p>
              )}
            </div>
            <button
              onClick={dismiss}
              className="btn btn-ghost shrink-0 text-[12px] px-3 py-1.5"
            >
              Dismiss
            </button>
          </div>

          <ProgressBar duration={duration} />
        </div>
      </div>
    );
  }

  // ── takeover — full-screen dramatic overlay ───────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center"
      style={{
        background: visible ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(12px) saturate(0.6)' : 'blur(0px)',
        transition: 'background 0.5s ease, backdrop-filter 0.5s ease',
      }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_50%_at_50%_40%,rgba(79,117,255,0.07)_0%,transparent_70%)]" />

      <div
        className="relative w-full max-w-xl mx-6 rounded-3xl overflow-hidden bg-ink-950/95 backdrop-blur-xl border border-white/[0.08] shadow-[0_40px_100px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.02)]"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.93)',
          transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* 2px dramatic top accent line — violet bleeding into teal */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-accent-violet to-accent-teal/60" />

        {bc.contentUrl && (
          <img
            src={bc.contentUrl}
            alt="Broadcast"
            className="w-full max-h-64 object-contain bg-ink-950/50"
          />
        )}

        <div className="px-8 py-7 text-center">
          {/* Icon tile */}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5 text-base select-none bg-accent-violet/10 border border-accent-violet/25 text-accent-violet shadow-[0_0_24px_rgba(79,117,255,0.15)]">
            ⚡
          </div>

          {bc.contentText && (
            <p className="text-xl font-semibold text-ink-100 leading-snug mb-4 break-words">
              {bc.contentText}
            </p>
          )}

          <div className="flex justify-center mb-6">
            <SenderBadge name={bc.senderName} cost={bc.sparkCost} type={bc.type} />
          </div>

          <button onClick={dismiss} className="btn btn-primary px-8">
            Dismiss
          </button>
        </div>

        <ProgressBar duration={duration} />
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
