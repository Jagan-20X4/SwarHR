/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          red: "#dc3545",
          dark: "#1a1a2e",
          tint: "#fff5f6",
        },
      },
      keyframes: {
        splashIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "15%": { transform: "scale(1.18)" },
          "30%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.12)" },
          "60%": { transform: "scale(1)" },
        },
      },
      animation: {
        splashIn: "splashIn 0.4s ease-out",
        heartbeat: "heartbeat 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
