/**
 * Message animation system.
 * Two tiers:
 *   1. TEXT class  — applied to the message body span (movement/colour on text)
 *   2. ROW class   — applied to the outer message row (background glow/flash)
 *   3. PARTICLES   — canvas overlay spawned over the row for fireworks/confetti
 */

// ── CSS class maps ────────────────────────────────────────────────────────────

export const TEXT_CLASS: Record<string, string> = {
  // Free
  wave: 'anim-wave', shake: 'anim-shake', bounce: 'anim-bounce', slide: 'anim-slide',
  spin: 'anim-spin', big: 'anim-big', think: 'anim-think', fade: 'anim-fade',
  drop: 'anim-drop', pop: 'anim-pop', flip: 'anim-flip', pulse: 'anim-pulse',
  zigzag: 'anim-zigzag', ghost: 'anim-ghost', zoom: 'anim-zoom', rush: 'anim-rush',
  // Paid — text effects
  rainbow: 'anim-rainbow', neon: 'anim-neon', glitch: 'anim-glitch',
  matrix: 'anim-matrix', shatter: 'anim-shatter',
  neonSign: 'anim-neonSign', hologram: 'anim-hologram', aurora: 'anim-aurora',
  inferno: 'anim-inferno', vortex: 'anim-vortex', iceStorm: 'anim-iceStorm',
  singularity: 'anim-singularity',
};

export const ROW_CLASS: Record<string, string> = {
  // Paid — row-level glow/flash
  lightning:    'anim-row-lightning',
  thunderstrike:'anim-row-thunderstrike',
  shockwave:    'anim-row-shockwave',
  supernova:    'anim-row-supernova',
  plasma:       'anim-row-plasma',
  // confetti/fireworks get row class too for the initial flash
  fireworks:    'anim-row-fireworks',
  confetti:     'anim-row-confetti',
};

// These types also spawn canvas particles
export const PARTICLE_TYPES = new Set(['fireworks', 'confetti']);

// ── Canvas particle engine ────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; color: string;
  shape: 'circle' | 'rect' | 'star';
  rotation: number; rotSpeed: number;
}

const FIREWORK_COLORS = [
  '#fbbf24','#f59e0b','#f97316','#ef4444',
  '#a78bfa','#818cf8','#22d3ee','#34d399',
  '#fff','#fcd34d',
];

const CONFETTI_COLORS = [
  '#f87171','#fb923c','#fbbf24','#a3e635',
  '#34d399','#22d3ee','#818cf8','#e879f9',
  '#f9a8d4','#fff',
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function spawnFireworks(canvas: HTMLCanvasElement, cx: number, cy: number) {
  const particles: Particle[] = [];
  for (let i = 0; i < 80; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1.5, 6);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0.5, 2.5),
      life: 1, maxLife: rand(0.7, 1.0),
      size: rand(3, 7),
      color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
      shape: Math.random() > 0.5 ? 'circle' : 'star',
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.15, 0.15),
    });
  }
  // decay 0.007 → particles live ~140 frames (~2.3s at 60fps)
  runParticles(canvas, particles, 0.007, true);
}

function spawnConfetti(canvas: HTMLCanvasElement) {
  const particles: Particle[] = [];
  for (let i = 0; i < 100; i++) {
    particles.push({
      x: rand(0, canvas.width),
      y: rand(-40, -5),
      vx: rand(-1.5, 1.5),
      vy: rand(1.2, 3.5),
      life: 1, maxLife: 1,
      size: rand(7, 14),
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      shape: Math.random() > 0.3 ? 'rect' : 'circle',
      rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.1, 0.1),
    });
  }
  // decay 0.004 → particles live ~250 frames (~4s at 60fps)
  runParticles(canvas, particles, 0.004, false);
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const ox = (i === 0 ? 'move' : 'line') === 'move';
    if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    else ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
}

function runParticles(
  canvas: HTMLCanvasElement,
  particles: Particle[],
  decay: number,
  gravity: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let frameId: number;
  // Scale decay so fireworks last ~3s, confetti ~4s regardless of FPS
  const scaledDecay = decay;

  function tick() {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of particles) {
      p.life -= scaledDecay;
      if (p.life <= 0) continue;
      alive = true;

      p.x += p.vx;
      p.y += p.vy;
      if (gravity) p.vy += 0.18; // gravity
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.rotation += p.rotSpeed;

      ctx!.save();
      ctx!.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx!.fillStyle = p.color;
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);

      if (p.shape === 'circle') {
        ctx!.beginPath();
        ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx!.fill();
      } else if (p.shape === 'rect') {
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        drawStar(ctx!, 0, 0, p.size / 2);
      }

      ctx!.restore();
    }

    if (alive) {
      frameId = requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }

  frameId = requestAnimationFrame(tick);

  // Safety cleanup after 6s
  setTimeout(() => {
    cancelAnimationFrame(frameId);
    canvas.remove();
  }, 6000);
}

// ── Public trigger ─────────────────────────────────────────────────────────────

export function triggerParticles(rowEl: HTMLElement, type: string) {
  if (!PARTICLE_TYPES.has(type)) return;

  const canvas = document.createElement('canvas');
  const rect = rowEl.getBoundingClientRect();

  canvas.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top - 40}px;
    width: ${Math.max(rect.width, 400)}px;
    height: ${rect.height + 120}px;
    pointer-events: none;
    z-index: 9999;
  `;
  canvas.width  = Math.max(rect.width, 400);
  canvas.height = rect.height + 120;

  document.body.appendChild(canvas);

  if (type === 'fireworks') {
    const cx = canvas.width / 2;
    const cy = 60;
    spawnFireworks(canvas, cx, cy);
    // Second and third bursts for more drama
    setTimeout(() => {
      if (canvas.isConnected) spawnFireworks(canvas, cx + rand(-100, 100), cy + rand(-30, 20));
    }, 600);
    setTimeout(() => {
      if (canvas.isConnected) spawnFireworks(canvas, cx + rand(-60, 60), cy + rand(-10, 30));
    }, 1200);
  } else if (type === 'confetti') {
    spawnConfetti(canvas);
  }
}
