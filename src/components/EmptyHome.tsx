type Props = {
  onCreateServer: () => void;
  onJoinServer: () => void;
};

export function EmptyHome({ onCreateServer, onJoinServer }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-app-grad px-6 py-12">

      {/* Logo mark */}
      <div
        className="h-16 w-16 rounded-2xl grid place-items-center mb-6 shrink-0"
        style={{
          background: 'linear-gradient(135deg, #7EC4D4 0%, #5BBFD0 100%)',
          boxShadow: '0 8px 32px -8px rgba(126,196,212,0.45)',
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      {/* Wordmark */}
      <h1
        className="text-3xl font-semibold tracking-tight mb-2"
        style={{
          background: 'linear-gradient(135deg, #EDE8F4 0%, #a8b8c8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Recline
      </h1>

      {/* Tagline */}
      <p className="text-[11px] text-ink-400 tracking-widest uppercase mb-10 font-medium">
        Private.&nbsp; Encrypted.&nbsp; Yours.
      </p>

      {/* CTA cards */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">

        {/* Create a server */}
        <button
          onClick={onCreateServer}
          className="group flex-1 flex flex-col items-center gap-3 rounded-2xl px-5 py-6 transition-all duration-200"
          style={{
            background: 'rgba(126,196,212,0.07)',
            border: '1px solid rgba(126,196,212,0.18)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = 'rgba(126,196,212,0.13)';
            el.style.borderColor = 'rgba(126,196,212,0.32)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = 'rgba(126,196,212,0.07)';
            el.style.borderColor = 'rgba(126,196,212,0.18)';
          }}
        >
          <div
            className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
            style={{
              background: 'rgba(126,196,212,0.16)',
              border: '1px solid rgba(126,196,212,0.25)',
            }}
          >
            {/* Plus-circle icon */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#7EC4D4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-200 group-hover:scale-110"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold text-ink-100 mb-1">Create a Space</div>
            <div className="text-[11px] text-ink-400 leading-relaxed">
              Start a private space for your community
            </div>
          </div>
        </button>

        {/* Join a server */}
        <button
          onClick={onJoinServer}
          className="group flex-1 flex flex-col items-center gap-3 rounded-2xl px-5 py-6 transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = 'rgba(255,255,255,0.06)';
            el.style.borderColor = 'rgba(255,255,255,0.16)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = 'rgba(255,255,255,0.03)';
            el.style.borderColor = 'rgba(255,255,255,0.09)';
          }}
        >
          <div
            className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            {/* Arrow-into-box / enter icon */}
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ink-300 transition-all duration-200 group-hover:text-ink-100 group-hover:scale-110"
            >
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold text-ink-100 mb-1">Join a Space</div>
            <div className="text-[11px] text-ink-400 leading-relaxed">
              Enter an invite code to join an existing Space
            </div>
          </div>
        </button>

      </div>

      {/* E2E encryption note */}
      <div className="flex items-center gap-2 mt-10 text-ink-500 text-[11px]">
        {/* Lock icon */}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>Your messages are end-to-end encrypted</span>
      </div>

    </div>
  );
}
