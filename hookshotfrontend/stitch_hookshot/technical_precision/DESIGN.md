---
name: Technical Precision
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1b'
  surface-container: '#1f1f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c8c5cc'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#303030'
  outline: '#929096'
  outline-variant: '#47464c'
  surface-tint: '#c7c4d7'
  primary: '#e8e5f9'
  on-primary: '#302f3d'
  primary-container: '#ccc9dc'
  on-primary-container: '#555464'
  inverse-primary: '#5e5d6d'
  secondary: '#b8c7e5'
  on-secondary: '#223148'
  secondary-container: '#394760'
  on-secondary-container: '#a7b6d3'
  tertiary: '#d6eaff'
  on-tertiary: '#1a3347'
  tertiary-container: '#b5cee7'
  on-tertiary-container: '#40586e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e3e0f4'
  primary-fixed-dim: '#c7c4d7'
  on-primary-fixed: '#1b1a28'
  on-primary-fixed-variant: '#464555'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#b8c7e5'
  on-secondary-fixed: '#0c1c32'
  on-secondary-fixed-variant: '#394760'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#b0c9e3'
  on-tertiary-fixed: '#011d31'
  on-tertiary-fixed-variant: '#31495e'
  background: '#131313'
  on-background: '#e2e2e2'
  surface-variant: '#353535'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.375rem
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 1rem
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.03em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  gutter-mobile: 0.75rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered specifically for an infrastructure-grade webhook delivery platform developer console. The personality is utilitarian, austere, predictable, and robust. It addresses software engineers, devops practitioners, and site reliability engineers who require rapid insight into high-throughput payload delivery, retries, HMAC authentication, latency metrics, and failure debugging.

The visual style is strictly functional minimalism paired with low-contrast industrial discipline. It rejects decorative illustrations, fluid organic shapes, drop-shadow elevations, and marketing gradients in favor of information density, high data legibility, 1px structural dividing lines, and consistent keyboard-navigable affordances. Every UI element exists to convey event state, status codes, payload structures, or configuration endpoints.

## Colors

The system uses a strictly disciplined, two-mode palette optimized for developer focus and long terminal sessions. The default state is dark mode.

### Dark Mode (Default)
- **Page Background:** `#000000` (deep canvas base for zero eye-strain terminal integration)
- **Card / Surface Background:** `#0c1821` (elevated panels, log inspectors, payload blocks)
- **Secondary Surface & Structural Borders:** `#1b2a41` (crisp 1px division, container strokes, inactive tabs)
- **Hover / Muted Surface:** `#324a5f` (interactive state feedback, active row selection, table row hover)
- **Accent / Interactive Highlight:** `#ccc9dc` (primary action fills, high-contrast text accents, focused indicators)

### Light Mode
- **Page Background:** `#edede9` (warm parchment base)
- **Card Background:** `#f5ebe0` (high-contrast flat panels)
- **Secondary Surface & Structural Borders:** `#d6ccc2` (grid definitions and dividing strokes)
- **Hover / Muted Surface:** `#e3d5ca` (hover fills and active states)
- **Accent / Interactive Buttons:** `#d5bdaf` (primary actions and focused states)

### Status Tokens (Both Modes)
- **Success (HTTP 2xx):** `#22c55e` (text/indicator only, never background fills)
- **Warning / Retrying (HTTP 4xx / Backoff):** `#f59e0b`
- **Failure / Exhausted (HTTP 5xx / Inactive):** `#ef4444`
- **Muted / Dropped:** Dark: `#64748b` / Light: `#78716c`

## Typography

The typography is bifurcated into two disciplined roles:

1. **System & Structural Sans (`Inter`):** Applied to view titles, structural navigation, input labels, documentation excerpts, and modal copy. It delivers clean, neutral legibility at compact body sizes (12px to 14px).
2. **Terminal Monospace (`JetBrains Mono`):** Non-negotiable for all webhook event IDs (`evt_2k9x...`), cryptographic secrets, HMAC headers, timestamps (`ISO 8601`), HTTP status indicators, JSON request/response payloads, and table column data.

Kerning is tracking-tight for headers to maintain visual density. Numbers use tabular figures (`font-variant-numeric: tabular-nums`) across all data tables and metrics boards to prevent jitter during live event polling.

## Layout & Spacing

The layout is built for high information density and zero visual waste. It utilizes a full-bleed dashboard architecture featuring a fixed utility rail (64px collapsed, 240px expanded) paired with a contextual split-pane or multi-column data grid.

