import { useState } from 'react';
import { probeServer, setServerUrl, DEFAULT_SERVER_URL } from '../lib/serverUrl';

type Props = {
  onDone: () => void;
};

export function ServerSetup({ onDone }: Props) {
  // 'default' | 'custom' — which path the user is taking
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customUrl, setCustomUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probed, setProbed] = useState<{ name: string } | null>(null);

  async function connect(rawUrl: string) {
    let candidate = rawUrl.trim();
    if (!candidate) {
      setError('Enter a server URL');
      return;
    }
    if (!/^https?:\/\//i.test(candidate)) candidate = 'https://' + candidate;
    setLoading(true);
    setError(null);
    setProbed(null);
    const r = await probeServer(candidate);
    setLoading(false);
    if (!r.ok) {
      setError(`Could not reach ${candidate} — ${r.error}`);
      return;
    }
    setProbed({ name: r.name ?? 'recline' });
    setServerUrl(candidate);
    setTimeout(onDone, 500);
  }

  return (
    <div className="h-full w-full grid place-items-center bg-app-grad px-4">
      <div className="w-full max-w-[440px] space-y-3">

        {/* ── Brand header ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-accent-violet to-accent-rose grid place-items-center shadow-lg">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Recline</h1>
            <p className="text-xs text-ink-400">Choose a server to connect to</p>
          </div>
        </div>

        {/* ── Default server card ───────────────────────────────────────── */}
        <div
          className={`panel rounded-2xl p-4 cursor-pointer border-2 transition-all ${
            mode === 'default'
              ? 'border-accent-violet/60 bg-accent-violet/5'
              : 'border-white/5 hover:border-white/15'
          }`}
          onClick={() => { setMode('default'); setError(null); }}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-accent-violet flex-shrink-0 grid place-items-center">
              {mode === 'default' && (
                <div className="h-2.5 w-2.5 rounded-full bg-accent-violet" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-ink-100">Recline Official</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-violet bg-accent-violet/15 px-1.5 py-0.5 rounded-full">
                  Default
                </span>
              </div>
              <p className="text-xs text-ink-400 font-mono mt-0.5">{DEFAULT_SERVER_URL}</p>
              <p className="text-[11px] text-ink-300/70 mt-1.5 leading-relaxed">
                Managed by the Recline team. Encrypted at rest, zero logs. Best choice for most users.
              </p>
            </div>
          </div>
        </div>

        {/* ── Self-hosted card ──────────────────────────────────────────── */}
        <div
          className={`panel rounded-2xl border-2 transition-all ${
            mode === 'custom'
              ? 'border-accent-violet/60 bg-accent-violet/5'
              : 'border-white/5 hover:border-white/15'
          }`}
        >
          <div
            className="p-4 cursor-pointer"
            onClick={() => { setMode('custom'); setError(null); }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-ink-500 flex-shrink-0 grid place-items-center">
                {mode === 'custom' && (
                  <div className="h-2.5 w-2.5 rounded-full bg-accent-violet" />
                )}
              </div>
              <div>
                <span className="font-semibold text-sm text-ink-100">Self-hosted server</span>
                <p className="text-[11px] text-ink-300/70 mt-0.5 leading-relaxed">
                  Point the app at your own Recline instance.
                </p>
              </div>
            </div>
          </div>

          {/* Expanded input — only shows when custom mode active */}
          {mode === 'custom' && (
            <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">
                  Server URL
                </span>
                <input
                  autoFocus
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && connect(customUrl)}
                  className="input mt-1 font-mono text-[13px]"
                  placeholder="https://recline.yourdomain.com"
                  spellCheck={false}
                  autoCapitalize="none"
                />
                <span className="text-[11px] text-ink-300/60 mt-1 block">
                  Local dev: <span className="font-mono">http://localhost:4321</span>
                </span>
              </label>
            </div>
          )}
        </div>

        {/* ── Error / success feedback ──────────────────────────────────── */}
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/25 border border-rose-900/40 rounded-xl px-3 py-2.5">
            {error}
          </div>
        )}
        {probed && (
          <div className="text-emerald-300 text-xs bg-emerald-900/20 border border-emerald-900/30 rounded-xl px-3 py-2.5">
            Connected to <span className="font-semibold">{probed.name}</span>. Opening…
          </div>
        )}

        {/* ── Connect button ────────────────────────────────────────────── */}
        <button
          className="btn-primary w-full !py-2.5 text-sm font-semibold"
          disabled={loading || !!probed}
          onClick={() =>
            mode === 'default'
              ? connect(DEFAULT_SERVER_URL)
              : connect(customUrl)
          }
        >
          {loading
            ? 'Connecting…'
            : mode === 'default'
            ? `Connect to service.recline.social`
            : 'Connect'}
        </button>

        <p className="text-center text-[11px] text-ink-400/60 leading-relaxed pt-1">
          Your keys, messages, and passphrases never leave the server you choose.
        </p>
      </div>
    </div>
  );
}
