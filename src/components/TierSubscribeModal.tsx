import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { TierLevel } from '../types';

type Props = {
  serverId: string;
  serverName: string;
  channelName?: string;
  onClose: () => void;
  onSubscribed?: () => void;
};

export function TierSubscribeModal({ serverId, serverName, channelName, onClose, onSubscribed }: Props) {
  const [tiers, setTiers] = useState<TierLevel[]>([]);
  const [currentTierId, setCurrentTierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null); // tierId being acted on

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    Promise.all([
      api.tiers.list(serverId),
      api.tiers.myTier(serverId),
    ])
      .then(([tiersRes, myTierRes]) => {
        if (cancelled) return;
        // Sort by position ascending
        const sorted = [...tiersRes.tiers].sort((a, b) => a.position - b.position);
        setTiers(sorted);
        setCurrentTierId(myTierRes.tierId);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErr(e.message ?? 'Failed to load plans');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [serverId]);

  async function handleJoinFree(tierId: string) {
    setActionBusy(tierId);
    setErr('');
    try {
      await api.tiers.joinFree(serverId, tierId);
      onSubscribed?.();
      onClose();
    } catch (e: unknown) {
      setErr((e as Error).message ?? 'Failed to join tier');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleSubscribe(tierId: string) {
    setActionBusy(tierId);
    setErr('');
    try {
      const { url } = await api.tiers.subscribe(serverId, tierId);
      window.location.href = url;
    } catch (e: unknown) {
      setErr((e as Error).message ?? 'Failed to start checkout');
      setActionBusy(null);
    }
  }

  function formatPrice(cents: number): string {
    const dollars = cents / 100;
    return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)} / month`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 rounded-2xl shadow-2xl border border-white/[0.07] max-w-md w-full mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold text-ink-100 leading-snug">
              Server plans
            </h2>
            {channelName ? (
              <p className="text-[13px] text-ink-400 mt-0.5">
                Unlock <span className="text-ink-200 font-medium">#{channelName}</span> with a subscription
              </p>
            ) : (
              <p className="text-[13px] text-ink-400 mt-0.5">{serverName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 ml-4 h-8 w-8 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.07] transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mx-6" />

        {/* Body */}
        <div className="px-6 py-4 flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <svg className="animate-spin w-6 h-6 text-accent-violet" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
          ) : tiers.length === 0 ? (
            <p className="text-center text-[13px] text-ink-400 py-8">
              No subscription plans are available for this server yet.
            </p>
          ) : (
            tiers.map((tier) => {
              const isCurrent = tier.id === currentTierId;
              const isFree = tier.priceCents === 0;
              const busy = actionBusy === tier.id;

              return (
                <div
                  key={tier.id}
                  className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
                    isCurrent
                      ? 'border-accent-violet/30 bg-accent-violet/[0.06]'
                      : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-ink-100">{tier.name}</span>
                        {isCurrent && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent-violet/20 text-accent-violet">
                            Current plan
                          </span>
                        )}
                      </div>
                      {tier.description && (
                        <p className="text-[12px] text-ink-400 mt-0.5 leading-snug">{tier.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[13px] font-semibold text-accent-violet whitespace-nowrap">
                        {isFree ? 'Free' : formatPrice(tier.priceCents)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    {isCurrent ? (
                      <span className="text-[12px] text-ink-400 font-medium px-3 py-1.5">
                        Your plan
                      </span>
                    ) : isFree ? (
                      <button
                        onClick={() => handleJoinFree(tier.id)}
                        disabled={busy}
                        className="btn-primary px-4 py-1.5 text-[13px] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {busy ? 'Joining…' : 'Join free'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(tier.id)}
                        disabled={busy}
                        className="btn-primary px-4 py-1.5 text-[13px] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {busy ? 'Redirecting…' : `Subscribe — ${formatPrice(tier.priceCents)}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {err && (
            <p className="text-[13px] text-red-400 text-center mt-1">{err}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end border-t border-white/[0.06]">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
