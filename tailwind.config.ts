import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        surface: "hsl(var(--surface) / <alpha-value>)",
        "surface-2": "hsl(var(--surface-2) / <alpha-value>)",
        elevated: "hsl(var(--elevated) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        violet: {
          DEFAULT: "hsl(var(--violet) / <alpha-value>)",
          soft: "hsl(var(--violet) / 0.16)",
        },
        fuchsia: { DEFAULT: "hsl(var(--fuchsia) / <alpha-value>)" },
        cyan: { DEFAULT: "hsl(var(--cyan) / <alpha-value>)" },
        bio: { DEFAULT: "#10B981", light: "#34D399", dark: "#059669" },
        chem: { DEFAULT: "#06B6D4", light: "#22D3EE", dark: "#0891B2" },
        phy: { DEFAULT: "#8B5CF6", light: "#A78BFA", dark: "#7C3AED" },
        agri: { DEFAULT: "#F59E0B", light: "#FBBF24", dark: "#D97706" },
        math: { DEFAULT: "#EF4444", light: "#F87171", dark: "#DC2626" },
        ict: { DEFAULT: "#EC4899", light: "#F472B6", dark: "#DB2777" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
        "3xl": "calc(var(--radius) + 18px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 3px)",
        sm: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "2xl": "var(--shadow-2xl)",
        inset: "inset 0 1px 0 0 hsl(var(--foreground) / 0.06)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.28), 0 8px 32px -8px hsl(var(--primary) / 0.45)",
        "glow-lg": "0 0 0 1px hsl(var(--primary) / 0.35), 0 16px 56px -12px hsl(var(--primary) / 0.6)",
        float: "var(--shadow-xl), 0 0 0 1px hsl(var(--border) / 0.6)",
        none: "none",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)",
        "gradient-primary-hover":
          "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 60%, hsl(var(--primary)) 100%)",
        "gradient-surface": "linear-gradient(180deg, hsl(var(--elevated)) 0%, hsl(var(--card)) 100%)",
        "gradient-brand": "linear-gradient(135deg, #8B5CF6 0%, #D946EF 50%, #22D3EE 100%)",
        "gradient-aurora":
          "linear-gradient(120deg, hsl(var(--violet)) 0%, hsl(var(--fuchsia)) 50%, hsl(var(--cyan)) 100%)",
        "gradient-aurora-soft":
          "linear-gradient(120deg, hsl(var(--violet) / 0.22) 0%, hsl(var(--fuchsia) / 0.12) 50%, hsl(var(--cyan) / 0.2) 100%)",
        "gradient-sheen":
          "linear-gradient(180deg, hsl(0 0% 100% / 0.09) 0%, transparent 60%)",
        "gradient-shimmer":
          "linear-gradient(90deg, transparent 0%, hsl(var(--foreground) / 0.07) 50%, transparent 100%)",
        "grid-pattern":
          "linear-gradient(hsl(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.4) 1px, transparent 1px)",
        "dot-pattern":
          "radial-gradient(circle at center, hsl(var(--foreground) / 0.14) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-pattern": "32px 32px",
        "dot-pattern": "22px 22px",
      },
      backdropBlur: {
        xs: "2px",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-out-quart": "cubic-bezier(0.76, 0, 0.24, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "fade-down": {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in": { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(0)" } },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(var(--primary) / 0.35)" },
          "50%": { boxShadow: "0 0 44px hsl(var(--primary) / 0.65)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "shimmer-pulse": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "ring-expand": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
        "bubble-in": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.96)" },
          "60%": { transform: "translateY(-1px) scale(1.006)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "sheet-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "wave-1": { "0%,100%": { transform: "scaleY(0.4)" }, "50%": { transform: "scaleY(1)" } },
        "wave-2": { "0%,100%": { transform: "scaleY(0.6)" }, "50%": { transform: "scaleY(0.9)" } },
        "wave-3": { "0%,100%": { transform: "scaleY(0.3)" }, "50%": { transform: "scaleY(1)" } },
        "caret-blink": { "0%,70%,100%": { opacity: "1" }, "20%,50%": { opacity: "0" } },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
        "fade-in": "fade-in 0.25s ease-out",
        "fade-down": "fade-down 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        "scale-in": "scale-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "slide-in": "slide-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-up": "slide-up 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-down": "slide-down 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "shimmer-pulse": "shimmer-pulse 1.6s ease-in-out infinite",
        "float-y": "float-y 4s ease-in-out infinite",
        "ring-expand": "ring-expand 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "bubble-in": "bubble-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "sheet-up": "sheet-up 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
        "spin-slow": "spin-slow 8s linear infinite",
        "wave-1": "wave-1 1s ease-in-out infinite",
        "wave-2": "wave-2 1s ease-in-out 0.15s infinite",
        "wave-3": "wave-3 1s ease-in-out 0.3s infinite",
        "caret-blink": "caret-blink 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;