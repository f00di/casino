import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111713', panel: '#19211c', felt: '#1f5a43', feltDark: '#164333',
        cream: '#f7f1e3', gold: '#d3ad5b', muted: '#9aa79f', danger: '#d76d62',
      },
      boxShadow: { table: '0 28px 70px rgba(0,0,0,.42)', card: '0 8px 22px rgba(0,0,0,.28)' },
      animation: { deal: 'deal .35s ease-out both', pulseSoft: 'pulseSoft 1.5s ease-in-out infinite' },
      keyframes: {
        deal: { from: { opacity: '0', transform: 'translateY(-14px) scale(.92)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        pulseSoft: { '0%,100%': { boxShadow: '0 0 0 2px rgba(211,173,91,.2)' }, '50%': { boxShadow: '0 0 0 6px rgba(211,173,91,.08)' } },
      },
    },
  },
  plugins: [],
} satisfies Config;
