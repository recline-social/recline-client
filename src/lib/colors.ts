const PALETTE = [
  { name: 'teal', text: '#5ee0c0', soft: 'rgba(94,224,192,0.14)', ring: 'rgba(94,224,192,0.45)' },
  { name: 'sky', text: '#7cc3ff', soft: 'rgba(124,195,255,0.14)', ring: 'rgba(124,195,255,0.45)' },
  { name: 'violet', text: '#b39bff', soft: 'rgba(179,155,255,0.14)', ring: 'rgba(179,155,255,0.45)' },
  { name: 'rose', text: '#ff9ec0', soft: 'rgba(255,158,192,0.14)', ring: 'rgba(255,158,192,0.45)' },
  { name: 'amber', text: '#ffd485', soft: 'rgba(255,212,133,0.14)', ring: 'rgba(255,212,133,0.45)' },
  { name: 'lime', text: '#b4e882', soft: 'rgba(180,232,130,0.14)', ring: 'rgba(180,232,130,0.45)' },
  { name: 'cyan', text: '#8fe6f0', soft: 'rgba(143,230,240,0.14)', ring: 'rgba(143,230,240,0.45)' },
  { name: 'coral', text: '#ffae8c', soft: 'rgba(255,174,140,0.14)', ring: 'rgba(255,174,140,0.45)' },
  { name: 'mint', text: '#9ce6b4', soft: 'rgba(156,230,180,0.14)', ring: 'rgba(156,230,180,0.45)' },
  { name: 'lilac', text: '#d6a8ff', soft: 'rgba(214,168,255,0.14)', ring: 'rgba(214,168,255,0.45)' },
];

export const SELF_COLOR = {
  name: 'self',
  text: '#ffffff',
  soft: 'rgba(139,108,240,0.22)',
  ring: 'rgba(139,108,240,0.6)',
} as const;

function hash(s: string): number {
  // 32-bit FNV-1a — small, fast, deterministic, good distribution
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function userColor(idOrName: string, isSelf: boolean = false) {
  if (isSelf) return SELF_COLOR;
  const idx = hash(idOrName) % PALETTE.length;
  return PALETTE[idx];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
