# Design System Specification: High-End Editorial Minimalism

## 1. Overview & Creative North Star
### The Creative North Star: "The Ethereal Canvas"
This design system rejects the "boxed-in" nature of traditional SaaS dashboards. Inspired by the quiet sophistication of high-end editorial portfolios, it treats the screen as an expansive, breathing workspace. By utilizing a "Floating UI" architecture, we remove the friction of heavy sidebars and rigid grids, replacing them with independent, intelligent modules that sit over a limitless surface.

The aesthetic is defined by **intentional asymmetry**, **tonal depth**, and **extreme legibility**. We move beyond generic "flat" design through carefully layered surface tones, restrained borders, and static shadows rather than expensive blur or compositing effects.

---

## 2. Colors
The palette is a curated spectrum of Zinc grays and pure neutrals, designed to let content remain the protagonist.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to define sections. Layout boundaries must be achieved exclusively through background tonal shifts. For example, a `surface-container-low` section sitting on a `background` provides all the definition needed. If a section doesn't feel separated enough, increase the whitespace (refer to the Spacing Scale) rather than adding a line.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of semi-translucent materials.
- **Base Layer:** `surface` (#f9f9fa).
- **Secondary Content Areas:** `surface-container-low` (#f2f4f5).
- **Active Floating Cards:** `surface-container-highest` (#dde3e7) with solid or lightly translucent fills, static shadows, and no backdrop blur.
- **Nesting:** To highlight a search bar within a floating sidebar, use `surface-container-lowest` (#ffffff) to make it "pop" from the container.

### The "Tonal & Gradient" Rule
Standard flat fills are for utilities; "The Ethereal Canvas" uses tone for hierarchy.
- **Layered Surfaces:** Use opaque or lightly translucent white/zinc backgrounds for navigation and toolbars. Do not use `backdrop-filter`, `filter: blur()`, masks, or blend modes.
- **Signature Polish:** For primary actions, use a subtle linear gradient from `primary` (#5f5e61) to `primary-dim` (#535252). This adds a microscopic "beveled" feel that feels expensive.

---

## 3. Typography
The system uses a technical-editorial pairing: **Manrope** for structural impact and **Inter** for high-performance reading.

- **Display & Headline (Manrope):** Large, bold, and high-contrast. These are used sparingly to anchor a page. The `display-lg` (3.5rem) should feel like a magazine header.
- **Body & Titles (Inter):** Tight tracking and optimized line height. `body-md` (0.875rem) is our workhorse for long-form content.
- **Technical Accents:** Labels use `label-sm` (Inter, 0.6875rem) with increased letter spacing to provide a technical, "data-rich" feel without the clutter.

---

## 4. Elevation & Depth
Depth is not an effect; it is information.

### The Layering Principle
Achieve hierarchy by "stacking" surface-container tiers. 
*Example:* A navigation card (`surface-container-lowest`) placed atop a workspace (`surface-container-low`) creates a natural lift.

### Ambient Shadows
When an element must "float" (like a primary navigation bar), use a multi-layered shadow:
- **Shadow Token:** `box-shadow: 0 20px 40px -10px rgba(45, 51, 54, 0.05)`. 
- **Rule:** Shadows must be extra-diffused and low-opacity (4%-8%). Use a tinted version of `on-surface` (#2d3336) rather than pure black to mimic natural light.

### The "Ghost Border" Fallback
If a boundary is absolutely required for accessibility, use a **Ghost Border**: `outline-variant` (#adb3b6) at **10% opacity**. This provides a hint of structure without breaking the minimalist "breathability" of the canvas.

---

## 5. Components

### Floating Navigation Cards
Instead of sidebars, use "Islands."
- **Styling:** `rounded-xl` or `rounded-2xl`, `surface-container-lowest` background, subtle static shadow, and no backdrop blur.
- **Layout:** Positioned at the screen edges with a minimum margin of `spacing-4` (1.4rem).

### Buttons
- **Primary:** High-contrast `primary` (#5f5e61) with `on-primary` text. No border. `rounded-full` for a modern, tactile feel.
- **Secondary:** Transparent background with the "Ghost Border" at 20% opacity.
- **Tertiary:** `surface-container-low` background. Use for low-priority actions like "Cancel."

### Input Fields
- **Container:** `surface-container-high` (#e4e9ec).
- **Active State:** Shift to `surface-container-lowest` with a subtle `primary` glow (using the ambient shadow rule). 
- **Labels:** Always use `label-md` floating above the field to maintain whitespace.

### Lists & Cards
- **No Dividers:** Forbid the use of horizontal rules. Separate list items using `spacing-2` (0.7rem) or a subtle change in background hover state (`surface-container-highest`).

### Floating Action Bars
A custom component for tool selections (inspired by creative suites). A vertical or horizontal bar with `rounded-full` corners, using the tonal surface rule to feel light and un-intrusive.

---

## 6. Do's and Don'ts

### Do
- **DO** embrace extreme whitespace. If a layout feels "empty," it is likely correct.
- **DO** use asymmetry. Place a floating navigation bar on the left and a status indicator on the right without connecting them with a header bar.
- **DO** use the `rounded-2xl` (1.5rem) corner radius for all major containers to soften the technical feel of the Zinc palette.

### Don't
- **DON'T** use 1px black or dark gray borders. It destroys the "Ethereal" feeling.
- **DON'T** use high-opacity shadows. If the shadow is clearly visible as a "dark smudge," it is too heavy.
- **DON'T** use heavy sidebars. If content requires organization, use floating nested containers or "drawer" patterns that don't push the main content.
- **DON'T** crowd the edges. Respect the `spacing-8` (2.75rem) "Safe Zone" for page margins.
