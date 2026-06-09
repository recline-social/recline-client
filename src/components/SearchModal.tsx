import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SearchResult = {
  id: string;
  kind: 'channel' | 'dm';
  containerId: string;       // channelId or dmChannelId
  containerName: string;     // "#room · Space" or "@displayName"
  senderName: string;
  body: string;
  createdAt: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Runs the query against in-memory decrypted messages. */
  search: (query: string) => SearchResult[];
  onSelect: (result: SearchResult) => void;
};

function highlight(body: string, q: string) {
  if (!q) return body;
  const idx = body.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return body.length > 140 ? body.slice(0, 140) + '…' : body;
  // Window the snippet around the match
  const start = Math.max(0, idx - 40);
  const end = Math.min(body.length, idx + q.length + 80);
  const pre = (start > 0 ? '…' : '') + body.slice(start, idx);
  const match = body.slice(idx, idx + q.length);
  const post = body.slice(idx + q.length, end) + (end < body.length ? '…' : '');
  return (
    <>
      {pre}
      <mark className="bg-accent-violet/30 text-ink-100 rounded px-0.5">{match}</mark>
      {post}
    </>
  );
}

export function SearchModal({ open, onClose, search, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      // focus shortly after mount so the portal is in the DOM
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => (query.trim().length >= 2 ? search(query.trim()) : []), [query, search]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[10vh]"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden bg-ink-900 border border-white/[0.09] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-400 shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your messages…"
            className="flex-1 bg-transparent text-[14px] text-ink-100 placeholder-ink-500 outline-none"
          />
          <kbd className="text-[10px] text-ink-500 border border-white/10 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-4 py-6 text-center text-[12px] text-ink-500">
              Type at least 2 characters. Search covers messages decrypted on this device.
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-ink-500">No matches in loaded messages.</div>
          ) : (
            <ul className="py-1">
              {results.map((r) => (
                <li key={`${r.kind}:${r.containerId}:${r.id}`}>
                  <button
                    onClick={() => { onSelect(r); onClose(); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2 text-[11px] text-ink-400 mb-0.5">
                      <span className="font-medium text-ink-300 truncate">{r.containerName}</span>
                      <span className="shrink-0">· {r.senderName}</span>
                      <span className="shrink-0 ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-[13px] text-ink-200 line-clamp-2">{highlight(r.body, query.trim())}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/[0.07] text-[10px] text-ink-500">
          End-to-end encrypted — only messages this device has decrypted are searchable.
        </div>
      </div>
    </div>,
    document.body,
  );
}
