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
        forest: {
          DEFAULT: "#102C26",
          dark: "#0A1B17",
          light: "#184239",
          tint: "#22594D",
        },
        champagne: {
          DEFAULT: "#F7E7CE",
          soft: "#FDF8F2",
          dim: "#E5D2B5",
          accent: "#FFEFD9",
        },
        donkey: {
          DEFAULT: "#A79277",
          dark: "#8C785F",
          light: "#C3B097",
        },
        obsidian: {
          DEFAULT: "#090D0C",
          surface: "#0F1614",
          card: "#141C1A",
          elevated: "#1A2522",
          border: "#202E2A",
          muted: "#354843",
        },
      },
    },
  },
  plugins: [],
};

export default config;
