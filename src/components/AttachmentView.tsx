// Shared file attachment renderer — replaces the duplicated FileAttachmentView
// that used to live in both MessageRow and DmView.

import { getServerUrl } from '../lib/serverUrl';

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Normalize a raw attachment URL to a safe, absolute URL restricted to /uploads/ paths.
 * Returns null for anything that resolves outside the allowed origins.
 *
 * Two permitted origins:
 *   • window.location.origin — web build (same-origin relative paths)
 *   • getServerUrl() origin  — native Tauri/Capacitor (API host may differ from webview origin)
 *
 * blob: URLs are always allowed (local object URLs from in-progress uploads).
 */
function safeAttachmentUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith('blob:')) return raw;
  try {
    const appOrigin = window.location.origin;
    const apiBase = getServerUrl() || appOrigin;
    const apiOrigin = new URL(apiBase, appOrigin).origin;
    // Resolve relative paths against the API origin so /uploads/... works in native builds.
    const u = new URL(raw, apiOrigin);
    if (!u.pathname.startsWith('/uploads/')) return null;
    if (u.origin !== appOrigin && u.origin !== apiOrigin) return null;
    return u.href;
  } catch {
    return null;
  }
}

function fileIcon(type: string): string {
  if (type === 'application/pdf') return '📄';
  if (type.includes('zip')) return '🗜️';
  if (type.startsWith('text/')) return '📝';
  return '📎';
}

type Props = {
  url: string;
  name: string;
  size: number;
  type: string;
};

export function AttachmentView({ url, name, size, type }: Props) {
  const safeUrl = safeAttachmentUrl(url);
  const isImage = type.startsWith('image/');
  const isVideo = type.startsWith('video/');
  const isAudio = type.startsWith('audio/');

  if (isImage) {
    return (
      <a
        href={safeUrl ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className="block mt-1.5 rounded-xl overflow-hidden max-w-sm border border-white/[0.06] hover:border-white/10 transition-colors"
      >
        <img src={safeUrl ?? undefined} alt={name} className="w-full max-h-64 object-contain bg-black/20" loading="lazy" referrerPolicy="no-referrer" />
        <div className="px-2.5 py-1.5 bg-ink-800/60 flex items-center gap-2">
          <span className="text-[11px] text-ink-300 truncate flex-1">{name}</span>
          <span className="text-[10px] text-ink-500 shrink-0">{fmtBytes(size)}</span>
        </div>
      </a>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-1.5 rounded-xl overflow-hidden max-w-sm border border-white/[0.06]">
        <video src={safeUrl ?? undefined} controls preload="metadata" className="w-full max-h-64 bg-black" style={{ display: 'block' }} />
        <div className="px-2.5 py-1.5 bg-ink-800/60 flex items-center gap-2">
          <span className="text-[11px] text-ink-300 truncate flex-1">{name}</span>
          <span className="text-[10px] text-ink-500 shrink-0">{fmtBytes(size)}</span>
        </div>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="mt-1.5 rounded-xl overflow-hidden max-w-sm border border-white/[0.06] bg-ink-800/60 px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🎵</span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-100 truncate">{name}</p>
            <p className="text-[10px] text-ink-400">{fmtBytes(size)}</p>
          </div>
        </div>
        <audio src={safeUrl ?? undefined} controls preload="metadata" className="w-full h-8" style={{ display: 'block' }} />
      </div>
    );
  }

  return (
    <a
      href={safeUrl ?? '#'}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className="mt-1.5 flex items-center gap-3 max-w-sm rounded-xl border border-white/[0.06] bg-ink-800/60 px-3 py-2.5 hover:bg-ink-700/60 hover:border-white/10 transition-colors"
    >
      <span className="text-2xl shrink-0">{fileIcon(type)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ink-100 truncate">{name}</p>
        <p className="text-[10px] text-ink-400">{fmtBytes(size)}</p>
      </div>
    </a>
  );
}
