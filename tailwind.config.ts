import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#050505",
        panel: "#0f0f12",
        soft: "#18181b",
        text: "#f8fafc",
        muted: "#a1a1aa",
        line: "#27272a"
      }
    }
  },
  plugins: []
};
export default config;
