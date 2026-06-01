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
          // Warm-dark, slight purple undertone — built on #0C0A0F
          950: '#0C0A0F',
          900: '#110E16',
          800: '#17131E',
          700: '#1E1927',
          600: '#261F31',
          500: '#30273C',
          400: '#44384F',
          300: '#6E6080',
          200: '#B0A5C4',
          100: '#EDE8F4',
        },
        accent: {
          violet: '#7EC4D4', // primary — muted teal (name kept for compat)
          rose:   '#C9A97A', // secondary — warm amber
          teal:   '#5BBFD0', // teal hover variant
          amber:  '#D4B885', // amber hover variant
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(126,196,212,0.18), 0 10px 36px -8px rgba(126,196,212,0.28)',
        soft: '0 8px 30px -10px rgba(0,0,0,0.75)',
        card: '0 4px 24px -4px rgba(0,0,0,0.55)',
      },
      backgroundImage: {
        'panel-grad':
          'linear-gradient(180deg, rgba(255,255,255,0.030) 0%, rgba(255,255,255,0.008) 100%)',
        // Three soft ambient orbs: teal top-left, amber bottom-right, purple mid-centre
        'app-grad': [
          'radial-gradient(900px 700px at 2% 0%, rgba(126,196,212,0.11), transparent 65%)',
          'radial-gradient(700px 600px at 98% 100%, rgba(201,169,122,0.08), transparent 65%)',
          'radial-gradient(1100px 900px at 50% 40%, rgba(90,60,140,0.06), transparent 70%)',
          'linear-gradient(180deg, #0C0A0F 0%, #110E16 100%)',
        ].join(', '),
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.4s ease-in-out infinite',
        fadeUp: 'fadeUp 0.18s ease-out both',
      },
    },
  },
  plugins: [],
};
