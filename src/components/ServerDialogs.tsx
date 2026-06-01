import { useState } from 'react';
import { Modal } from './Modal';

type CreateProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, passphrase: string) => Promise<void>;
};

export function CreateServerDialog({ open, onClose, onCreate }: CreateProps) {
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onCreate(name.trim(), passphrase);
      setName('');
      setPassphrase('');
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a Space"
      subtitle="A Space is a private community. The passphrase encrypts every message — share it only with people you trust."
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">Space name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input mt-1"
            placeholder="e.g. Quiet Garden"
            required
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">
            Encryption passphrase
          </span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="input mt-1"
            placeholder="long, unique, hard to guess"
            required
            minLength={6}
          />
          <span className="text-[11px] text-ink-300/70 mt-1 block">
            Anyone joining will need this to read messages. The service never sees it.
          </span>
        </label>
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Create Space'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type JoinProps = {
  open: boolean;
  onClose: () => void;
  onJoin: (inviteCode: string, passphrase: string) => Promise<void>;
};

export function JoinServerDialog({ open, onClose, onJoin }: JoinProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onJoin(inviteCode.trim(), passphrase);
      setInviteCode('');
      setPassphrase('');
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Join a Space" subtitle="Get the invite code and passphrase from someone in the Space.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">Invite code</span>
          <input
            autoFocus
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="input mt-1 font-mono"
            placeholder="paste invite code"
            required
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">Passphrase</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="input mt-1"
            required
          />
        </label>
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Joining…' : 'Join Space'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type UnlockProps = {
  open: boolean;
  serverName: string;
  onClose: () => void;
  onUnlock: (passphrase: string) => Promise<void>;
};

export function UnlockDialog({ open, serverName, onClose, onUnlock }: UnlockProps) {
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onUnlock(passphrase);
      setPassphrase('');
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Wrong passphrase');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Unlock ${serverName}`}
      subtitle="Enter the Space passphrase to decrypt messages on this device."
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">Passphrase</span>
          <input
            autoFocus
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="input mt-1"
            required
          />
        </label>
        {error && (
          <div className="text-rose-300 text-xs bg-rose-900/30 border border-rose-900/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
