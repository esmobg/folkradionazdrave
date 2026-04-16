# Folk Radio Nazdrave — Figma Handoff Spec

Design tokens, component specs, and layout rules extracted from the live codebase.
Use this as a 1:1 reference when building or updating the Figma file.

---

## 1. Typography

| Role | Family | Weight | Size | Line-height |
|------|--------|--------|------|-------------|
| Display / H1 | Literata (serif) | 800 | clamp(2.8rem, 5.8vw, 5.5rem) | 0.96 |
| H2 (player, features, social) | Literata | 700 | clamp(1.8rem, 3vw, 2.8rem) | 1.2 |
| H3 (feature item, icon card) | Literata | 700 | 1.06rem | 1.5 |
| Brand name | Literata | 700 | 1.15rem | 1.5 |
| Body / UI | Manrope (sans) | 400 | 1rem (16px base) | 1.5 |
| Hero body | Manrope | 400 | 1.06rem | 1.5 |
| Lead copy | Manrope | 400 | 1.05rem | 1.5 |
| Eyebrow / Pill / Label | Manrope | 800 | 0.76rem | — |
| Small / Muted | Manrope | 400 | 0.84–0.95rem | 1.5 |

**Letter-spacing:** Eyebrow/pill/label elements use `0.14em`, all-caps.

**Google Fonts URL:**
```
https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,600;7..72,700;7..72,800&family=Manrope:wght@400;500;600;700;800&display=swap&subset=cyrillic
```

---

## 2. Color Palettes

### 2a. Dark Theme (default)

| Token | Heritage | Gold | Olive |
|-------|----------|------|-------|
| --accent | #cf5429 | #d79a18 | #758129 |
| --accent-bright | #e0a61f | #f3ca63 | #d68e31 |
| --accent-muted | #7b7a1d | #9f4c24 | #c5542b |
| --page-top | #120d0a | #120d0a | #120d0a |
| --page-mid | #1b1411 | #1b1411 | #1b1411 |
| --page-bottom | #241b16 | #241b16 | #241b16 |
| --text-primary | #fff1e2 | #fff1e2 | #fff1e2 |
| --text-secondary | rgba(255,241,226,0.8) | same | same |
| --text-muted | rgba(255,241,226,0.62) | same | same |
| --surface | rgba(41,31,26,0.84) | same | same |
| --surface-strong | rgba(53,41,35,0.92) | same | same |
| --border | rgba(255,255,255,0.12) | same | same |
| --border-strong | rgba(255,255,255,0.2) | same | same |

### 2b. Light Theme

| Token | Value |
|-------|-------|
| --page-top | #f4ede2 |
| --page-mid | #ece4d7 |
| --page-bottom | #e4dbcd |
| --text-primary | #4c2409 |
| --text-secondary | rgba(76,36,9,0.8) |
| --text-muted | rgba(76,36,9,0.62) |
| --surface | rgba(247,241,230,0.88) |
| --surface-strong | rgba(250,246,239,0.96) |
| --border | rgba(76,36,9,0.12) |
| --border-strong | rgba(76,36,9,0.22) |

Accent colors stay the same per palette in both themes.

---

## 3. Layout Grid

| Breakpoint | Max-width | Columns | Behavior |
|------------|-----------|---------|----------|
| > 1080px | 1180px | 2-col hero, 2-col content, 4-col features, 3-col testimonials | Desktop |
| 1040–1080px | 1180px | Header stacks vertically | Tablet landscape |
| < 1040px | 100% | All grids collapse to 1-col | Tablet portrait |
| < 760px | 100% | Nav wraps 2-per-row, controls stack | Mobile landscape |
| < 560px | 100% | Reduced padding (1rem), smaller h1, 1-col metrics | Mobile |

**Page padding:** 1.5rem (desktop), 1rem (< 560px)

### Hero Grid
- Left: `minmax(0, 1.15fr)` — hero copy + brand showcase + metrics
- Right: `minmax(360px, 0.85fr)` — player card
- Gap: 1.4rem

### Content Grid
- Left: `1.2fr` (About us card)
- Right: `0.8fr` (History card)
- Gap: 1.4rem, margin-top: 2.2rem

### Feature List
- 4 equal columns, gap: 1rem

### Testimonials Grid
- 3 equal columns, gap: 1rem

### Bottom Grid
- Left: `0.8fr` (shortcuts)
- Right: `1.2fr` (social)
- Gap: 1.4rem, margin-top: 2.2rem

---

## 4. Component Specs

### 4a. Glass Card
- Border-radius: 2rem (1.5rem on mobile)
- Border: 1px solid var(--border)
- Background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), var(--surface)
- Shadow: 0 28px 68px rgba(0,0,0,0.36)
- Inner padding: 2rem (1.25rem on mobile)
- Pseudo ::before — top-left highlight gradient

### 4b. Section Pill
- Border-radius: 999px
- Padding: 0.48rem 0.82rem
- Border: 1px solid var(--border)
- Background: var(--accent-soft)
- Text: uppercase, 0.76rem, weight 800, tracking 0.14em
- Color: var(--accent-muted)

