import { useEffect, useRef, useState } from 'react';
import { api, setToken } from '../lib/api';
import { deriveAuthKey, generateAuthSalt } from '../lib/crypto';
import type { User } from '../types';

// Site key is PUBLIC — baked in at Vite build time. Empty string → widget disabled.
const TS_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type Props = { onAuthed: (user: User, password: string) => void };

type Screen =
  | 'main'          // login / signup form
  | 'backup-codes'  // shown once after signup
  | 'totp'          // TOTP code entry during login
  | 'reset';        // password reset via backup code

// ── tiny helper ───────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">
      {children}
    </span>
  );
}

// ── Backup codes display (shown once, must be saved) ─────────────────────────
function BackupCodesScreen({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const copyAll = () => {
    navigator.clipboard.writeText(codes.join('\n')).catch(() => {});
  };

  return (
    <div className="w-[420px] panel rounded-3xl p-7 shadow-soft space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/30 grid place-items-center text-amber-400 flex-shrink-0 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div>
          <h2 className="font-semibold text-ink-100">Save your backup codes</h2>
          <p className="text-xs text-ink-300 mt-1 leading-relaxed">
            These are your <strong className="text-ink-200">only</strong> way back in if you forget your password or lose access to your authenticator.
            Store them somewhere safe. <strong className="text-amber-400">They won't be shown again.</strong>
          </p>
        </div>
      </div>

      <div className="bg-ink-900/60 border border-white/5 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-2">
          {codes.map((code) => (
            <span key={code} className="font-mono text-sm text-ink-100 bg-ink-800/60 rounded-lg px-3 py-1.5 text-center tracking-widest select-all">
              {code}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={copyAll}
        className="w-full text-xs text-ink-300 hover:text-ink-100 border border-white/10 hover:border-white/20 rounded-xl py-2 transition-colors"
      >
        Copy all codes
      </button>

      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-ink-800 accent-violet-500 cursor-pointer"
        />
        <span className="text-xs text-ink-300">I've saved these codes in a safe place</span>
      </label>

      <button
        onClick={onDone}
        disabled={!confirmed}
        className="btn-primary w-full !py-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue to Recline
      </button>
    </div>
  );
}

// ── TOTP challenge screen ─────────────────────────────────────────────────────
function TotpScreen({
  pendingToken,
  onSuccess,
  onBack,
}: {
  pendingToken: string;
  onSuccess: (token: string, user: { id: string; username: string; displayName: string }) => void;
  onBack: () => void;
}) {
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setUseBackup((v) => !v);
    setCode('');
    setError(null);
  }

  // TOTP: exactly 6 digits. Backup: up to 9 chars (XXXX-XXXX format).
  const isReady = useBackup
    ? /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code)
    : /^\d{6}$/.test(code);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.login2fa({ pending_token: pendingToken, code });
      onSuccess(r.token, r.user);
    } catch (err: any) {
      // pending_token is single-use — a failed attempt means a fresh login is required
      setError((err?.message ?? 'Invalid code') + '. Please log in again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-[380px] panel rounded-3xl p-7 shadow-soft space-y-5">
      <div>
        <h2 className="font-semibold text-ink-100">Two-factor authentication</h2>
        <p className="text-xs text-ink-300 mt-1">
          {useBackup
            ? 'Enter one of your 8-character backup codes (XXXX-XXXX).'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <FieldLabel>{useBackup ? 'Backup code' : 'Authenticator code'}</FieldLabel>
          {useBackup ? (
            <input
              key="backup"
              autoFocus
              autoComplete="off"
              className="input mt-1 text-center font-mono tracking-widest uppercase"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^A-Z0-9-]/gi, '').toUpperCase().slice(0, 9))
              }
              placeholder="XXXX-XXXX"
              maxLength={9}
              required
            />
          ) : (
            <input
              key="totp"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input mt-1 text-center font-mono tracking-[0.3em] text-lg"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              required
            />
          )}
        </label>
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <button type="submit" className="btn-primary w-full !py-2" disabled={loading || !isReady}>
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleToggle}
          className="w-full text-xs text-ink-300 hover:text-ink-100 transition-colors"
        >
          {useBackup ? '← Use authenticator code instead' : "Lost your phone? Use a backup code →"}
        </button>
        <button onClick={onBack} className="w-full text-xs text-ink-300/60 hover:text-ink-300 transition-colors">
          ← Back to login
        </button>
      </div>
    </div>
  );
}

