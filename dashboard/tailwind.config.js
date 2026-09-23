/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#0F1117",
        surface: {
          DEFAULT: "#161A23",
          hover: "#1C222E",
          elevated: "#1D2230"
        },
        border: {
          subtle: "#252A35",
          accent: "#3A4150",
          highlight: "#B8965A"
        },
        ivory: {
          DEFAULT: "#E8E0D0",
          dim: "#C4BCAB",
          muted: "#9E9789"
        },
        slate: {
          text: "#7A7F8E",
          muted: "#4F5565",
          dim: "#323846"
        },
        brass: {
          DEFAULT: "#B8965A",
          light: "#CEAE72",
          dark: "#8C713D",
          dim: "#4A3E26"
        },
        carmine: {
          DEFAULT: "#9B4040",
          light: "#B85555",
          dark: "#6E2A2A",
          dim: "#3D1D1D"
        },
        emerald: {
          DEFAULT: "#3D6E5A",
          light: "#4E8C73",
          dark: "#2A4B3D",
          dim: "#1B3128"
        },
        amber: {
          DEFAULT: "#C28B47",
          dim: "#4D361B"
        }
      },
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        mono: ['"DM Mono"', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'sans-serif'],
      },
      letterSpacing: {
        widest: '0.08em',
        terminal: '0.12em',
      }
    },
  },
  plugins: [],
}
