export type PresenceStatus = 'online' | 'away' | 'offline';

type Props = {
  status: PresenceStatus;
  /** 'sm' = 10px dot (avatar overlay), 'md' = 12px dot (standalone) */
  size?: 'sm' | 'md';
  /** Background color of the parent surface — used for the ring. Defaults to ink-900. */
  ringColor?: string;
  className?: string;
};

const dotSize = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
};

const statusColor: Record<PresenceStatus, string> = {
  online: 'bg-green-500',
  away:   'bg-yellow-400',
  offline: 'bg-zinc-500',
};

/** Small colored dot with a white/dark ring, designed to sit on top of avatars. */
export function StatusDot({ status, size = 'sm', ringColor, className = '' }: Props) {
  return (
    <span
      className={`rounded-full border-2 border-ink-900 transition-colors ${dotSize[size]} ${statusColor[status]} ${className}`}
      style={ringColor ? { borderColor: ringColor } : undefined}
      aria-label={status}
    />
  );
}
