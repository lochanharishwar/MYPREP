/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          light: '#fbfbfa',
          dark: '#1e1f22',
          grid: '#e2e4e8',
          gridDark: '#2b2d31',
        },
        ink: {
          charcoal: '#1a1b1e',
          blue: '#1e40af',
          emerald: '#059669',
          amber: '#d97706',
          rose: '#e11d48',
          purple: '#7c3aed',
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        handwritten: ['Caveat', 'cursive', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
