import { lazy, Suspense } from 'react';

// PERF-001: EmojiPicker is ~1,100 lines of component + emoji data and was
// bundled into the entry chunk despite only mounting when a picker opens.
// This wrapper code-splits it; the inner chunk loads on first open.
const EmojiPickerInner = lazy(() =>
  import('./EmojiPicker').then((m) => ({ default: m.EmojiPicker })),
);

type Props = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  compact?: boolean;
};

export function EmojiPicker(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="w-72 h-48 rounded-2xl bg-ink-900 border border-white/[0.08] shadow-2xl grid place-items-center text-[11px] text-ink-400">
          Loading emoji…
        </div>
      }
    >
      <EmojiPickerInner {...props} />
    </Suspense>
  );
}
