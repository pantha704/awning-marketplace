/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // A market street: tomato-red awnings, white canvas, ink signage, marigold price stickers.
        paper: '#F5F4F0',
        ink: { DEFAULT: '#17181C', soft: '#474A52', faint: '#72757D' },
        line: { DEFAULT: '#E2E0DA', strong: '#CCCAC3' },
        brand: { DEFAULT: '#D4402B', dark: '#B2311F', light: '#FBE8E4' },
        star: { DEFAULT: '#F2A20C', light: '#FDF1D6', deep: '#8A5A00' },
        go: { DEFAULT: '#1D7F54', light: '#E3F3EA' },
        night: { DEFAULT: '#17181C', 800: '#22242A', 700: '#2E3038' },
      },
      fontFamily: {
        display: ['"Archivo Variable"', 'Archivo', '"Arial Narrow"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans Variable"', '"Instrument Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      borderRadius: { panel: '12px' },
      boxShadow: {
        lift: '0 1px 0 rgba(23,24,28,.04), 0 10px 24px -14px rgba(23,24,28,.25)',
        pop: '0 16px 48px -12px rgba(23,24,28,.4)',
      },
      maxWidth: { page: '80rem' },
      keyframes: {
        toast: { from: { opacity: '0', transform: 'translateY(8px) scale(.98)' }, to: { opacity: '1', transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { from: { opacity: '0', transform: 'scale(.97)' }, to: { opacity: '1', transform: 'none' } },
        drawer: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        bump: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.35)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { to: { backgroundPosition: '-200% 0' } },
        unroll: { from: { clipPath: 'inset(0 0 100% 0)' }, to: { clipPath: 'inset(0 0 0 0)' } },
      },
      animation: {
        toast: 'toast .18s ease-out both',
        fade: 'fade .15s ease-out both',
        pop: 'pop .16s cubic-bezier(.2,.8,.2,1) both',
        drawer: 'drawer .22s cubic-bezier(.2,.8,.2,1) both',
        bump: 'bump .3s ease-out',
        shimmer: 'shimmer 1.4s linear infinite',
        unroll: 'unroll .5s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};
