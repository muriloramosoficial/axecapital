/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { 900: '#05070a', 800: '#080b11', 700: '#0c1118', 600: '#121a25', 500: '#1a2432' },
        edge: '#1e2a3a',
        acid: '#4ade80',
        danger: '#f05252',
        amber: '#f5a524',
      },
      boxShadow: {
        panel: '0 20px 55px -22px rgba(2,8,20,0.85), 0 2px 10px -4px rgba(2,8,20,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
};
