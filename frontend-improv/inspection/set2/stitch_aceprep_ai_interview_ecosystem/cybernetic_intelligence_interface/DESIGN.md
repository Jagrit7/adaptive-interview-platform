---
name: Cybernetic Intelligence Interface
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e18'
  surface-container-low: '#171b26'
  surface-container: '#1c1f2a'
  surface-container-high: '#262a35'
  surface-container-highest: '#313540'
  on-surface: '#dfe2f1'
  on-surface-variant: '#bac9cc'
  inverse-surface: '#dfe2f1'
  inverse-on-surface: '#2c303b'
  outline: '#849396'
  outline-variant: '#3b494c'
  surface-tint: '#00daf3'
  primary: '#c3f5ff'
  on-primary: '#00363d'
  primary-container: '#00e5ff'
  on-primary-container: '#00626e'
  inverse-primary: '#006875'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#93fff0'
  on-tertiary: '#003732'
  tertiary-container: '#75e2d4'
  on-tertiary-container: '#00645c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#9cf0ff'
  primary-fixed-dim: '#00daf3'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#004f58'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#89f5e7'
  tertiary-fixed-dim: '#6bd8cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#0f131d'
  on-background: '#dfe2f1'
  surface-variant: '#313540'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin: 40px
  container-max: 1440px
---

## Brand & Style

The design system is engineered to evoke a sense of high-fidelity precision and cinematic intelligence. It targets a professional audience within the AI and high-tech recruitment space, moving away from "gamer" aesthetics toward a sophisticated, "command center" atmosphere. 

The visual style is a hybrid of **Modern-Corporate** and **Glassmorphism**, emphasizing depth through light and transparency rather than physical weight. The emotional response should be one of "calm capability"—where the user feels they are interacting with an advanced, reliable partner. 

**Key Visual Principles:**
- **Cinematic Depth:** Use deep, layered backgrounds to create a sense of infinite workspace.
- **Precision Accents:** Use electric cyan only for critical focus points and active states.
- **Micro-Glows:** Employ soft, localized illumination to guide the eye without overwhelming the content.

## Colors

The palette is rooted in a deep, nocturnal foundation to minimize eye strain and maximize the impact of data visualizations.

- **Primary (#00E5FF):** "Electric Cyan." Reserved for primary actions, progress indicators, and active AI states.
- **Secondary (#6366F1):** "Indigo Glow." Used for gradients, hover states, and to soften the transition between neutral and primary colors.
- **Neutral (#0B0F19):** "Void Navy." The core background color. All surface colors are derived from this base by increasing lightness and adding 5-10% transparency.
- **Surface:** Surfaces use a translucent hex variant `rgba(22, 28, 45, 0.7)` to achieve the glassmorphic effect.

## Typography

This design system utilizes a tiered typographic approach to reinforce the high-tech narrative. 

- **Headlines:** Use **Geist** for its mathematical precision and clean, wide apertures. Headlines should be set with tight letter-spacing to feel "locked in."
- **Body:** **Inter** provides maximum legibility for long-form feedback and interview transcripts.
- **Data/Metadata:** **JetBrains Mono** is used for labels, timestamps, and technical data points to provide a "developer-refined" look that implies accuracy.

Text contrast is maintained by using `Pure White (#FFFFFF)` for headings and `Slate Blue (#94A3B8)` for secondary body text.

## Layout & Spacing

The layout follows a **Fluid Grid** model with high internal breathing room to prevent the "cluttered dashboard" trope. 

- **Grid:** A 12-column system is used for desktop, collapsing to 1 column for mobile. 
- **Rhythm:** Spacing is strictly based on a 4px baseline. Components should use 16px or 24px padding to maintain a spacious, premium feel.
- **Responsive Behavior:** On mobile, margins reduce to 16px, and glassmorphic blurs should be simplified or removed to maintain performance. 
- **Safe Zones:** High-priority AI widgets (like live feedback meters) are placed in "Fixed Floating" slots on the right-hand side of the viewport to remain accessible regardless of scroll position.

## Elevation & Depth

Depth in this design system is achieved through **Tonal Layers** and **Backdrop Blurs** rather than traditional drop shadows.

- **Surface Levels:** 
    - Level 0: Background (#0B0F19).
    - Level 1: Glass container (70% opacity with 20px backdrop blur).
    - Level 2: Interactive elements (solid dark navy with a 1px inner border of #FFFFFF10).
- **The "AI Glow":** Active or "thinking" states use a 0px 0px 15px shadow with the color of the primary cyan to create a soft bloom effect.
- **Borders:** Every container must have a 1px border. Use a linear gradient for the border (Top-Left: #FFFFFF20 to Bottom-Right: #FFFFFF05) to simulate a light source from the top-left.

## Shapes

The shape language is "Geometric-Modern." 

- **Radius:** A consistent **0.5rem (8px)** to **1rem (16px)** radius is used. It is soft enough to feel approachable but sharp enough to appear professional and structured.
- **Icons:** Use thin-stroke (1.5px) icons with square terminals to match the precision of the typography.
- **Interactive Elements:** Buttons utilize a slightly more rounded corner (12px) than standard cards to make them feel more tactile and "clickable."

## Components

- **Primary Buttons:** Solid Electric Cyan background with black text for maximum contrast. No shadows, but a subtle "bloom" glow on hover.
- **AI Feedback Chips:** Semi-transparent cyan fills with monospaced labels. Used for highlighting candidate traits.
- **Status Cards:** Glassmorphic backgrounds with a 2px vertical "intent bar" on the left side to indicate status (e.g., Green for "Ready", Cyan for "Analyzing").
- **Inputs:** Darker than the surface background (inset look) with a 1px border that glows Cyan only when focused.
- **Visualizations:** Line charts should use vibrant gradients (Cyan to Indigo) with "area-under-the-curve" fills at 10% opacity.
- **The "Arena" Grid:** A subtle, animated background grid (50px squares) using #FFFFFF05 stroke, slightly moving or pulsing to indicate the "live" nature of the AI environment.