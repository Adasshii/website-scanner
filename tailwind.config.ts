import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "adashi-blue": "#006DFF",
        "adashi-science": "#0056E4",
        "adashi-pastel": "#99C5FF",
        "adashi-electric": "#98EEFF",
        "adashi-cyan": "#72CEFF",
        "adashi-crystal": "#4CAEFF",
        "adashi-gulf": "#001D4E",
        "adashi-onyx": "#111111",
        "adashi-berry": "#36318F",
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        body: ['"Inter"', '"Helvetica Neue"', "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 109, 255, 0.04), 0 4px 8px rgba(0, 109, 255, 0.06), 0 12px 24px rgba(0, 109, 255, 0.08)",
        "card-hover":
          "0 2px 4px rgba(0, 109, 255, 0.06), 0 8px 16px rgba(0, 109, 255, 0.08), 0 20px 40px rgba(0, 109, 255, 0.12)",
        elevated:
          "0 2px 4px rgba(0, 29, 78, 0.04), 0 8px 16px rgba(0, 29, 78, 0.06), 0 24px 48px rgba(0, 29, 78, 0.1)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "subtle-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0, 109, 255, 0.3)" },
          "50%": { boxShadow: "0 0 0 8px rgba(0, 109, 255, 0)" },
        },
      },
      animation: {
        "float-slow": "float 6s ease-in-out infinite",
        "float-medium": "float 4s ease-in-out infinite 1s",
        "cta-pulse": "subtle-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
