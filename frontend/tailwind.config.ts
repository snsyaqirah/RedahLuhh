import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff1f2",
          100: "#ffe4e6",
          400: "#f0516d",
          500: "#e94560",
          600: "#d4305a",
          700: "#be1d54",
          900: "#881337",
        },
        dark: {
          900: "#0a0a0f",
          800: "#111118",
          700: "#1a1a2e",
          600: "#16213e",
          500: "#0f3460",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "ride": "ride 2.2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        ride: {
          "0%":   { left: "0%",   transform: "scaleX(1)" },
          "48%":  { left: "82%",  transform: "scaleX(1)" },
          "50%":  { left: "82%",  transform: "scaleX(-1)" },
          "98%":  { left: "0%",   transform: "scaleX(-1)" },
          "100%": { left: "0%",   transform: "scaleX(1)" },
        },
        shimmer: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
