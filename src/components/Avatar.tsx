import { userColor, initialsOf } from '../lib/colors';
import { getServerUrl } from '../lib/serverUrl';
import { StatusDot, type PresenceStatus } from './StatusDot';

type Props = {
  name: string;
  id?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isSelf?: boolean;
  /** Preferred: explicit three-state presence. Overrides `online` when provided. */
  status?: PresenceStatus;
  /** Legacy boolean convenience — true = 'online', false = 'offline'. Ignored when
   *  `status` is set. */
  online?: boolean;
  /** Uploaded image URL (e.g. /uploads/hex.jpg). When set, renders an <img>
   *  instead of the initials avatar. Relative /uploads/ paths are resolved
   *  against the configured server URL. */
  imageUrl?: string | null;
};

const sizes = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

export function Avatar({ name, id, size = 'md', isSelf, status, online, imageUrl }: Props) {
  const seed = id ?? name;
  const c = userColor(seed, isSelf);

  // Resolve effective status: explicit `status` wins; fall back to boolean `online`.
  const effectiveStatus: PresenceStatus | undefined =
    status !== undefined
      ? status
      : online !== undefined
        ? (online ? 'online' : 'offline')
        : undefined;

  // Resolve relative /uploads/ paths against the server URL
  const resolvedUrl = imageUrl
    ? imageUrl.startsWith('/')
      ? (getServerUrl() || '') + imageUrl
      : imageUrl
    : null;

  return (
    <div className="relative shrink-0">
      {resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt={name}
          className={`${sizes[size]} rounded-full object-cover`}
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
          onError={(e) => {
            // On load error, hide the img — the parent will fall back to initials
            // by re-rendering without imageUrl after this, but since we can't
            // trigger a React state change from here, just hide it gracefully.
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          className={`${sizes[size]} rounded-full grid place-items-center font-semibold tracking-wide`}
          style={{
            color: c.text,
            background: c.soft,
            boxShadow: `inset 0 0 0 1px ${c.ring}`,
          }}
        >
          {initialsOf(name)}
        </div>
      )}
      {effectiveStatus !== undefined && (
        <StatusDot
          status={effectiveStatus}
          size="sm"
          className="absolute -bottom-0.5 -right-0.5"
        />
      )}
    </div>
  );
}
