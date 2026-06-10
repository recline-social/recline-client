// Shared file attachment renderer — replaces the duplicated FileAttachmentView
// that used to live in both MessageRow and DmView.

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// URL safety guard — prevents javascript: and data: URIs from server-supplied URLs.
function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('/uploads/')) return true;
  if (url.startsWith('blob:')) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
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
  const isImage = type.startsWith('image/');
  const isVideo = type.startsWith('video/');
  const isAudio = type.startsWith('audio/');

  if (isImage) {
    return (
      <a
        href={isSafeUrl(url) ? url : '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-1.5 rounded-xl overflow-hidden max-w-sm border border-white/[0.06] hover:border-white/10 transition-colors"
      >
        <img src={isSafeUrl(url) ? url : undefined} alt={name} className="w-full max-h-64 object-contain bg-black/20" loading="lazy" />
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
        <video src={isSafeUrl(url) ? url : undefined} controls preload="metadata" className="w-full max-h-64 bg-black" style={{ display: 'block' }} />
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
        <audio src={isSafeUrl(url) ? url : undefined} controls preload="metadata" className="w-full h-8" style={{ display: 'block' }} />
      </div>
    );
  }

  return (
    <a
      href={isSafeUrl(url) ? url : '#'}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
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
