/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI Variable"', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Segoe UI Variable Display"', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Code"', 'Consolas', 'monospace'],
      },
      colors: {
        accent: 'rgb(var(--accent) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
      },
      borderRadius: { xl2: '14px', win: '12px' },
      boxShadow: {
        glass: '0 0 0 0.5px rgba(0,0,0,.25), 0 10px 40px -8px rgba(0,0,0,.45), inset 0 0.5px 0 rgba(255,255,255,.25)',
        pop: '0 0 0 0.5px rgba(0,0,0,.3), 0 18px 50px -10px rgba(0,0,0,.55)',
      },
    },
  },
  plugins: [],
};
