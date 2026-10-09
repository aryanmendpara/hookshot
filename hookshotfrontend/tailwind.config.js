export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Theme-driven tokens resolve to CSS variables declared in index.css
      // (:root dark, [data-theme="light"] light, system default for nobody's
      // choice). <alpha-value> keeps every opacity modifier (border-outline/40,
      // bg-status-success/10, ...) working. Tokens kept as hex either never
      // appear in src/ or are mode-agnostic (ink, overlay scrim).
      colors: {
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-dim": "rgb(var(--surface-dim) / <alpha-value>)",
        "on-primary": "rgb(var(--on-primary) / <alpha-value>)",
        "text-subtle": "#8fa2b4",
        "surface-container-highest": "#1e2f42",
        "on-tertiary": "#223148",
        "on-secondary-container": "#b0c9e3",
        "on-error": "#690005",
        "on-secondary": "#0c1821",
        "on-secondary-fixed": "#011d31",
        "on-surface-variant": "rgb(var(--on-surface-variant) / <alpha-value>)",
        outline: "rgb(var(--outline) / <alpha-value>)",
        "inverse-on-surface": "#0c1821",
        "canvas-black": "#000000",
        "deep-black": "#020405",
        "on-error-container": "#ffdad6",
        "status-success": "rgb(var(--status-success) / <alpha-value>)",
        tertiary: "#dde8ff",
        "secondary-fixed": "#cce5ff",
        "secondary-fixed-dim": "#b0c9e3",
        "inverse-surface": "#e2e1ec",
        "surface-container": "rgb(var(--surface-container) / <alpha-value>)",
        "on-tertiary-fixed-variant": "#394760",
        "on-primary-container": "#1b1a28",
        "surface-variant": "rgb(var(--surface-variant) / <alpha-value>)",
        "on-tertiary-container": "#48566f",
        "status-warning": "rgb(var(--status-warning) / <alpha-value>)",
        "on-primary-fixed-variant": "#464555",
        "on-secondary-fixed-variant": "#31495e",
        "surface-deep": "rgb(var(--surface-deep) / <alpha-value>)",
        "surface-container-low": "rgb(var(--surface-container-low) / <alpha-value>)",
        "surface-bright": "#1e2f42",
        background: "rgb(var(--background) / <alpha-value>)",
        "error-container": "rgb(var(--error-container) / <alpha-value>)",
        "inverse-primary": "#5e5d6d",
        "outline-variant": "rgb(var(--outline-variant) / <alpha-value>)",
        "on-surface": "rgb(var(--on-surface) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "surface-container-lowest":
          "rgb(var(--surface-container-lowest) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
        "primary-container": "rgb(var(--primary-container) / <alpha-value>)",
        "surface-tint": "#ccc9dc",
        "primary-fixed-dim": "rgb(var(--primary-fixed-dim) / <alpha-value>)",
        "status-failure": "rgb(var(--status-failure) / <alpha-value>)",
        "tertiary-fixed": "#d5e3ff",
        "text-silver": "rgb(var(--text-silver) / <alpha-value>)",
        secondary: "rgb(var(--secondary) / <alpha-value>)",
        "primary-fixed": "#e3e0f4",
        "on-tertiary-fixed": "#0c1c32",
        "tertiary-container": "#1b2a41",
        "secondary-container": "rgb(var(--secondary-container) / <alpha-value>)",
        "surface-container-high": "#1a2a3b",
        "on-primary-fixed": "#1b1a28",
        "tertiary-fixed-dim": "#b8c7e5",
        "on-background": "#e2e1ec",
        "surface-slate": "#142131",
        error: "rgb(var(--error) / <alpha-value>)",
      },
      // 0.75rem here made `rounded-full` render as a 12px squircle (the header
      // avatar). Circles/pills clamp in CSS anyway, so 9999px only changes the
      // avatar — into the circle the design doc's shape spec calls for.
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "9999px",
      },
      spacing: {
        "space-md": "0.75rem",
        "space-lg": "1rem",
        "gutter-mobile": "0.75rem",
        "space-xl": "1.5rem",
        gutter: "1rem",
        "space-sm": "0.5rem",
        margin: "1.5rem",
        "space-xs": "0.25rem",
        "margin-mobile": "1rem",
      },
      fontFamily: {
        "body-sm": ["Inter"],
        "code-lg": ["JetBrains Mono"],
        "headline-sm": ["Inter"],
        "headline-lg": ["Inter"],
        "code-md": ["JetBrains Mono"],
        "code-sm": ["JetBrains Mono"],
        "headline-md": ["Inter"],
        "label-md": ["JetBrains Mono"],
        "body-md": ["Inter"],
        "label-sm": ["JetBrains Mono"],
      },
      // Bumped one step up the ramp. The old floor was code-sm/label-sm at 11px,
      // which was genuinely hard to read on a laptop screen. Tokens only — every
      // call site already uses these names, so nothing in src/ changed.
      // ponytail: fixed px heights (h-7, h-8) still clear the new line-heights.
      // If a badge ever clips, raise the container, not shrink the type back.
      // Tokens only — every call site already uses these names, so nothing in
      // src/ changed when the scale moved.
      //
      // The small tier (code-sm through body-md) is what carries table cells,
      // form labels, input text and stat-card labels, so that is the tier that
      // gets the bump. The headline tier is deliberately untouched: 18/22/28 is
      // already three clearly separated steps, and lifting the bottom of it
      // would flatten the hierarchy rather than sharpen it.
      //
      // Line heights move with their sizes — a 13px label in the old 16px box
      // clips descenders, and uppercase + letterSpacing needs the extra room.
      fontSize: {
        "body-sm": ["0.875rem", { lineHeight: "1.375rem", fontWeight: "400" }],
        "code-lg": ["1rem", { lineHeight: "1.625rem", fontWeight: "500" }],
        "headline-sm": [
          "1.125rem",
          { lineHeight: "1.75rem", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "headline-lg": [
          "1.75rem",
          { lineHeight: "2.25rem", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        "code-md": ["0.9375rem", { lineHeight: "1.5rem", fontWeight: "400" }],
        "code-sm": ["0.8125rem", { lineHeight: "1.25rem", fontWeight: "400" }],
        "headline-md": [
          "1.375rem",
          { lineHeight: "1.875rem", letterSpacing: "-0.015em", fontWeight: "600" },
        ],
        "label-md": ["0.875rem", { lineHeight: "1.375rem", letterSpacing: "0.03em", fontWeight: "500" }],
        "body-md": ["1rem", { lineHeight: "1.625rem", fontWeight: "400" }],
        "label-sm": ["0.8125rem", { lineHeight: "1.125rem", letterSpacing: "0.04em", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};