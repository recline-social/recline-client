import { useState } from 'react';
import { api } from '../lib/api';

type Kind = 'feedback' | 'bug' | 'feature';

const KINDS: { id: Kind; label: string; icon: React.ReactNode; placeholder: string }[] = [
  {
    id: 'feedback',
    label: 'General feedback',
    placeholder: 'What worked? What confused you? What did you expect?',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    id: 'bug',
    label: 'Report a bug',
    placeholder: 'What happened? What did you expect to happen? Steps to reproduce?',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2h8M9 2v3M15 2v3M20 8l-2-2-2 2M4 8l2-2 2 2M12 8v13M8 21H4a2 2 0 0 1-2-2v-5a7 7 0 0 1 7-7h6a7 7 0 0 1 7 7v5a2 2 0 0 1-2 2h-4"/>
      </svg>
    ),
  },
  {
    id: 'feature',
    label: 'Suggest a feature',
    placeholder: "What would make Recline more useful for you or your community?",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
];

type FeedbackButtonProps = {
  /** Controlled open state — opened from the user menu in ServerRail. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeedbackButton({ open, onOpenChange }: FeedbackButtonProps) {
  const [kind, setKind] = useState<Kind>('feedback');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setText('');
    setKind('feedback');
    setSent(false);
    setError(null);
  }

  function close() {
    onOpenChange(false);
    setTimeout(reset, 300);
  }

  async function submit() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.submitFeedback({ kind, body: text.trim() });
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send feedback');
    } finally {
      setLoading(false);
    }
  }

  const selectedKind = KINDS.find((k) => k.id === kind)!;

  return (
    <>
      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="w-full max-w-md panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div>
                <h2 className="text-sm font-semibold">Open Beta feedback</h2>
                <p className="text-[11px] text-ink-400 mt-0.5">Help shape Recline — every note matters</p>
              </div>
              <button onClick={close} className="btn-ghost h-7 w-7 grid place-items-center rounded-lg text-ink-400">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {sent ? (
              <div className="px-5 py-8 text-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-emerald-500/15 grid place-items-center mx-auto mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </div>
                <p className="text-sm font-medium">Got it — thank you.</p>
                <p className="text-xs text-ink-400">We read every submission and use it to prioritise what to fix first.</p>
                <button onClick={close} className="btn-primary text-sm mt-4 px-6 py-2">Close</button>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                {/* Kind selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setKind(k.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-medium transition-all border ${
                        kind === k.id
                          ? 'bg-accent-violet/15 border-accent-violet/40 text-accent-violet'
                          : 'bg-white/[0.03] border-white/5 text-ink-300 hover:border-white/10 hover:text-ink-100'
                      }`}
                    >
                      {k.icon}
                      {k.label}
                    </button>
                  ))}
                </div>

                {/* Text area */}
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder={selectedKind.placeholder}
                  className="input resize-none text-sm leading-relaxed h-28"
                  maxLength={2000}
                />

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-ink-500">{text.length}/2000 · ⌘↵ to send</span>
                  {error && <span className="text-[11px] text-rose-400">{error}</span>}
                  <button
                    onClick={submit}
                    disabled={!text.trim() || loading}
                    className="btn-primary text-sm px-4 py-1.5 disabled:opacity-40"
                  >
                    {loading ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
