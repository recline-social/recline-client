/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          // True neutral dark — zinc-based, no purple/violet cast
          950: '#0F0F12',   // near-black base
          900: '#18181C',   // main panel surface
          800: '#222228',   // elevated surface
          700: '#2E2E36',   // hover / active
          600: '#3C3C46',   // subtle borders, dividers
          500: '#4E4E5A',   // muted elements
          400: '#6C6C7A',   // placeholder / disabled
          300: '#9696A4',   // secondary text
          200: '#C4C4D0',   // body text
          100: '#F2F2F6',   // primary text — clean white, no color cast
        },
        accent: {
          // Name kept for backwards compat — values are now blue/red/neutral
          violet: '#4F75FF', // primary blue — clear, high-contrast, not AI-teal
          rose:   '#F24F5A', // danger red
          teal:   '#3A5BE8', // blue pressed/hover
          amber:  '#E8A030', // warm amber for sparks / money
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(79,117,255,0.18), 0 8px 28px -6px rgba(79,117,255,0.22)',
        soft: '0 8px 30px -10px rgba(0,0,0,0.80)',
        card: '0 4px 20px -4px rgba(0,0,0,0.60)',
      },
      backgroundImage: {
        'panel-grad':
          'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.006) 100%)',
        // Flat dark — no gradient orbs, no AI-startup ambient glow
        'app-grad': 'linear-gradient(180deg, #0F0F12 0%, #18181C 100%)',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '0.3' },
          '50%':       { opacity: '1' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.4s ease-in-out infinite',
        fadeUp:   'fadeUp 0.18s ease-out both',
      },
    },
  },
  plugins: [],
};
