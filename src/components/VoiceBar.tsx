import { playCallSound } from '../lib/callSounds';

type Props = {
  channelName: string;
  micOn: boolean;
  onToggleMic: () => void;
  deafOn: boolean;
  onToggleDeafen: (v: boolean) => void;
  onLeave: () => void;
  onReturn: () => void;
};

export function VoiceBar({ channelName, micOn, onToggleMic, deafOn, onToggleDeafen, onLeave, onReturn }: Props) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 min-h-[48px] sm:min-h-0 bg-emerald-500/[0.08] border-b border-emerald-500/20">
      {/* status */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      <span className="text-[12px] text-emerald-300 font-medium truncate">
        Voice · #{channelName}
      </span>

      <div className="flex-1" />

      {/* mic toggle */}
      <button
        onClick={onToggleMic}
        title={micOn ? 'Mute' : 'Unmute'}
        className={`h-9 w-9 sm:h-7 sm:w-7 rounded-lg grid place-items-center transition-colors border ${
          micOn
            ? 'bg-ink-700/60 border-white/[0.08] text-ink-300 hover:text-ink-100'
            : 'bg-rose-500/15 border-rose-500/20 text-rose-300'
        }`}
      >
        {micOn ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M19 10a7 7 0 0 1-14 0M12 19v3" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9V5a3 3 0 0 0-5.94-.6" />
            <path d="M19 10a7 7 0 0 1-.11 1.23M12 19v3" />
          </svg>
        )}
      </button>

      {/* deafen toggle */}
      <button
        onClick={() => {
          const next = !deafOn;
          onToggleDeafen(next);
          playCallSound(next ? 'deafen' : 'undeafen');
        }}
        title={deafOn ? 'Undeafen' : 'Deafen'}
        className={`h-9 w-9 sm:h-7 sm:w-7 rounded-lg grid place-items-center transition-colors border ${
          deafOn
            ? 'bg-rose-500/15 border-rose-500/20 text-rose-300'
            : 'bg-ink-700/60 border-white/[0.08] text-ink-300 hover:text-ink-100'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
          <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      </button>

      {/* return to call */}
      <button
        onClick={onReturn}
        title="Return to call"
        className="h-9 sm:h-7 px-3 sm:px-2.5 rounded-lg text-[12px] sm:text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
      >
        Return
      </button>

      {/* leave */}
      <button
        onClick={onLeave}
        title="Leave call"
        className="h-9 sm:h-7 px-3 sm:px-2.5 rounded-lg text-[12px] sm:text-[11px] font-medium text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
      >
        Leave
      </button>
    </div>
  );
}
