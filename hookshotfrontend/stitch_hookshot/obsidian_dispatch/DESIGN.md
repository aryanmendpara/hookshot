---
name: Obsidian Dispatch
colors:
  surface: '#08151d'
  surface-dim: '#08151d'
  surface-bright: '#2f3b44'
  surface-container-lowest: '#040f18'
  surface-container-low: '#111d26'
  surface-container: '#15212a'
  surface-container-high: '#202b35'
  surface-container-highest: '#2a3640'
  on-surface: '#d8e4f1'
  on-surface-variant: '#c8c5cc'
  inverse-surface: '#d8e4f1'
  inverse-on-surface: '#26323b'
  outline: '#929096'
  outline-variant: '#47464c'
  surface-tint: '#c7c4d7'
  primary: '#e8e5f9'
  on-primary: '#302f3d'
  primary-container: '#ccc9dc'
  on-primary-container: '#555464'
  inverse-primary: '#5e5d6d'
  secondary: '#b0c9e3'
  on-secondary: '#1a3347'
  secondary-container: '#31495e'
  on-secondary-container: '#9fb8d1'
  tertiary: '#dde8ff'
  on-tertiary: '#223148'
  tertiary-container: '#bdccea'
  on-tertiary-container: '#48566f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e3e0f4'
  primary-fixed-dim: '#c7c4d7'
  on-primary-fixed: '#1b1a28'
  on-primary-fixed-variant: '#464555'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#b0c9e3'
  on-secondary-fixed: '#011d31'
  on-secondary-fixed-variant: '#31495e'
  tertiary-fixed: '#d5e3ff'
  tertiary-fixed-dim: '#b8c7e5'
  on-tertiary-fixed: '#0c1c32'
  on-tertiary-fixed-variant: '#394760'
  background: '#08151d'
  on-background: '#d8e4f1'
  surface-variant: '#2a3640'
  canvas-black: '#000000'
  surface-deep: '#0a0f18'
  surface-slate: '#142131'
  text-silver: '#e2e1ec'
  text-muted: '#8d9ba8'
  text-subtle: '#94a3b8'
  status-success: '#22c55e'
  status-warning: '#f59e0b'
  status-failure: '#ef4444'
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
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system defines a high-density, mission-critical developer console engineered for high-throughput webhook delivery, endpoint observability, and distributed event debugging. The design personality is utilitarian, austere, vigilant, and mathematically precise, crafted specifically for backend architects, devops leads, and site reliability engineers operating under incident response constraints.

The aesthetic philosophy draws on functional minimalism and low-contrast terminal discipline. It rejects decorative skeuomorphism, volumetric shadows, rounded bubbly radiuses, and ambient marketing gradients. Instead, the interface relies on calibrated midnight hues, crisp 1-pixel structural dividing strokes, high-contrast monospace tokens, and uncompromising information density. Every pixel and interaction affordance serves to render event lifecycles, HTTP response signatures, latency metrics, and retry backoff states transparent and navigable.

## Colors

The color palette establishes an uncompromising dark-mode console grounded in deep midnight and obsidian surfaces, paired with structural slate blue tones and crisp silver lilac accents. 

### Palette Application
- **Canvas Base (`#000000` / `#0a0f18`):** The outermost application shell and page backdrop, engineered to eliminate eye fatigue during extended terminal and console debugging sessions.
- **Structural Containers (`#0c1821` / `#142131`):** Applied to data tables, log stream drawers, payload inspection modules, and metric cards.
- **Dividers & Inactive Elements (`#1b2a41`):** Structural 1px outlines separating panes, table rows, and secondary navigation boundaries.
- **Interactive Slate Blue (`#324a5f`):** Used for hover feedback, row selection highlights, inactive tab boundaries, and secondary badge frames.
- **Primary Action Accent (`#ccc9dc`):** High-contrast silver lilac reserved for primary button fills, focus boundaries, and critical interactive calls to action.
- **Content Hierarchy:** Primary technical strings and critical headings use `#ffffff` and `#e2e1ec`. Secondary labels, metadata keys, and table column titles rely on `#8d9ba8` and `#94a3b8`.
- **Status Telemetry:** Event delivery statuses use functional accents (`#22c55e` for HTTP 2xx, `#f59e0b` for 4xx retries/backoff, `#ef4444` for 5xx dropouts). These colors appear strictly on typography, indicator pips, and borders—never as high-saturation background fills.

## Typography

The typographic hierarchy separates structural application framing from runtime event telemetry:

- **Proportional UI Typeface (`Inter`):** Handles workspace navigation, page headers, documentation summaries, operational alerts, and contextual forms. Kerning is set tight to maintain high information density across multi-column data views.
- **Monospaced Engine Typeface (`JetBrains Mono`):** Applied to webhook delivery identifiers (`evt_01H7...`), cryptographic signatures, endpoint target URLs, HTTP status codes, latency timestamps, and raw JSON request/response bodies.

Tabular figures (`font-variant-numeric: tabular-nums`) must be enforced on all monospaced numerical outputs and metrics tables to eliminate character jitter during live polling and streaming updates.

## Layout & Spacing