- **Breakpoints:** 
  - `Desktop (>= 1280px)`: Full multi-column view; event list paired side-by-side with payload inspection panels.
  - `Tablet (768px - 1279px)`: Inspection pane moves to an overlaid drawer or stacked tab container.
  - `Mobile (< 768px)`: Single column view; table switches to high-density key-value list cards; sub-navigation switches to horizontal scrolling tabs.
- **Rhythm:** Spacing follows a compact 4px baseline (`0.25rem`), deliberately compressing vertical table rows to 36px–40px heights to maximize the number of visible events on screen without pagination scrolling.

## Elevation & Depth

This design system avoids drop shadows, blur radiuses, and pseudo-skeuomorphic depth. Visual hierarchy is established strictly via **flat architectural surfaces and 1px structural outlines**.

- **Level 0 (Canvas):** The base window frame (`#000000` dark / `#edede9` light).
- **Level 1 (Panels & Card Containers):** Defined by 1px solid borders (`#1b2a41` dark / `#d6ccc2` light) enclosing card backgrounds (`#0c1821` dark / `#f5ebe0` light).
- **Level 2 (Inspectors & Flyouts):** Overlays, dropdown menus, and modal dialogs share the Level 1 background but gain a crisp 1px perimeter border and an optional 1px offset accent outline on focus. No ambient or blur shadows are permitted.
- **Interactive State Elevation:** Hovering interactive nodes (table rows, buttons, tabs) triggers instant or low-latency (100ms) background fills using the muted token (`#324a5f` dark / `#e3d5ca` light) rather than physical lifts or drops.

## Shapes

The design uses a restrained `Soft` corner model (`0.25rem` / `4px`). This slight radius prevents harsh terminal corners while maintaining the severe, block-level discipline of developer-oriented tools.

- Standard buttons, text inputs, badges, select menus, and inner card boundaries use `4px` (`rounded`).
- Outer dashboard container panels, full-page card wrappers, and inspector shells maintain `8px` (`rounded-lg`) max.
- Status indicator pips (live delivery indicators) are purely circular (`rounded-full`).

## Components

### Buttons
- **Primary Button:** High-contrast solid accent background (`#ccc9dc` dark with `#000000` text; `#d5bdaf` light with `#000000` text). 4px border radius. Padding: `6px 12px`. Font: `Inter`, 600 weight, 13px. Hover: 90% opacity.
- **Secondary Button:** Surface-transparent with a 1px border (`#1b2a41` dark / `#d6ccc2` light). Text matches foreground body. Hover state fills background with muted surface (`#324a5f` dark / `#e3d5ca` light).
- **Destructive Button:** Transparent background, 1px `#ef4444` border, `#ef4444` text. Hover fills `#ef4444` with white text.

### Inputs & Selectors
- Background matches card level (`#0c1821` dark / `#f5ebe0` light).
- 1px border (`#1b2a41` dark / `#d6ccc2` light).
- Focus state: Border color switches directly to primary accent (`#ccc9dc` dark / `#d5bdaf` light) with zero box-shadow ring.
- Fixed 32px height for ultra-compact form layouts. Monospace font for endpoint URLs, headers, and secret inputs.

### Event Delivery Tables
- Strict 1px bottom border on every row. Header row uses `label-sm` monospace typography in all-caps.
- Alternate rows remain flat; row hover triggers `#324a5f` (dark) or `#e3d5ca` (light) across all cells.
- HTTP status codes are pinned to a standard 3-digit pill (`JetBrains Mono`, 11px) with colored status text and matching 1px border.

### Status Chips & Badges
- Non-pill, 2px or 4px radius boxes.
- Compact padding: `2px 6px`. Text rendered in `label-sm`.
- Structure: 1px border utilizing the status color (e.g., `#22c55e`), tinted transparent background (10% opacity), and solid status text.

### JSON Payload Viewer
- Embedded panel inside `#0c1821` (dark) or `#f5ebe0` (light).
- Raw syntax highlighting restricted to 4 functional shades: strings, integers/booleans, keys, and operators.
- Integral "Copy CLI Curl" and "Replay Payload" secondary mini-buttons anchored top-right in the panel header.

### Checkboxes & Radios
- Square 14px boxes with 2px radius. 1px border (`#1b2a41` dark / `#d6ccc2` light).
- Selected state fills with accent color and uses neutral background for check mark/indicator.