// ── Reset password via backup code ────────────────────────────────────────────
function ResetScreen({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.resetPassword({
        username: username.trim().toLowerCase(),
        backupCode: backupCode.trim().toUpperCase(),
        newPassword,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="w-[380px] panel rounded-3xl p-7 shadow-soft space-y-4">
        <div className="flex items-center gap-2 text-green-400">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span className="font-semibold">Password updated</span>
        </div>
        <p className="text-xs text-ink-300">
          All other sessions have been signed out. If you had two-factor authentication enabled, it has been
          disabled — you can re-enable it after logging in.
        </p>
        <button onClick={onBack} className="btn-primary w-full !py-2">Back to login</button>
      </div>
    );
  }

  return (
    <div className="w-[380px] panel rounded-3xl p-7 shadow-soft space-y-5">
      <div>
        <h2 className="font-semibold text-ink-100">Reset password</h2>
        <p className="text-xs text-ink-300 mt-1">Use one of your backup codes to set a new password.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <FieldLabel>Username</FieldLabel>
          <input
            autoFocus
            autoComplete="username"
            className="input mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <FieldLabel>Backup code</FieldLabel>
          <input
            className="input mt-1 font-mono tracking-widest uppercase"
            placeholder="XXXX-XXXX"
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <FieldLabel>New password</FieldLabel>
          <input
            type="password"
            autoComplete="new-password"
            className="input mt-1"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <button type="submit" className="btn-primary w-full !py-2" disabled={loading}>
          {loading ? 'Working…' : 'Reset password'}
        </button>
      </form>

      <button onClick={onBack} className="w-full text-xs text-ink-300 hover:text-ink-100 transition-colors">
        ← Back to login
      </button>
    </div>
  );
}

// ── Main auth shell ───────────────────────────────────────────────────────────
export function Auth({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [screen, setScreen] = useState<Screen>('main');

  // form fields
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  // post-signup state
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [pendingSessionToken, setPendingSessionToken] = useState('');

  // totp state
  const [pendingTotpToken, setPendingTotpToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Cloudflare Turnstile ─────────────────────────────────────────────────────
  const tsContainerRef = useRef<HTMLDivElement>(null);
  const tsWidgetIdRef = useRef<string | null>(null);
  const [tsToken, setTsToken] = useState('');

  useEffect(() => {
    if (!TS_SITE_KEY) return; // no site key — widget disabled (local dev / self-hosted)
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    function renderWidget() {
      if (cancelled || !tsContainerRef.current || !window.turnstile) return;
      // Remove any previously rendered widget in this container
      if (tsWidgetIdRef.current != null) {
        try { window.turnstile!.remove(tsWidgetIdRef.current); } catch {}
        tsWidgetIdRef.current = null;
      }
      tsWidgetIdRef.current = window.turnstile.render(tsContainerRef.current, {
        sitekey: TS_SITE_KEY,
        callback: (token: string) => { if (!cancelled) setTsToken(token); },
        'expired-callback': () => { if (!cancelled) setTsToken(''); },
        'error-callback': () => { if (!cancelled) setTsToken(''); },
        theme: 'dark',
        size: 'normal',
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      // Script is async/defer — poll until it's ready
      pollInterval = setInterval(() => {
        if (window.turnstile) {
          if (pollInterval) clearInterval(pollInterval);
          renderWidget();
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (tsWidgetIdRef.current != null) {
        try { window.turnstile?.remove(tsWidgetIdRef.current); } catch {}
        tsWidgetIdRef.current = null;
      }
      setTsToken('');
    };
  // Re-render the widget whenever the mode changes (login ↔ signup) so we get a fresh token
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function resetTurnstile() {
    if (tsWidgetIdRef.current != null) {
      try { window.turnstile?.reset(tsWidgetIdRef.current); } catch {}
    }
    setTsToken('');
  }

  // Submit is gated by the Turnstile token when the site key is configured
  const tsRequired = !!TS_SITE_KEY;
  const tsReady = !tsRequired || !!tsToken;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tsReady) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        // Zero-knowledge: derive auth key client-side before sending.
        // The raw password never leaves this device.
        const authSalt = generateAuthSalt();
        const authDerivedKey = await deriveAuthKey(password, authSalt);
        const r = await api.signup({
          username,
          authKdfSalt: authSalt,
          authDerivedKey,
          displayName: displayName || undefined,
          cfTurnstileResponse: tsToken || undefined,
        });
        // Park the session token — only give it to the app after user saves codes
        setPendingSessionToken(r.token);
        setPendingUser(r.user);
        setBackupCodes(r.backupCodes);
        setScreen('backup-codes');
      } else {
        // Zero-knowledge login: fetch auth version + salt first.
        // v2 users: derive key locally, send derived key (never raw password).
        // v1 legacy users: send raw password once — server migrates them to v2.
        const saltInfo = await api.getAuthSalt(username);
        const authPassword = (saltInfo.version === 'v2' && saltInfo.salt)
          ? await deriveAuthKey(password, saltInfo.salt)
          : password;
        const r = await api.login({
          username,
          password: authPassword,
          cfTurnstileResponse: tsToken || undefined,
        });
        if (r.totp_required) {
          setPendingTotpToken(r.pending_token);
          setScreen('totp');
        } else {
          setToken(r.token, remember);
          onAuthed(r.user, password);
          setPassword('');
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong');
      // Token is single-use — always reset on failure
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  }

  // ── Routing by screen ────────────────────────────────────────────────────
  if (screen === 'backup-codes' && pendingUser) {
    return (
      <div className="h-full w-full grid place-items-center bg-app-grad">
        <BackupCodesScreen
          codes={backupCodes}
          onDone={() => {
            setToken(pendingSessionToken, remember);
            onAuthed(pendingUser, password);
            setPassword('');
          }}
        />
      </div>
    );
  }

  if (screen === 'totp') {
    return (
      <div className="h-full w-full grid place-items-center bg-app-grad">
        <TotpScreen
          pendingToken={pendingTotpToken}
          onSuccess={(token, user) => {
            setToken(token, remember);
            onAuthed(user, password);
            setPassword('');
          }}
          onBack={() => {
            setScreen('main');
            setPendingTotpToken('');
          }}
        />
      </div>
    );
  }

  if (screen === 'reset') {
    return (
      <div className="h-full w-full grid place-items-center bg-app-grad">
        <ResetScreen onBack={() => setScreen('main')} />
      </div>
    );
  }

  // ── Main login / signup form ─────────────────────────────────────────────
  return (
    <div className="h-full w-full grid place-items-center bg-app-grad">
      <div className="w-[380px] panel rounded-3xl p-7 shadow-soft">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent-violet to-accent-rose grid place-items-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Recline</h1>
            <p className="text-[11px] text-ink-300">Private, encrypted, no bullshit.</p>
          </div>
        </div>


        <div className="flex p-1 bg-ink-800/60 rounded-xl mb-5 border border-white/5">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${
                mode === m ? 'bg-ink-700 text-ink-100 shadow-soft' : 'text-ink-300 hover:text-ink-100'
              }`}
            >
              {m === 'login' ? 'Log in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <FieldLabel>Username</FieldLabel>
            <input
              autoFocus
              autoComplete="username"
              className="input mt-1"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="lowercase, 3-24 chars"
              required
            />
          </label>

          {mode === 'signup' && (
            <label className="block">
              <FieldLabel>Display name</FieldLabel>
              <input
                className="input mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="how others see you"
              />
            </label>
          )}

          <label className="block">
            <FieldLabel>Password</FieldLabel>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'at least 8 characters' : ''}
              required
            />
          </label>

          {error && (
            <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Cloudflare Turnstile challenge — only rendered when site key is configured */}
          {tsRequired && (
            <div className="flex justify-center">
              <div ref={tsContainerRef} />
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full !py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={loading || !tsReady}
          >
            {loading ? 'Working…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        {mode === 'login' && (
          <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-ink-800 accent-violet-500 cursor-pointer"
            />
            <span className="text-xs text-ink-300">Remember me on this device</span>
          </label>
        )}

        {mode === 'login' && (
          <button
            onClick={() => setScreen('reset')}
            className="w-full text-[11px] text-ink-300/60 hover:text-ink-300 mt-3 transition-colors"
          >
            Forgot password? Use a backup code →
          </button>
        )}

        <p className="text-[11px] text-ink-300/70 mt-5 leading-relaxed">
          {mode === 'signup'
            ? "After creating your account you'll receive 10 backup codes — the only way to recover access if you lose your password. Save them somewhere safe."
            : 'Your message content stays encrypted in your browser using a separate server passphrase you choose for each community.'}
        </p>
      </div>
    </div>
  );
}