The layout philosophy follows a full-bleed, high-density split-pane grid engineered for multi-monitor developer environments:

- **Global Structure:** A fixed utility rail (64px collapsed, 240px expanded) flanks a fluid content region. In data-heavy views, content is segmented into an event stream table paired with an inline or side-by-side payload inspector panel.
- **Breakpoints:**
  - **Desktop (`>= 1280px`):** Dual-pane split view with sticky headers, multi-column event inspection tables, and synchronized log playback.
  - **Tablet (`768px - 1279px`):** Inspector transitions into an off-canvas drawer sliding from the right edge or a stacked tab panel.
  - **Mobile (`< 768px`):** Single-column layout. Tabular rows condense into vertically stacked key-value cards, and payload blocks collapse under accordion toggles.
- **Rhythm:** Spacing strictly adheres to a 4px baseline (`0.25rem`). Table row heights are compressed to 36px–40px, maximizing visible telemetry without requiring pagination scroll.

## Elevation & Depth

Visual hierarchy is maintained via flat structural layering and low-contrast borders rather than drop shadows or atmospheric blurs:

- **Base Layer (Canvas):** Pure `#000000` canvas backdrop.
- **Surface Layer (Panels, Cards, Split Panes):** `#0c1821` or `#142131` surfaces, bounded by a 1px solid border in `#1b2a41`.
- **Overlay Layer (Drawers, Dropdowns, Tooltips):** Background elevated to `#142131`, encased in a 1px solid outline of `#324a5f`. Drop shadows are suppressed entirely or restricted to an ultra-tight, non-diffused 2px keyline outline.
- **Interactive Focus & Hover:** Surfaces do not elevate along a Z-axis. State changes are communicated strictly through 1-pixel border color transitions (from `#1b2a41` to `#324a5f` or `#ccc9dc`) and low-opacity surface fills.

## Shapes

The geometric architecture utilizes a disciplined soft corner profile (`roundedness: 1` / `4px` baseline) to maintain an authoritative, technical atmosphere:

- **Containers, Cards, and Inputs:** Bounded with a `4px` (`0.25rem`) radius.
- **Larger Modular Enclosures (Split Panes, Inspector Drawers):** Scaled to `8px` (`rounded-lg` / `0.5rem`) to frame sub-grids neatly.
- **Data Badges and Status Markers:** 2px to 4px soft corners; pill shapes are strictly reserved for telemetry status indicator pips.

## Components

### Buttons
- **Primary Action:** Solid background in silver lilac `#ccc9dc`, text in `#000000` (`font-weight: 600`), 4px border radius. Padding: `6px 12px`. Hover state: 90% opacity with zero elevation lift.
- **Secondary Action:** Transparent background with 1px border in `#1b2a41`, text in `#e2e1ec`. On hover, background fills with `#324a5f` and border shifts to `#324a5f`.
- **Destructive Action:** Transparent background, 1px `#ef4444` border, `#ef4444` text. Hover fills background with `#ef4444` at 15% opacity with text maintained in `#ef4444`.

### Input Fields & Select Controls
- Background: `#0c1821`.
- Perimeter: 1px solid border in `#1b2a41`.
- Typography: `code-md` (`JetBrains Mono`) for webhook targets, signing keys, and regex filters; `body-md` (`Inter`) for descriptive labels.
- Focus: Border transitions instantly to `#ccc9dc` with zero outer ring or blur glow.
- Height: Compact 32px fixed height for high-density forms.

### Event Delivery Tables
- Perimeter and internal dividers: 1px border in `#1b2a41`.
- Table Header: Text rendered in `label-sm` uppercase with `#8d9ba8` fill, background in `#0a0f18`.
- Table Rows: Alternating rows maintain flat `#0c1821`. Hover state transitions the entire row background to `#324a5f` with 100ms ease.
- Numeric columns (Latency, Response Time, Retries) use `JetBrains Mono` tabular figures.

### Status Chips & Badges
- Structural geometry: 2px or 4px radius box, padding `2px 6px`. Font: `label-sm`.
- HTTP 2xx: 1px border in `#22c55e`, background in `#22c55e` (10% opacity), text in `#22c55e`.
- HTTP 4xx: 1px border in `#f59e0b`, background in `#f59e0b` (10% opacity), text in `#f59e0b`.
- HTTP 5xx: 1px border in `#ef4444`, background in `#ef4444` (10% opacity), text in `#ef4444`.

### Checkboxes & Radio Controls
- Square 14px dimension with 2px border radius.
- Inactive state: Background in `#0c1821`, 1px border in `#1b2a41`.
- Checked state: Solid `#ccc9dc` fill with a `#000000` check glyph.

### Cards & Payload Inspector Panels
- Cards use `#0c1821` or `#142131` backgrounds with 1px `#1b2a41` borders.
- Header bars feature utility buttons (such as "Replay Payload" or "Copy cURL") anchored top-right in `code-sm` styling.
- JSON Syntax Highlighting: Controlled under a 4-color palette matching the midnight theme (keys in `#8d9ba8`, strings in `#ccc9dc`, numbers/booleans in `#e2e1ec`, status tokens in their respective status hues).