type Props = { onCreate: () => void; onJoin: () => void };

export function Welcome({ onCreate, onJoin }: Props) {
  return (
    <div className="flex-1 grid place-items-center bg-app-grad">
      <div className="text-center max-w-md px-6">
        <div className="mx-auto h-16 w-16 mb-5 rounded-2xl bg-gradient-to-br from-accent-violet to-accent-rose grid place-items-center shadow-glow">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">Welcome to Recline.</h2>
        <p className="text-sm text-ink-300 leading-relaxed mb-6">
          A quiet, private place for people you actually trust. Messages encrypt in your browser before
          they leave your device. Calls are peer-to-peer. No ads, no tracking, no paywalls.
        </p>
        <div className="flex gap-2 justify-center">
          <button className="btn-primary" onClick={onCreate}>
            Create a Space
          </button>
          <button className="btn-ghost border border-white/10" onClick={onJoin}>
            Join with invite
          </button>
        </div>
      </div>
    </div>
  );
}
