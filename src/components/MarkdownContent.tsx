import React, { useMemo } from 'react';

// Module-level key counter — safe because React reconciles by position, not global ID.
// We reset per-render via useMemo, so keys are stable within a single message render.
let _globalKey = 0;

function nextKey() {
  return String(++_globalKey);
}

export function MarkdownContent({
  text,
  className,
  meId,
}: {
  text: string;
  className?: string;
  meId?: string;
}) {
  const nodes = useMemo(() => {
    _globalKey = 0;
    return parseBlocks(text, meId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, meId]);
  return <span className={className}>{nodes}</span>;
}

/** Split fenced code blocks (``` ... ```) from prose content. */
function parseBlocks(text: string, meId?: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) addLines(text.slice(cursor, m.index), result, meId);
    const code = m[2].replace(/^\n|\n$/g, '');
    result.push(
      <pre
        key={nextKey()}
        className="my-1.5 rounded-lg bg-ink-950/80 border border-white/[0.06] px-3 py-2 text-[12px] font-mono text-emerald-300 overflow-x-auto whitespace-pre"
      >
        <code>{code}</code>
      </pre>,
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) addLines(text.slice(cursor), result, meId);
  return result;
}

/** Break into lines, handle blockquotes, add <br> between non-blockquote lines. */
function addLines(text: string, out: React.ReactNode[], meId?: string) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const notLast = i < lines.length - 1;
    if (line.startsWith('> ')) {
      out.push(
        <blockquote
          key={nextKey()}
          className="my-0.5 border-l-2 border-accent-violet/50 pl-3 italic text-ink-300"
        >
          {parseInline(line.slice(2), meId)}
        </blockquote>,
      );
    } else {
      parseInline(line, meId).forEach((n) => out.push(n));
      if (notLast) out.push(<br key={nextKey()} />);
    }
  });
}

// Ordered: longer/higher-priority patterns first.
// Groups: 1=full, 2=mention-name, 3=mention-id, 4=bold**, 5=bold__, 6=strike,
//         7=italic*, 8=italic_, 9=inline-code, 10=url
const INLINE_RE =
  /(@\[([^\]]+)\]\(([^)]+)\)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|~~([^~\n]+?)~~|\*([^*\n]+?)\*|_([^_\n]+?)_|`([^`\n]+?)`|https?:\/\/[^\s<>"')\]]+)/g;

function parseInline(text: string, meId?: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let cursor = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > cursor) result.push(text.slice(cursor, m.index));
    const full = m[0];
    if (m[2] !== undefined) {
      // @[DisplayName](userId) mention
      const displayName = m[2];
      const userId = m[3];
      const isMe = meId && userId === meId;
      result.push(
        <span
          key={nextKey()}
          className={
            isMe
              ? 'inline-flex items-center rounded px-1 py-0 text-[13px] font-semibold bg-accent-violet/25 text-accent-violet ring-1 ring-accent-violet/40 cursor-default'
              : 'inline-flex items-center rounded px-1 py-0 text-[13px] font-medium bg-white/[0.07] text-ink-200 hover:bg-white/[0.12] cursor-default transition-colors'
          }
        >
          @{displayName}
        </span>,
      );
    } else if (m[4] !== undefined) {
      result.push(
        <strong key={nextKey()} className="font-semibold text-ink-100">
          {m[4]}
        </strong>,
      );
    } else if (m[5] !== undefined) {
      result.push(
        <u key={nextKey()} className="underline">
          {m[5]}
        </u>,
      );
    } else if (m[6] !== undefined) {
      result.push(
        <del key={nextKey()} className="line-through opacity-60">
          {m[6]}
        </del>,
      );
    } else if (m[7] !== undefined) {
      result.push(
        <em key={nextKey()} className="italic text-ink-200">
          {m[7]}
        </em>,
      );
    } else if (m[8] !== undefined) {
      result.push(
        <em key={nextKey()} className="italic text-ink-200">
          {m[8]}
        </em>,
      );
    } else if (m[9] !== undefined) {
      result.push(
        <code
          key={nextKey()}
          className="px-[5px] py-px rounded bg-ink-950/80 text-rose-300 text-[12.5px] font-mono border border-white/[0.06]"
        >
          {m[9]}
        </code>,
      );
    } else if (full.startsWith('http')) {
      try {
        const url = new URL(full);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          result.push(
            <a
              key={nextKey()}
              href={full}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-violet hover:underline break-all"
            >
              {full}
            </a>,
          );
        } else {
          result.push(full);
        }
      } catch {
        result.push(full);
      }
    } else {
      result.push(full);
    }
    cursor = m.index + full.length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}
