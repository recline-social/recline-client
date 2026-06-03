import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, subtitle, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4" onClick={onClose}>
      <div
        className="panel rounded-2xl sm:rounded-3xl w-full max-w-[420px] max-h-[90dvh] flex flex-col shadow-soft overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — always visible */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-ink-300 mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-ink-300 hover:text-ink-100 transition-colors mt-0.5"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* Scrollable content area */}
        <div className="overflow-y-auto flex-1 min-h-0 px-5 pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}
