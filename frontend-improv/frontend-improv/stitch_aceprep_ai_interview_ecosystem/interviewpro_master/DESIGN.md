---
name: InterviewPro Master
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#464555'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#005338'
  on-tertiary: '#ffffff'
  tertiary-container: '#006e4b'
  on-tertiary-container: '#67f4b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  individual-accent: '#7C3AED'
  enterprise-muted: '#64748B'
  surface-white: '#FFFFFF'
  border-subtle: '#E2E8F0'
  warm-highlight: '#F59E0B'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  container-max: 1280px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-gap: 64px
---

## Brand & Style

The design system establishes a **Corporate Modern** aesthetic that bridges the gap between high-energy personal growth and high-stakes enterprise recruitment. It projects a personality of "Empowered Professionalism"—an environment where the user feels both capable and sophisticated. 

The style utilizes a **Minimalist** foundation with **Tactile** accents. By leveraging expansive whitespace and a refined color palette, the system maintains a premium shell. Distinctive sub-themes are integrated through tonal shifts: the "Individual" experience leans into soft depth and rhythmic energy, while the "Enterprise" experience emphasizes structural clarity and glass-like precision. The overarching goal is to evoke a sense of trust, momentum, and elite performance.

## Colors

The palette is anchored by **Deep Indigo (#4F46E5)**, a bridge color that provides professional authority without losing modern vibrancy.

- **Primary (Deep Indigo):** The core brand anchor, used for key actions and navigational signposts across all platforms.
- **Secondary (Slate Navy):** Used primarily in Enterprise contexts for high-emphasis typography and grounding structural elements.
- **Tertiary (Emerald):** Reserved for success states, progress completion, and "Mastery" indicators.
- **Neutral (Slate White):** The "shell" background color, providing a crisp, professional alternative to pure white.

**Sub-Theme Logic:**
- **Individual:** Introduces `individual-accent` (Purple) and `warm-highlight` (Amber) for gamified elements and streaks.
- **Enterprise:** Heavily utilizes `enterprise-muted` (Steel Blue) and `surface-white` to create a tiered, console-like feel.

## Typography

This design system uses **Plus Jakarta Sans** exclusively to ensure a unified brand voice that feels contemporary and accessible.

- **Hierarchy:** Dramatic weight contrasts (ExtraBold for displays vs. Regular for body) are used to guide the eye through complex interview data or learning modules.
- **Scaling:** On mobile, display sizes aggregate to smaller scales while maintaining their heavy weights to ensure the "bold" brand character persists.
- **Utility:** Labels use a slightly increased letter-spacing and heavier weights to ensure functional UI elements remain distinct from content.
- **Line Height:** Body text maintains a generous 1.5x-1.6x ratio to preserve an "airy," premium editorial feel, preventing information density from becoming overwhelming.

## Layout & Spacing

The layout follows a **Fixed Grid** model for desktop to ensure a controlled, premium presentation, transitioning to a **Fluid Grid** for mobile devices.

- **Grid Structure:** A 12-column grid is standard for desktop (1280px max-width), moving to an 8-column grid for tablets and a 4-column grid for mobile.
- **Spacing Rhythm:** All measurements are multiples of an 8px base unit. 
- **Sub-Theme Adaptation:**
    - **Individual Sections:** Use more generous `section-gap` and "Safe Areas" around interactive maps to allow for an organic, less rigid flow.
    - **Enterprise Sections:** Utilize `stack-sm` and `stack-md` for tighter data-density in interview consoles, emphasizing efficiency and professional structure.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Ambient Shadows** to maintain a clean, high-end aesthetic.

- **Surface Tiers:** The Neutral background (`#F8FAFC`) acts as Level 0. Surfaces (cards/containers) use Pure White to "lift" from the page.
- **Shadow Profile:** Shadows are extremely diffused and low-opacity: `0 4px 20px rgba(15, 23, 42, 0.05)`. For the "Individual" theme, shadows may take a subtle Indigo tint to add warmth.
- **Glassmorphism:** Enterprise side-panels and modal overlays utilize a backdrop-blur (12px) with a faint 1px white border (20% opacity) to maintain context and visual lightness.
- **Transitions:** Hover states utilize a subtle 1.02x scale and a slightly deeper shadow to provide tactile feedback without cluttering the UI with heavy borders.

## Shapes

The shape language uses **Rounded (12px / 0.75rem)** as the standard to balance friendly curves with professional structure.

- **Standard Elements:** Buttons, inputs, and small cards use the `rounded` (12px) token.
- **Large Containers:** Section modules and landing page cards use `rounded-lg` (16px) or `rounded-xl` (24px) for a softer, more inviting appearance.
- **Pill Shapes:** Exclusively reserved for status chips, tags, and progress bars to provide a dynamic, modern counter-balance to the rectilinear grid.

## Components

- **Buttons:** 
    - **Primary:** Solid Deep Indigo with white text. Features a 2px "tactile" bottom border in a darker indigo for the Individual theme, and a flat, minimal style for Enterprise.
    - **Secondary:** Ghost style with a `border-subtle` (#E2E8F0) outline and Slate Navy text.
- **Input Fields:** Generous internal padding matching the 12px corner radius. Borders are 1px `border-subtle`, turning Primary Indigo on focus with no outer glow.
- **Cards:** White background with Level 1 Ambient Shadows. Enterprise cards use tighter internal padding (24px), while Individual cards use 32px to feel more spacious.
- **Chips & Tags:** Pill-shaped with light tinted backgrounds (e.g., 10% Indigo for Primary tags) and bolded `label-sm` text.
- **Enterprise Console Panels:** Semi-transparent glass panels with backdrop blurs used for sidebars to allow interview video context to remain visible.
- **Progress Markers:** Bold, Indigo rounded lines. Completed milestones use Tertiary Emerald with a checkmark, while active milestones feature a subtle "pulse" animation.