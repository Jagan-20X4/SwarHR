/** @type {import('tailwindcss').Config} */

// Indira IVF warm brand scale (pink → red). Leans toward red #dc3545.
const brandWarm = {
  50: "#fef2f4",
  100: "#fde6ea",
  200: "#fbccd5",
  300: "#f5a3b3",
  400: "#ee6e89",
  500: "#e84365",
  600: "#dc3550",
  700: "#c02742",
  800: "#9f2038",
  900: "#831a30",
  950: "#4d0a18",
};

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          pink: "#e83e8c",
          red: "#dc3545",
          dark: "#1a1a2e",
          tint: "#fff5f6",
        },
        // Global recolor: remap the old indigo/purple/violet theme onto the
        // Indira warm brand scale so the whole app shifts to brand colors.
        indigo: brandWarm,
        purple: brandWarm,
        violet: brandWarm,
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
