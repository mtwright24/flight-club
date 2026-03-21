/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Flight Club brand reds (background + glossy accents)
        fcRed0: "#2b060c",     // deep vignette
        fcRed1: "#5d0b17",     // dark base red
        fcRed2: "#8b0f22",     // primary red
        fcRed3: "#b5161e",     // bright red
        fcRed4: "#ff3b3b",     // highlight red

        // Glass + text
        fcGlass: "rgba(255,255,255,0.12)",
        fcGlass2: "rgba(255,255,255,0.18)",
        fcGlassBorder: "rgba(255,255,255,0.22)",
        fcWhite: "#ffffff",
        fcTextDim: "rgba(255,255,255,0.78)",
        fcTextMute: "rgba(255,255,255,0.60)",
      },
      borderRadius: {
        fcPill: 9999,
        fcCard: 28,
        fcInput: 18,
      },
      spacing: {
        fcPad: 24,
      },
      fontSize: {
        fcTitle: 34,
        fcTag: 14,
      },
      boxShadow: {
        // Note: RN support varies; still useful when NativeWind maps to RN shadow props.
        fcGlow: "0 10px 30px rgba(255, 59, 59, 0.25)",
        fcSoft: "0 12px 30px rgba(0, 0, 0, 0.22)",
      },
    },
  },
  plugins: [],
};