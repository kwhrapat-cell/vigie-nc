import type { Config } from "tailwindcss";

// Tokens repris tels quels de la maquette de présentation (vigie-nc-maquette.html)
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#071B21",
        panel: "#0E2A31",
        "panel-2": "#123138",
        lagoon: "#22B8B0",
        "lagoon-dim": "#7FC9C4",
        rust: "#C1440E",
        "rust-bright": "#E8622F",
        ochre: "#E8A33D",
        mist: "#EAF6F4",
        "mist-dim": "#93B8B4",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      keyframes: {
        "beacon-pulse": {
          "0%, 100%": { opacity: "0.85", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        "fab-in": {
          from: { opacity: "0", transform: "scale(0.5)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "beacon-pulse": "beacon-pulse 3.2s ease-in-out infinite",
        blink: "blink 1.6s ease-in-out infinite",
        "fab-in": "fab-in 0.5s 0.5s backwards cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};

export default config;
