import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Channel, InviteInfo, ServerSummary } from '../types';

type Props = {
  code: string;
  onClose: () => void;
  /** passphrase is forwarded so App.tsx can derive + cache the AES key immediately. */
  onJoined: (server: ServerSummary, channels: Channel[], passphrase: string) => void;
};

export function InviteJoinModal({ code, onClose, onJoined }: Props) {
  const [info, setInfo]         = useState<InviteInfo | null>(null);
  const [infoErr, setInfoErr]   = useState<string | null>(null);
  const [passphrase, setPass]   = useState('');
  const [submitting, setSub]    = useState(false);
  const [joinErr, setJoinErr]   = useState<string | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  // Fetch public invite metadata on mount
  useEffect(() => {
    api.invites.getInfo(code)
      .then(setInfo)
      .catch((err: Error) => setInfoErr(err.message));
  }, [code]);

  useEffect(() => {
    if (info) setTimeout(() => inputRef.current?.focus(), 50);
  }, [info]);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleJoin() {
    if (!passphrase || submitting) return;
    setSub(true);
    setJoinErr(null);
    try {
      const r = await api.invites.join(code, passphrase);
      const server: ServerSummary = {
        id:           r.server.id,
        name:         r.server.name,
        owner_id:     r.server.ownerId,
        role:         r.server.role,
        invite_code:  '',            // never returned to non-owners
        created_at:   Date.now(),
        kdf_salt:     r.server.kdfSalt,
        invite_mode:  (r.server.inviteMode ?? 'any') as 'any' | 'links_only',
      };
      const channels: Channel[] = r.channels.map((c) => ({
        id:        c.id,
        server_id: r.server.id,
        name:      c.name,
        type:      c.type as 'text' | 'voice',
        position:  c.position,
        topic:     c.topic ?? null,
      }));
      onJoined(server, channels, passphrase);
    } catch (err: any) {
      setJoinErr(err.message ?? 'join failed — check your passphrase and try again');
    } finally {
      setSub(false);
    }
  }

  function initials(name: string) {
    return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #131318 0%, #0f0f14 100%)' }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest">
            You've been invited
          </span>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-100 transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 pb-6">
          {/* Loading / error state for invite info */}
          {!info && !infoErr && (
            <div className="flex items-center justify-center py-10 text-ink-400 text-sm">
              Loading invite…
            </div>
          )}

          {infoErr && (
            <div className="py-6 text-center">
              <p className="text-rose-400 font-semibold mb-1">Invite unavailable</p>
              <p className="text-ink-400 text-sm">{infoErr}</p>
              <button
                onClick={onClose}
                className="mt-4 btn-secondary text-sm px-4 py-2"
              >
                Close
              </button>
            </div>
          )}

          {info && (
            <>
              {/* Server card */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                {info.iconUrl ? (
                  <img
                    src={info.iconUrl}
                    alt={info.serverName}
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-lg font-bold text-white/80"
                    style={{ background: 'linear-gradient(135deg,#4F75FF 0%,#7C4DFF 100%)' }}
                  >
                    {initials(info.serverName)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-ink-100 truncate">{info.serverName}</p>
                  {info.label && (
                    <p className="text-[11px] text-ink-400 truncate mt-0.5">{info.label}</p>
                  )}
                  <p className="text-[11px] text-ink-400 mt-0.5">
                    {info.memberCount} {info.memberCount === 1 ? 'member' : 'members'}
                  </p>
                </div>
              </div>

              {/* History access notice */}
              {!info.allowHistory && (
                <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-amber-400 text-sm mt-0.5 shrink-0">⚠</span>
                  <p className="text-[12px] text-amber-300/90 leading-snug">
                    This invite <strong>does not include message history</strong> — you'll only see messages sent after you join.
                  </p>
                </div>
              )}

              {/* Passphrase input */}
              <label className="block mb-1.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">
                Server passphrase
              </label>
              <input
                ref={inputRef}
                type="password"
                value={passphrase}
                onChange={(e) => { setPass(e.target.value); setJoinErr(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                placeholder="Enter the server passphrase…"
                autoComplete="current-password"
                className="w-full input-field mb-3"
              />

              {joinErr && (
                <p className="text-[12px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-3">
                  {joinErr}
                </p>
              )}

              <button
                onClick={handleJoin}
                disabled={!passphrase || submitting}
                className="w-full btn-primary py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                {submitting ? 'Joining…' : 'Join server'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
