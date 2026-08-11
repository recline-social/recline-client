type Props = {
  className?: string;
  compact?: boolean;
};

const X_URL = 'https://x.com/ReclineApp';
const IG_URL = 'https://www.instagram.com/reclinechat';

export function SocialLinks({ className = '', compact = false }: Props) {
  return (
    <div className={className}>
      <div className={`flex items-center justify-center gap-3 ${compact ? 'text-[11px]' : 'text-xs'} text-ink-400`}>
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer me"
          className="inline-flex items-center gap-1.5 hover:text-ink-100 transition-colors"
          aria-label="Recline on X"
          title="Follow Recline on X"
        >
          <XIcon />
          <span>@ReclineApp</span>
        </a>
        <span className="text-ink-600">·</span>
        <a
          href={IG_URL}
          target="_blank"
          rel="noopener noreferrer me"
          className="inline-flex items-center gap-1.5 hover:text-ink-100 transition-colors"
          aria-label="Recline on Instagram"
          title="Follow Recline on Instagram"
        >
          <InstagramIcon />
          <span>@reclinechat</span>
        </a>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.188L24 22.847h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932L18.901 1.153Zm-1.29 19.494h2.04L6.486 3.24H4.298l13.313 17.407Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37a4 4 0 1 1-3.37-3.37 4 4 0 0 1 3.37 3.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

