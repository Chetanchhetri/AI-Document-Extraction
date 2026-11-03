/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#0B0F17',
        panel: 'var(--surface)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-soft': 'var(--surface-soft)',
        'surface-input': 'var(--surface-input)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        quiet: 'var(--quiet)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        'accent-soft': 'var(--accent-soft)',
        cyan: { DEFAULT: '#06B6D4', 300: '#67E8F9', 400: '#22D3EE', 500: '#06B6D4' },
        emerald: '#10B981',
        amber: '#F59E0B',
        crimson: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
