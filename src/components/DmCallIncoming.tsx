import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { Avatar } from './Avatar';

type Props = {
  callerUserId: string;
  callerName: string;
  callerAvatarUrl: string | null;
  hasVideo: boolean;
  onAccept: (withVideo: boolean) => void;
  onDecline: () => void;
};

export function DmCallIncoming({ callerUserId, callerName, callerAvatarUrl, hasVideo, onAccept, onDecline }: Props) {
  const declineRef = useRef<HTMLButtonElement>(null);

  // Pulse animation via CSS — no audio ring sound added (can extend later)
  useEffect(() => {
    declineRef.current?.focus();
    return () => {};
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
    >
      <div className="bg-ink-900 border border-white/[0.09] rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-5 w-72 animate-fade-up">
        {/* Pulsing ring around avatar */}
        <div className="relative">
          <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-accent-violet" />
          <Avatar name={callerName} id={callerUserId} size="lg" imageUrl={callerAvatarUrl} />
        </div>

        <div className="text-center">
          <p className="text-ink-100 font-semibold text-base leading-tight">{callerName}</p>
          <p className="text-ink-300 text-sm mt-1">
            Incoming {hasVideo ? 'video' : 'voice'} call…
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {hasVideo ? (
              <svg className="text-accent-violet" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/>
                <rect x="3" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
              <svg className="text-accent-violet" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.62 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.12 4.18 2 2 0 0 1 5.09 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l.46-.46a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 18v-.08z"/>
              </svg>
            )}
            <span className="text-accent-violet text-[11px] font-medium">
              {hasVideo ? 'Video call' : 'Voice call'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full">
          {/* Decline */}
          <button
            ref={declineRef}
            onClick={onDecline}
            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25 transition-colors font-medium text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Decline
          </button>

          {/* Accept audio */}
          <button
            onClick={() => onAccept(false)}
            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors font-medium text-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.62 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.12 4.18 2 2 0 0 1 5.09 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l.46-.46a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 18v-.08z"/>
            </svg>
            Answer
          </button>

          {/* Accept video — only shown if caller wants video */}
          {hasVideo && (
            <button
              onClick={() => onAccept(true)}
              className="flex items-center justify-center gap-2 h-11 px-3 rounded-xl bg-accent-violet/15 text-accent-violet border border-accent-violet/20 hover:bg-accent-violet/25 transition-colors font-medium text-sm"
              title="Answer with camera"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/>
                <rect x="3" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
