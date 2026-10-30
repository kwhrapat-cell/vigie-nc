import type { Config } from "tailwindcss";

// Couleurs reprises des maquettes validées (thème sombre « lagon / terre
// rouge »). Les couleurs des catégories (danger, perturbation, météo) et
// des niveaux de fiabilité sont aussi dans lib/types.ts pour la carte.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Ordinateur et tablette en paysage : 960 px au lieu de 1024, pour
      // que la « version pour ordinateur » de Chrome sur téléphone (980 px)
      // et les petites fenêtres montrent aussi la mise en page ordinateur.
      // Même valeur dans les @media de globals.css.
      screens: {
        lg: "960px",
      },
      colors: {
        void: "#081317", // fond de page
        panel: "#0E1C21", // cartes, feuilles
        "panel-2": "#132830", // éléments en relief
        line: "#1E363D", // bordures
        lagoon: "#22B8B0", // accent
        "lagoon-dim": "#7FC9C4",
        primary: "#167F78", // boutons principaux (blanc dessus : 4,8 pour 1, lisible au soleil)
        "primary-strong": "#136B65", // bouton appuyé : un peu plus foncé
        rust: "#C1440E",
        "rust-bright": "#E8622F",
        ochre: "#E8A33D",
        danger: "#E5484D",
        warn: "#F0912E",
        info: "#3B82F6",
        ok: "#2BB673",
        mist: "#EAF6F4",
        "mist-dim": "#93B0AD",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        "fab-in": {
          from: { opacity: "0", transform: "scale(0.5)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.6)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        blink: "blink 1.6s ease-in-out infinite",
        "fab-in": "fab-in 0.5s 0.3s backwards cubic-bezier(.2,.8,.2,1)",
        "pop-in": "pop-in 0.45s cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
