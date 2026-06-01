import type { Member } from '../types';

export function TypingIndicator({ typing, members }: { typing: string[]; members: Record<string, Member> }) {
  if (typing.length === 0) return <div className="h-5" />;
  const names = typing
    .map((id) => members[id]?.displayName ?? members[id]?.username ?? 'someone')
    .slice(0, 3);
  const more = typing.length > 3 ? ` and ${typing.length - 3} more` : '';
  const verb = typing.length === 1 ? 'is typing' : 'are typing';
  const text = `${names.join(', ')}${more} ${verb}`;
  return (
    <div className="h-5 px-5 flex items-center gap-2 text-[11px] text-ink-300">
      <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-ink-200 animate-pulseDot" style={{ animationDelay: '0ms' }} />
        <span className="h-1 w-1 rounded-full bg-ink-200 animate-pulseDot" style={{ animationDelay: '200ms' }} />
        <span className="h-1 w-1 rounded-full bg-ink-200 animate-pulseDot" style={{ animationDelay: '400ms' }} />
      </span>
      <span className="truncate">{text}…</span>
    </div>
  );
}
