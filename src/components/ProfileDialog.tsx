import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from './Modal';
import { api } from '../lib/api';
import { Avatar } from './Avatar';
import type { User } from '../types';
import {
  getNotificationPermission,
  getNotificationPref,
  notificationsSupported,
  requestNotificationPermission,
  setNotificationPref,
} from '../lib/notifications';

type Props = {
  open: boolean;
  onClose: () => void;
  me: User;
  onUpdated: (user: User) => void;
  onRotateKey: (password: string) => Promise<void>;
  isSupporter?: boolean;
  sparksBalance?: number;
  onSparksUpdate?: (balance: number) => void;
  initialTab?: Tab;
};

type Tab = 'profile' | 'security' | 'notifications' | 'sparks';

// ── small helpers ─────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">
      {children}
    </span>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-ink-800/40 p-4 space-y-3">
      {children}
    </div>
  );
}

// ── 2FA setup flow (inline) ───────────────────────────────────────────────────
function TotpSetup({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'loading' | 'scan' | 'confirm' | 'done'>('loading');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.setup2fa()
      .then((r) => {
        if (!mounted) return;
        setOtpauthUrl(r.otpauthUrl);
        setSecret(r.secret);
        setStep('scan');
      })
      .catch((e) => {
        if (mounted) setError(e?.message ?? 'Could not start 2FA setup');
      });
    return () => { mounted = false; };
  }, []);

  function copySecret() {
    navigator.clipboard.writeText(secret).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setLoading(true);
    setError(null);
    try {
      await api.confirm2fa({ code });
      setStep('done');
      setTimeout(onDone, 800);
    } catch (err: any) {
      setError(err?.message ?? 'Invalid code');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'loading') {
    return (
      <div className="py-6 text-center text-sm text-ink-300">
        {error ? (
          <span className="text-rose-300">{error}</span>
        ) : (
          'Generating secret…'
        )}
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="py-4 flex items-center gap-2 text-emerald-400 text-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Authenticator app linked.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* QR code */}
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="p-3 bg-white rounded-xl">
          <QRCodeSVG value={otpauthUrl} size={148} level="M" />
        </div>
        <p className="text-[11px] text-ink-300/70 text-center">
          Scan with Google Authenticator, Aegis, or any TOTP app.
        </p>
      </div>

      {/* Manual entry */}
      <div className="rounded-xl bg-ink-900/60 border border-white/[0.06] px-3 py-2.5 flex items-center gap-2">
        <span className="text-[11px] text-ink-300/60 shrink-0">Manual key</span>
        <span className="font-mono text-[12px] text-ink-200 truncate flex-1 tracking-wider">{secret}</span>
        <button
          type="button"
          onClick={copySecret}
          className="text-[11px] text-ink-400 hover:text-ink-100 transition-colors shrink-0"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Confirm code */}
      <form onSubmit={confirm} className="space-y-2.5">
        <label className="block">
          <FieldLabel>Enter the 6-digit code to confirm</FieldLabel>
          <input
            autoFocus
            inputMode="numeric"
            className="input mt-1 text-center font-mono tracking-[0.3em] text-lg"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            required
          />
        </label>
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={loading || code.length < 6}
          >
            {loading ? 'Verifying…' : 'Enable 2FA'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── 2FA disable flow (inline) ─────────────────────────────────────────────────
function TotpDisable({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.disable2fa({ code: code.trim().toUpperCase() });
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Invalid code');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  const isTotp = /^\d{6}$/.test(code);
  const isBackup = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code.toUpperCase());

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-ink-300/70">
        Enter your current authenticator code or a backup code to remove 2FA.
      </p>
      <label className="block">
        <FieldLabel>Code</FieldLabel>
        <input
          autoFocus
          className="input mt-1 text-center font-mono tracking-[0.2em]"
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 9))}
          placeholder="000000 or XXXX-XXXX"
          required
        />
      </label>
      {error && (
        <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary flex-1 !bg-rose-600/80 hover:!bg-rose-600"
          disabled={loading || (!isTotp && !isBackup)}
        >
          {loading ? 'Removing…' : 'Remove 2FA'}
        </button>
      </div>
    </form>
  );
}

// ── Backup code regeneration flow (inline) ────────────────────────────────────
function RegenerateCodes({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api.regenerateBackupCodes({ password });
      setNewCodes(r.backupCodes);
    } catch (err: any) {
      setError(err?.message ?? 'Incorrect password');
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    if (!newCodes) return;
    navigator.clipboard.writeText(newCodes.join('\n')).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (newCodes) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 text-amber-400">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-[11px] text-amber-300/90 leading-relaxed">
            Your old codes are gone. Save these now — they won't be shown again.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {newCodes.map((c) => (
            <span key={c} className="font-mono text-xs text-ink-100 bg-ink-800/70 rounded-lg px-3 py-1.5 text-center tracking-widest select-all border border-white/[0.05]">
              {c}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="w-full text-xs text-ink-300 hover:text-ink-100 border border-white/10 hover:border-white/20 rounded-xl py-2 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy all codes'}
        </button>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-ink-800 accent-violet-500 cursor-pointer"
          />
          <span className="text-xs text-ink-300">I've saved these codes</span>
        </label>
        <button
          className="btn-primary w-full"
          disabled={!confirmed}
          onClick={onDone}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-ink-300/70">
        This will invalidate all existing backup codes and generate 10 new ones. Enter your password to continue.
      </p>
      <label className="block">
        <FieldLabel>Current password</FieldLabel>
        <input
          autoFocus
          type="password"
          autoComplete="current-password"
          className="input mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={loading || !password}>
          {loading ? 'Working…' : 'Regenerate'}
        </button>
      </div>
    </form>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────
function ProfileTab({
  me,
  onUpdated,
  onClose,
  isSupporter,
}: {
  me: User;
  onUpdated: (user: User) => void;
  onClose: () => void;
  isSupporter?: boolean;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const { url } = await api.uploadAvatar(file);
      const r = await api.updateMe({ avatarUrl: url });
      onUpdated(r.user as User);
    } catch (err: any) {
      setAvatarError(err?.message ?? 'Upload failed');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const r = await api.updateMe({ avatarUrl: null });
      onUpdated(r.user as User);
    } catch (err: any) {
      setAvatarError(err?.message ?? 'Could not remove');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 32) {
      setError('Display name must be 1-32 characters');
      return;
    }
    if (trimmed === me.displayName) { onClose(); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await api.updateMe({ displayName: trimmed });
      onUpdated(r.user as User);
      setSaved(true);
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 rounded-2xl panel-inner">
        {/* Avatar with upload hover overlay */}
        <div className="relative shrink-0 group cursor-pointer" onClick={() => !avatarUploading && fileInputRef.current?.click()}>
          <Avatar name={displayName || me.displayName} id={me.id} size="lg" isSelf imageUrl={me.avatarUrl} />
          <div className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {avatarUploading ? (
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleAvatarPick}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold truncate">{displayName || me.displayName}</div>
          <div className="text-[11px] text-ink-300 truncate">@{me.username}</div>
          {isSupporter && (
            <div
              className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: 'linear-gradient(90deg, rgba(139,92,246,0.18), rgba(34,211,238,0.12))',
                border: '1px solid rgba(139,92,246,0.32)',
                color: '#a78bfa',
              }}
            >
              <span style={{ fontSize: '8px' }}>✦</span>
              <span>Founding Supporter</span>
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => !avatarUploading && fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="text-[11px] text-ink-400 hover:text-ink-200 transition-colors disabled:opacity-40"
            >
              {avatarUploading ? 'Uploading…' : 'Change avatar'}
            </button>
            {me.avatarUrl && !avatarUploading && (
              <>
                <span className="text-ink-600">·</span>
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="text-[11px] text-rose-400/70 hover:text-rose-300 transition-colors"
                >
                  Remove
                </button>
              </>
            )}
          </div>
          {avatarError && (
            <div className="text-[11px] text-rose-300 mt-1">{avatarError}</div>
          )}
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <FieldLabel>Display name</FieldLabel>
          <input
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input mt-1"
            maxLength={32}
            required
          />
        </label>
        <div className="text-[11px] text-ink-300/70">
          Your username (<span className="font-mono">@{me.username}</span>) is permanent.
        </div>
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── ECDH key rotation flow (inline) ──────────────────────────────────────────
function KeyRotation({
  onDone,
  onCancel,
  onRotate,
}: {
  onDone: () => void;
  onCancel: () => void;
  onRotate: (password: string) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleRotate() {
    if (!confirmed || !password) return;
    setLoading(true);
    setError(null);
    try {
      await onRotate(password);
      setDone(true);
      setTimeout(onDone, 900);
    } catch (err: any) {
      setError(err?.message ?? 'Rotation failed — try again');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="py-4 flex items-center gap-2 text-emerald-400 text-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        New encryption key active.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-400">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          Rotating generates a new ECDH key pair and uploads the new public key to the server.
          Up to 5 previous keys are kept locally so old messages can still be decrypted.
          Messages encrypted <em>before</em> the peer re-fetches your new key may show as unreadable
          until they re-open the conversation.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-ink-400">Confirm your password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Current password"
          className="input w-full text-sm"
          autoComplete="current-password"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-ink-800 accent-violet-500 cursor-pointer"
        />
        <span className="text-xs text-ink-300">I understand — some old DMs may temporarily show as unreadable</span>
      </label>
      {error && (
        <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary flex-1 !bg-amber-600/80 hover:!bg-amber-600"
          disabled={loading || !confirmed || !password}
          onClick={handleRotate}
        >
          {loading ? 'Rotating…' : 'Rotate key'}
        </button>
      </div>
    </div>
  );
}

// ── Notifications tab ─────────────────────────────────────────────────────────
function NotificationsTab() {
  const supported = notificationsSupported();
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? getNotificationPermission() : 'denied',
  );
  const [enabled, setEnabled] = useState(() => (supported ? getNotificationPref() : false));
  const [requesting, setRequesting] = useState(false);

  async function handleToggle(next: boolean) {
    if (next && permission !== 'granted') {
      setRequesting(true);
      const granted = await requestNotificationPermission();
      setRequesting(false);
      const newPerm = getNotificationPermission();
      setPermission(newPerm);
      if (!granted) return; // browser denied — leave toggle off
    }
    setEnabled(next);
    setNotificationPref(next);
  }

  const permLabel: Record<NotificationPermission, string> = {
    granted: 'Allowed',
    denied: 'Blocked',
    default: 'Not yet set',
  };

  const permColor: Record<NotificationPermission, string> = {
    granted: 'text-emerald-400',
    denied: 'text-rose-400',
    default: 'text-amber-400',
  };

  return (
    <div className="space-y-3">
      <SectionCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className={`mt-0.5 h-7 w-7 rounded-lg grid place-items-center shrink-0 ${
              enabled && permission === 'granted'
                ? 'bg-violet-500/15 border border-violet-500/25 text-violet-400'
                : 'bg-ink-700/60 border border-white/[0.06] text-ink-400'
            }`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-medium text-ink-100">Desktop notifications</div>
              <div className="text-[11px] text-ink-300/70 mt-0.5">
                Get notified about new DMs and channel mentions when the tab is in the background.
              </div>
            </div>
          </div>

          {/* Toggle */}
          {supported ? (
            <button
              type="button"
              role="switch"
              aria-checked={enabled && permission === 'granted'}
              disabled={requesting || permission === 'denied'}
              onClick={() => handleToggle(!(enabled && permission === 'granted'))}
              className={`relative shrink-0 mt-0.5 h-5 w-9 rounded-full transition-colors focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                enabled && permission === 'granted'
                  ? 'bg-violet-500'
                  : 'bg-ink-600 border border-white/10'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  enabled && permission === 'granted' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          ) : null}
        </div>

        {/* Permission status row */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-ink-400">Browser permission:</span>
          {supported ? (
            <span className={`font-medium ${permColor[permission]}`}>
              {permLabel[permission]}
            </span>
          ) : (
            <span className="text-rose-400 font-medium">Not supported</span>
          )}
        </div>

        {/* Contextual help messages */}
        {!supported && (
          <div className="text-[11px] text-ink-300/70 bg-ink-700/40 rounded-xl px-3 py-2.5 border border-white/[0.05]">
            Desktop notifications are not available in this browser or context (requires a secure HTTPS origin).
          </div>
        )}
        {supported && permission === 'denied' && (
          <div className="text-[11px] text-rose-300/80 bg-rose-900/20 rounded-xl px-3 py-2.5 border border-rose-900/30">
            Notifications are blocked by your browser. To enable them, click the lock icon in your address bar and allow notifications for this site, then reload.
          </div>
        )}
        {supported && permission === 'default' && !requesting && (
          <button
            type="button"
            onClick={() => handleToggle(true)}
            className="w-full btn-primary !py-2 text-xs"
          >
            Enable desktop notifications
          </button>
        )}
        {requesting && (
          <div className="text-[11px] text-ink-300/70 text-center py-1">
            Waiting for browser permission…
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────
function SecurityTab({
  me,
  onUpdated,
  onRotateKey,
}: {
  me: User;
  onUpdated: (user: User) => void;
  onRotateKey: (password: string) => Promise<void>;
}) {
  type Panel = 'idle' | 'totp-setup' | 'totp-disable' | 'regen-codes' | 'rotate-key';
  const [panel, setPanel] = useState<Panel>('idle');

  const totpEnabled = me.totpEnabled ?? false;

  function handleTotpEnabled() {
    onUpdated({ ...me, totpEnabled: true });
    setPanel('idle');
  }

  function handleTotpDisabled() {
    onUpdated({ ...me, totpEnabled: false });
    setPanel('idle');
  }

  if (panel === 'totp-setup') {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-100">Set up authenticator app</h3>
        <TotpSetup onDone={handleTotpEnabled} onCancel={() => setPanel('idle')} />
      </div>
    );
  }

  if (panel === 'totp-disable') {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-100">Remove two-factor authentication</h3>
        <TotpDisable onDone={handleTotpDisabled} onCancel={() => setPanel('idle')} />
      </div>
    );
  }

  if (panel === 'regen-codes') {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-100">Regenerate backup codes</h3>
        <RegenerateCodes onDone={() => setPanel('idle')} onCancel={() => setPanel('idle')} />
      </div>
    );
  }

  if (panel === 'rotate-key') {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-100">Rotate encryption key</h3>
        <KeyRotation
          onDone={() => setPanel('idle')}
          onCancel={() => setPanel('idle')}
          onRotate={onRotateKey}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 2FA section */}
      <SectionCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className={`mt-0.5 h-7 w-7 rounded-lg grid place-items-center shrink-0 ${
              totpEnabled
                ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
                : 'bg-ink-700/60 border border-white/[0.06] text-ink-400'
            }`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-medium text-ink-100">Two-factor authentication</div>
              <div className="text-[11px] text-ink-300/70 mt-0.5">
                {totpEnabled
                  ? 'Your account is protected with an authenticator app.'
                  : 'Add an authenticator app for extra account security.'}
              </div>
            </div>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
            totpEnabled
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'bg-ink-700 text-ink-400 border border-white/[0.06]'
          }`}>
            {totpEnabled ? 'ON' : 'OFF'}
          </span>
        </div>
        {totpEnabled ? (
          <button
            onClick={() => setPanel('totp-disable')}
            className="w-full text-xs text-rose-400/80 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 rounded-xl py-2 transition-colors"
          >
            Remove authenticator app
          </button>
        ) : (
          <button
            onClick={() => setPanel('totp-setup')}
            className="btn-primary w-full !py-2 text-xs"
          >
            Set up authenticator app
          </button>
        )}
      </SectionCard>

      {/* Backup codes section */}
      <SectionCard>
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 grid place-items-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-medium text-ink-100">Backup codes</div>
            <div className="text-[11px] text-ink-300/70 mt-0.5">
              10 single-use codes. Use one if you lose access to your authenticator.
            </div>
          </div>
        </div>
        <button
          onClick={() => setPanel('regen-codes')}
          className="w-full text-xs text-ink-300 hover:text-ink-100 border border-white/10 hover:border-white/20 rounded-xl py-2 transition-colors"
        >
          Regenerate backup codes
        </button>
      </SectionCard>

      {/* E2E encryption key section */}
      <SectionCard>
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 h-7 w-7 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 grid place-items-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-medium text-ink-100">Encryption keys</div>
            <div className="text-[11px] text-ink-300/70 mt-0.5">
              ECDH P-256 key pair used for end-to-end encrypted direct messages. Up to 5 previous keys are kept locally for decrypting old messages.
            </div>
          </div>
        </div>
        <button
          onClick={() => setPanel('rotate-key')}
          className="w-full text-xs text-ink-300 hover:text-ink-100 border border-white/10 hover:border-white/20 rounded-xl py-2 transition-colors"
        >
          Rotate encryption key
        </button>
      </SectionCard>
    </div>
  );
}

// ── Sparks tab ────────────────────────────────────────────────────────────────
const DAILY_REWARDS = [0, 5, 8, 12, 16, 20, 25, 50];
const DAY_LABELS    = ['', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

function SparksTab({ balance, onSparksUpdate }: { balance: number; onSparksUpdate?: (b: number) => void }) {
  const [streak, setStreak]     = useState(0);
  const [claimed, setClaimed]   = useState(false);
  const [weekMult, setWeekMult] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<{ reward: number; day: number } | null>(null);
  const [txns, setTxns]         = useState<{ delta: number; reason: string; createdAt: number }[]>([]);

  // Buy Sparks state
  type SparkPackItem = { id: string; name: string; sparkCount: number; priceCents: number; stripePriceId: string | null; active: boolean };
  const [packsList, setPacksList]     = useState<SparkPackItem[]>([]);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);

  // Stripe Connect / cashout state
  const [connectReady, setConnectReady]   = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [cashoutAmount, setCashoutAmount]  = useState('');
  const [cashoutMsg, setCashoutMsg]        = useState<string | null>(null);
  const [cashoutErr, setCashoutErr]        = useState<string | null>(null);
  const [cashouting, setCashouting]        = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.sparks.streak(), api.sparks.transactions(10), api.sparks.packs(), api.connect.status()])
      .then(([s, t, p, c]) => {
        if (!live) return;
        setStreak(s.currentStreak);
        setClaimed(s.alreadyClaimedToday);
        setWeekMult(s.weekMultiplier ?? 0);
        setTxns(t.transactions ?? []);
        setPacksList(p.packs ?? []);
        setConnectReady(c.ready);
      })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  async function handleConnectOnboard() {
    setConnectLoading(true);
    try {
      const r = await api.connect.onboard();
      if (r.url) window.location.href = r.url;
    } catch { /* silent */ } finally {
      setConnectLoading(false);
    }
  }

  async function handleCashout() {
    const sparks = parseInt(cashoutAmount, 10);
    if (!sparks || sparks < 1000) {
      setCashoutErr('Minimum cashout is 1 000 Sparks');
      return;
    }
    setCashouting(true);
    setCashoutErr(null);
    setCashoutMsg(null);
    try {
      const r = await api.connect.cashout(sparks);
      setCashoutMsg(`✦ Sent $${(r.payoutCents / 100).toFixed(2)} to your bank`);
      onSparksUpdate?.(r.newBalance);
      setCashoutAmount('');
      setTimeout(() => setCashoutMsg(null), 5000);
    } catch (err: any) {
      setCashoutErr(err?.message ?? 'Transfer failed — try again');
    } finally {
      setCashouting(false);
    }
  }

  async function handleBuyPack(packId: string) {
    if (buyingPackId) return;
    setBuyingPackId(packId);
    try {
      const r = await api.sparks.checkout(packId);
      if (r.url) window.location.href = r.url;
    } catch { /* silent */ } finally {
      setBuyingPackId(null);
    }
  }

  async function handleClaim() {
    if (claiming || claimed) return;
    setClaiming(true);
    try {
      const r = await api.sparks.claimDaily();
      if (!r.alreadyClaimed) {
        setStreak(r.newStreak);
        setClaimed(true);
        setClaimMsg({ reward: r.reward, day: r.newStreak });
        onSparksUpdate?.(balance + r.reward);
        // Refresh transactions
        api.sparks.transactions(10).then((t) => setTxns(t.transactions ?? [])).catch(() => {});
        setTimeout(() => setClaimMsg(null), 4000);
      }
    } catch { /* silent */ } finally {
      setClaiming(false);
    }
  }

  const todayReward = DAILY_REWARDS[Math.min((streak % 7) + 1, 7)] + weekMult * 5;
  const nextReward  = DAILY_REWARDS[Math.min((streak % 7) + 2, 7)] + weekMult * 5;

  return (
    <div className="flex flex-col gap-4">

      {/* Balance card */}
      <div
        className="rounded-2xl p-4 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.06) 100%)',
          border: '1px solid rgba(251,191,36,0.2)',
        }}
      >
        <div>
          <div className="text-[11px] text-amber-300/60 font-medium mb-0.5">Your balance</div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-3xl font-bold"
              style={{ background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}
            >
              {balance.toLocaleString()}
            </span>
            <span className="text-amber-400/70 text-sm font-semibold">Sparks</span>
          </div>
        </div>
        <div className="text-4xl select-none opacity-60">✦</div>
      </div>

      {/* Streak tracker */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <div>
            <div className="text-[13px] font-semibold text-ink-100">
              {streak > 0 ? `🔥 Day ${streak} streak` : '✦ Start your streak'}
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">
              {weekMult > 0
                ? `Week ${weekMult} bonus active — +${weekMult * 5} Sparks per day`
                : 'Complete 7 days to unlock a permanent bonus'}
            </div>
          </div>
          {streak > 0 && (
            <div
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}
            >
              {streak % 7 === 0 ? 'Max' : `${streak % 7}/7`}
            </div>
          )}
        </div>

        {/* 7-day progress dots */}
        <div className="px-4 py-3 grid grid-cols-7 gap-2">
          {[1,2,3,4,5,6,7].map((day) => {
            const dayInCycle = streak % 7 === 0 && streak > 0 ? 7 : streak % 7;
            const done    = day <= dayInCycle;
            const isToday = day === dayInCycle;
            const reward  = DAILY_REWARDS[day] + weekMult * 5;
            return (
              <div key={day} className="flex flex-col items-center gap-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                  style={{
                    background: done
                      ? isToday && !claimed
                        ? 'linear-gradient(135deg,#fbbf24,#f59e0b)'
                        : 'rgba(251,191,36,0.25)'
                      : 'rgba(255,255,255,0.05)',
                    border: done
                      ? isToday && !claimed
                        ? '2px solid #fbbf24'
                        : '2px solid rgba(251,191,36,0.4)'
                      : '2px solid rgba(255,255,255,0.08)',
                    color: done ? (isToday && !claimed ? '#08080D' : '#fbbf24') : 'rgba(255,255,255,0.25)',
                    boxShadow: isToday && !claimed ? '0 0 12px rgba(251,191,36,0.5)' : 'none',
                  }}
                >
                  {done ? (isToday && !claimed ? '!' : '✓') : day}
                </div>
                <span className="text-[9px] text-ink-500">+{reward}</span>
              </div>
            );
          })}
        </div>

        {/* Claim button */}
        <div className="px-4 pb-4">
          {loading ? (
            <div className="h-10 rounded-xl bg-white/[0.04] animate-pulse" />
          ) : claimed ? (
            <div
              className="w-full py-2.5 rounded-xl text-center text-[13px] font-medium text-amber-400/60"
              style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}
            >
              ✓ Claimed today — come back tomorrow
            </div>
          ) : (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-2.5 rounded-xl text-[13px] font-bold transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg,rgba(251,191,36,0.28),rgba(245,158,11,0.18))',
                border: '1px solid rgba(251,191,36,0.35)',
                color: '#fbbf24',
                boxShadow: '0 0 20px rgba(251,191,36,0.15)',
              }}
            >
              {claiming ? 'Claiming…' : `✦ Claim +${todayReward} Sparks (Day ${(streak % 7) + 1})`}
            </button>
          )}

          {claimMsg && (
            <div className="mt-2 text-center text-[12px] text-amber-400 font-medium animate-pulse">
              ✦ +{claimMsg.reward} Sparks earned! Day {claimMsg.day} streak 🔥
            </div>
          )}

          {!claimed && !loading && (
            <p className="mt-1.5 text-center text-[10px] text-ink-500">
              Tomorrow: +{nextReward} Sparks · Miss a day and streak resets
            </p>
          )}
        </div>
      </div>

      {/* Buy Sparks */}
      {packsList.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-2">Buy Sparks</div>
          <div className="grid grid-cols-2 gap-2">
            {packsList.map((pack) => (
              <div
                key={pack.id}
                className="rounded-2xl p-3 flex flex-col gap-2"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(251,191,36,0.2)',
                }}
              >
                <div>
                  <div className="text-[12px] font-semibold text-ink-100">{pack.name}</div>
                  <div
                    className="text-[20px] font-bold mt-0.5"
                    style={{ background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                  >
                    {pack.sparkCount.toLocaleString()} ✦
                  </div>
                </div>
                <button
                  onClick={() => handleBuyPack(pack.id)}
                  disabled={buyingPackId !== null}
                  className="w-full py-1.5 rounded-xl text-[12px] font-bold transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg,rgba(251,191,36,0.28),rgba(245,158,11,0.18))',
                    border: '1px solid rgba(251,191,36,0.35)',
                    color: '#fbbf24',
                  }}
                >
                  {buyingPackId === pack.id
                    ? 'Redirecting…'
                    : `$${(pack.priceCents / 100).toFixed(2)}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash out — Stripe Connect */}
      {!loading && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="text-[13px] font-semibold text-ink-100">Cash out Sparks</div>
            <div className="text-[11px] text-ink-400 mt-0.5">1 000 Sparks = $12 · transferred via Stripe</div>
          </div>
          <div className="px-4 py-3 space-y-2">
            {connectReady ? (
              <>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1000}
                    max={100000}
                    step={100}
                    value={cashoutAmount}
                    onChange={(e) => setCashoutAmount(e.target.value)}
                    placeholder="Sparks (min 1 000)"
                    className="input flex-1 text-sm"
                  />
                  <button
                    type="button"
                    disabled={cashouting || !cashoutAmount}
                    onClick={handleCashout}
                    className="btn-primary !py-1.5 !px-3 text-[12px] font-bold disabled:opacity-50"
                    style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}
                  >
                    {cashouting ? 'Sending…' : `Cash out $${cashoutAmount ? (parseInt(cashoutAmount, 10) * 1.2 / 100).toFixed(2) : '0'}`}
                  </button>
                </div>
                {cashoutMsg && <p className="text-[12px] text-emerald-400 font-medium">{cashoutMsg}</p>}
                {cashoutErr && <p className="text-[12px] text-rose-400">{cashoutErr}</p>}
                <p className="text-[10px] text-ink-500">Connected to Stripe ✓ — payouts go to your linked bank account</p>
              </>
            ) : (
              <>
                <p className="text-[12px] text-ink-300">Link a bank account to convert Sparks you've earned into real money.</p>
                <button
                  type="button"
                  disabled={connectLoading}
                  onClick={handleConnectOnboard}
                  className="w-full py-2 rounded-xl text-[12px] font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}
                >
                  {connectLoading ? 'Opening Stripe…' : 'Link bank account via Stripe →'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      {txns.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-2">Recent</div>
          <div className="flex flex-col gap-1">
            {txns.map((tx, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[12px] text-ink-300 capitalize">{tx.reason.replace(/_/g, ' ')}</span>
                <span className={`text-[12px] font-semibold ${tx.delta > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {tx.delta > 0 ? '+' : ''}{tx.delta} ✦
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export function ProfileDialog({ open, onClose, me, onUpdated, onRotateKey, isSupporter, sparksBalance, onSparksUpdate, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    if (open) setTab(initialTab ?? 'profile');
  }, [open, initialTab]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Account"
      subtitle="Manage your profile and security settings."
    >
      {/* Tab switcher */}
      <div className="flex p-1 bg-ink-800/60 rounded-xl mb-4 border border-white/5">
        {(['profile', 'sparks', 'security', 'notifications'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors capitalize ${
              tab === t ? 'bg-ink-700 text-ink-100 shadow-soft' : 'text-ink-300 hover:text-ink-100'
            }`}
          >
            {t === 'sparks' ? '✦ Sparks' : t}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <ProfileTab me={me} onUpdated={onUpdated} onClose={onClose} isSupporter={isSupporter} />
      )}
      {tab === 'sparks' && (
        <SparksTab balance={sparksBalance ?? 0} onSparksUpdate={onSparksUpdate} />
      )}
      {tab === 'security' && (
        <SecurityTab me={me} onUpdated={onUpdated} onRotateKey={onRotateKey} />
      )}
      {tab === 'notifications' && (
        <NotificationsTab />
      )}
    </Modal>
  );
}
