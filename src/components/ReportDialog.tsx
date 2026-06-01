import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => Promise<void>;
  /** Username of the person being reported, if targeting a user. */
  reportedUsername?: string;
};

const REASONS = [
  { value: 'spam', label: 'Spam', description: 'Repetitive, promotional, or flooding content' },
  { value: 'harassment', label: 'Harassment', description: 'Targeting, threatening, or bullying someone' },
  { value: 'hate_speech', label: 'Hate speech', description: 'Discrimination based on identity' },
  { value: 'nsfw', label: 'NSFW content', description: 'Explicit content in a non-appropriate channel' },
  { value: 'misinformation', label: 'Misinformation', description: 'Deliberately false or misleading claims' },
  { value: 'other', label: 'Other', description: 'Something else not listed above' },
] as const;

export function ReportDialog({ open, onClose, onSubmit, reportedUsername }: Props) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onSubmit(reason, note.trim());
      setDone(true);
    } catch (ex: any) {
      setErr(ex.message ?? 'submit failed');
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setReason('');
    setNote('');
    setErr('');
    setDone(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="panel w-[400px] rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
          <div>
            <div className="font-semibold text-sm">Report message</div>
            {reportedUsername && (
              <div className="text-[11px] text-ink-400">Reporting @{reportedUsername}</div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="btn-ghost h-7 w-7 grid place-items-center rounded-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center space-y-3">
            <div className="text-2xl">✅</div>
            <div className="text-sm font-medium text-ink-100">Report submitted</div>
            <div className="text-[12px] text-ink-400">The server owner will review it.</div>
            <button onClick={handleClose} className="btn-ghost text-[12px] px-4 py-1.5 rounded-lg mt-2">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-ink-300">Reason</div>
              <div className="space-y-1">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-colors
                      ${reason === r.value
                        ? 'border-accent-violet/40 bg-accent-violet/10'
                        : 'border-white/[0.06] hover:border-white/10 hover:bg-white/[0.03]'
                      }`}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="mt-0.5 accent-violet-500 shrink-0"
                    />
                    <div>
                      <div className="text-[12px] font-medium text-ink-100">{r.label}</div>
                      <div className="text-[11px] text-ink-400">{r.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-ink-300">
                Additional context <span className="text-ink-500">(optional, max 500 chars)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="Describe what happened…"
                rows={3}
                className="input w-full text-sm resize-none"
              />
              {note.length > 450 && (
                <div className="text-[10px] text-ink-500 text-right">{500 - note.length} chars left</div>
              )}
            </div>

            {err && <div className="text-[12px] text-rose-400">{err}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={handleClose} className="btn-ghost text-sm px-4 py-1.5 rounded-lg">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!reason || busy}
                className="btn-primary text-sm px-4 py-1.5 rounded-lg disabled:opacity-40"
              >
                {busy ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
