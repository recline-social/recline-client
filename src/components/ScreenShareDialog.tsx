import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { ScreenShareOptions, ScreenSurface } from '../lib/webrtc';

type Props = {
  open: boolean;
  onClose: () => void;
  onStart: (opts: ScreenShareOptions) => Promise<void> | void;
};

type ResolutionPreset = '720p' | '1080p' | '1440p' | 'source';
type FpsPreset = 15 | 30 | 60;

const STORAGE_KEY = 'recline.screenShareOpts';

type Saved = {
  surface: ScreenSurface;
  resolution: ResolutionPreset;
  fps: FpsPreset;
  captureAudio: boolean;
};

const DEFAULT: Saved = {
  surface: 'any',
  resolution: '1080p',
  fps: 30,
  captureAudio: true,
};

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
}

function resolutionToConstraints(r: ResolutionPreset) {
  switch (r) {
    case '720p':
      return { maxWidth: 1280, maxHeight: 720 };
    case '1080p':
      return { maxWidth: 1920, maxHeight: 1080 };
    case '1440p':
      return { maxWidth: 2560, maxHeight: 1440 };
    case 'source':
      return {};
  }
}

const SURFACE_OPTIONS: { value: ScreenSurface; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    value: 'any',
    label: 'Let me choose',
    sub: 'Show all sources in the browser picker',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    value: 'monitor',
    label: 'Entire screen',
    sub: 'Share one of your displays',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    value: 'window',
    label: 'App window',
    sub: 'Share one application window',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <circle cx="6" cy="6.5" r="0.6" fill="currentColor" />
        <circle cx="8.5" cy="6.5" r="0.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: 'browser',
    label: 'Browser tab',
    sub: 'Share one tab from this browser',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6a3 3 0 0 1 3-3h6l2 2h7a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6z" />
      </svg>
    ),
  },
];

const RESOLUTIONS: { value: ResolutionPreset; label: string; sub: string }[] = [
  { value: '720p', label: '720p', sub: '1280 × 720' },
  { value: '1080p', label: '1080p', sub: '1920 × 1080' },
  { value: '1440p', label: '1440p', sub: '2560 × 1440' },
  { value: 'source', label: 'Source', sub: 'Match what you share' },
];

const FPS_VALUES: FpsPreset[] = [15, 30, 60];

export function ScreenShareDialog({ open, onClose, onStart }: Props) {
  const [opts, setOpts] = useState<Saved>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOpts(load());
      setError(null);
    }
  }, [open]);

  function persist(next: Saved) {
    setOpts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = resolutionToConstraints(opts.resolution);
      await onStart({
        surface: opts.surface,
        ...res,
        frameRate: opts.fps,
        captureAudio: opts.captureAudio,
      });
      onClose();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        // user closed the browser picker — just close quietly
        onClose();
      } else {
        setError(err?.message ?? 'Could not start screen share');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share your screen"
      subtitle="Pick what to share. Your browser will then ask you to choose the specific window or display."
    >
      <div className="space-y-5">
        <Section title="What to share">
          <div className="grid grid-cols-2 gap-2">
            {SURFACE_OPTIONS.map((o) => (
              <OptionCard
                key={o.value}
                active={opts.surface === o.value}
                onClick={() => persist({ ...opts, surface: o.value })}
                icon={o.icon}
                label={o.label}
                sub={o.sub}
              />
            ))}
          </div>
        </Section>

        <Section title="Resolution">
          <div className="grid grid-cols-4 gap-2">
            {RESOLUTIONS.map((r) => (
              <Pill
                key={r.value}
                active={opts.resolution === r.value}
                onClick={() => persist({ ...opts, resolution: r.value })}
              >
                <div className="text-[12px] font-semibold">{r.label}</div>
                <div className="text-[10px] text-ink-300 mt-0.5">{r.sub}</div>
              </Pill>
            ))}
          </div>
        </Section>

        <Section title="Frame rate">
          <div className="grid grid-cols-3 gap-2">
            {FPS_VALUES.map((f) => (
              <Pill
                key={f}
                active={opts.fps === f}
                onClick={() => persist({ ...opts, fps: f })}
              >
                <div className="text-[12px] font-semibold">{f} fps</div>
                <div className="text-[10px] text-ink-300 mt-0.5">
                  {f === 15 ? 'Bandwidth' : f === 30 ? 'Balanced' : 'Smooth'}
                </div>
              </Pill>
            ))}
          </div>
        </Section>

        <label className="flex items-center gap-2 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={opts.captureAudio}
            onChange={(e) => persist({ ...opts, captureAudio: e.target.checked })}
            className="accent-accent-violet"
          />
          <span className="text-sm">Share audio from this source</span>
          <span className="text-[11px] text-ink-300">(if the source supports it)</span>
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
          <button type="button" className="btn-primary" onClick={start} disabled={loading}>
            {loading ? 'Starting…' : 'Choose source'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}

function OptionCard({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border px-3 py-2.5 transition-colors flex items-start gap-2.5
        ${
          active
            ? 'bg-accent-violet/15 border-accent-violet/40 text-ink-100 shadow-glow'
            : 'bg-ink-800/60 border-white/5 text-ink-200 hover:bg-ink-800/90 hover:text-ink-100'
        }`}
    >
      <span className={active ? 'text-accent-violet' : 'text-ink-300'}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-tight">{label}</div>
        <div className="text-[11px] text-ink-300 mt-0.5">{sub}</div>
      </div>
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 transition-colors text-center
        ${
          active
            ? 'bg-accent-violet/15 border-accent-violet/40 text-ink-100 shadow-glow'
            : 'bg-ink-800/60 border-white/5 text-ink-200 hover:bg-ink-800/90 hover:text-ink-100'
        }`}
    >
      {children}
    </button>
  );
}