### 4c. Button (Primary)
- Border-radius: 999px
- Min-height: 3.2rem
- Padding: 0.92rem 1.3rem
- Background: linear-gradient(135deg, var(--accent-bright), var(--accent))
- Color: #fff7ef
- Font-weight: 800
- Hover: translateY(-1px), shadow 0 14px 24px rgba(0,0,0,0.12)

### 4d. Button (Secondary)
- Same shape as primary
- Background: var(--button-surface)
- Border: 1px solid var(--border)

### 4e. Segmented Control
- Inline-flex, gap: 0.45rem
- Each button: min-height 2.75rem, padding 0.72rem 1rem, border-radius 999px
- Active state: border-color var(--accent), gradient background

### 4f. Station Button
- Border-radius: 1rem
- Padding: 0.95rem 1rem
- Name in Literata 700, subtitle in 0.84rem muted

### 4g. Metric Card
- Border-radius: 1.35rem
- Padding: 1rem
- Alternating gradient backgrounds (accent-soft / accent-soft-strong)
- Value: Literata, 1.25rem
- Label: 0.95rem, text-secondary

### 4h. Visualizer Bars
- 5 bars, flex: 1, min-width: 1rem
- Border-radius: 999px 999px 0.45rem 0.45rem
- Gradient: player-accent-alt to player-accent (top to bottom)
- Animation: pulse between 1rem and 4.4rem height, 900ms ease-in-out, staggered 80ms

### 4i. Kbd (Keyboard Shortcut Key)
- Min-width: 2.2rem
- Padding: 0.35rem 0.65rem
- Border-radius: 0.55rem
- Border: 1px solid var(--border-strong)
- Background: var(--surface-soft)
- Font-weight: 700, 0.84rem
- Box-shadow: 0 2px 0 var(--border)

### 4j. Testimonial Card
- Uses `<blockquote>` semantics
- Quote text: 1.02rem, line-height 1.7
- Name: Literata 700, accent-muted color
- Role: text-secondary

### 4k. Brand Chip (Header)
- Inline-flex, gap: 1rem
- Padding: 0.7rem 1rem 0.7rem 0.7rem
- Border-radius: 1.75rem
- Logo: 4.2rem, border-radius 1.2rem, inset border

### 4l. Footer
- Center-aligned, border-top 1px solid var(--border)
- Logo: 2.2rem, 0.7 opacity
- Station name: Literata 1.05rem
- Copy: 0.92rem, max-width 48ch
- Padding: 2.5rem top, 1.25rem bottom

---

## 5. Decorative Layers

### Noise Grid
- 30px x 30px grid of 1px lines
- Color: rgba(255,255,255,0.03) dark / rgba(123,122,29,0.04) light
- Masked: fades to transparent at 90% height

### Glow Orbs
- Top-left: 20rem circle, blur 48px, accent-bright color at 18% opacity
- Bottom-right: 24rem circle, blur 48px, accent color at 14% opacity

### Player Card Glow
- Bottom-right: 10rem radial gradient, accent-soft-strong

---

## 6. Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| Section gap | 2.2rem | Between major content sections |
| Card gap | 1.4rem | Between cards in a grid |
| Inner gap | 1rem | Feature list, testimonials grid |
| Compact gap | 0.45–0.55rem | Control buttons, segmented controls |
| Card padding | 2rem | Desktop card inner padding |
| Card padding mobile | 1.25rem | Mobile card inner padding |

---

## 7. Accessibility Notes for Design

- **Focus rings:** 3px solid var(--accent), 3px offset on all interactive elements (4px in high-contrast mode)
- **Skip link:** Hidden off-screen, visible on focus with pill styling
- **Reduced motion:** All animations and transitions disabled when prefers-reduced-motion is set
- **High contrast:** Border and text opacity increase significantly (borders to 0.4/0.6, muted text to 0.82)
- **External links:** Social links include "(opens in new window)" for screen readers via .sr-only text
- **Keyboard shortcuts:** Rendered with semantic `<kbd>` + `<dl>` for proper assistive tech reading
- **Testimonials:** Use `<blockquote>` + `<cite>` for proper semantic quoting
- **Live region:** Player status uses `role="status"` + `aria-live="polite"`
- **Color not sole indicator:** Active states use border + background shift, not color alone

---

## 8. Palette Swatches (for Figma color styles)

**Heritage:**
- Primary: #cf5429 (terracotta)
- Secondary: #e0a61f (amber gold)
- Tertiary: #7b7a1d (olive moss)

**Gold:**
- Primary: #d79a18 (gold)
- Secondary: #f3ca63 (light gold)
- Tertiary: #9f4c24 (burnt sienna)

**Olive:**
- Primary: #758129 (olive green)
- Secondary: #d68e31 (warm orange)
- Tertiary: #c5542b (burnt orange)

---

## 9. Assets Required

| Asset | Path | Format | Notes |
|-------|------|--------|-------|
| Station logo | /logo-client.svg | SVG | Used in header, hero, footer |
| Icon | /icon.svg | SVG | Used in history card |
| Favicon | /icon.svg | SVG | Browser tab icon |

---

## 10. Bilingual Content

The app is fully bilingual (Bulgarian / English). All text strings are in `src/content.js`.
Figma should include frames for both language states to verify text overflow and layout stability, particularly for:
- Hero title (Bulgarian is ~25% longer)
- Navigation labels
- Button text
- Testimonial quotes
