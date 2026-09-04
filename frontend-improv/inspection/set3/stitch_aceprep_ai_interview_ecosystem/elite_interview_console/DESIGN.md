---
name: Elite Interview Console
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
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#161c22'
  on-tertiary-container: '#7e848c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#dde3eb'
  tertiary-fixed-dim: '#c1c7cf'
  on-tertiary-fixed: '#161c22'
  on-tertiary-fixed-variant: '#41474e'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max-width: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

This design system embodies a **Premium Professional** aesthetic, specifically tailored for high-stakes enterprise recruitment. The brand personality is authoritative yet approachable, ensuring both the interviewer and the candidate feel they are participating in a high-value experience.

The style is a sophisticated blend of **Minimalism** and **Glassmorphism**. It utilizes heavy whitespace to reduce cognitive load during interviews, paired with subtle frosted glass surfaces for secondary panels to maintain a sense of lightness. The visual language avoids decorative clutter, focusing instead on precision, clarity, and structural elegance.

## Colors

The palette is rooted in a "Slate & Silver" spectrum to project stability and neutrality. 
- **Primary:** A deep Slate Navy (#0F172A) used for high-emphasis typography and primary actions.
- **Secondary:** A muted Steel Blue (#64748B) for icons, labels, and secondary information.
- **Neutral Background:** A crisp, cool-toned Slate White (#F8FAFC) serves as the canvas, providing a professional alternative to pure white.
- **Surface:** Pure white is reserved for high-elevation containers (cards, modals) to create a distinct "layered" feel against the neutral background.
- **Gradients:** Use the light blue-to-silver gradient sparingly, primarily for subtle header backgrounds or active states in specialized data visualizations.

## Typography

The typography system creates a "Literary-Professional" hierarchy. **Playfair Display** provides an editorial, high-end feel for key headlines and section titles, lending an air of established authority. **Inter** handles all functional and body text, ensuring maximum legibility across data-heavy interview scorecards and resumes.

Maintain generous line heights (1.5x+) to ensure the text feels airy and sophisticated. Use the `label-sm` style with increased letter spacing for metadata and non-interactive status indicators.

## Layout & Spacing

This design system utilizes a **Fixed Grid** approach for the main content area (1280px max-width) to maintain a controlled, professional presentation on large monitors. 

- **Desktop (1200px+):** 12-column grid, 40px outer margins, 24px gutters.
- **Tablet (768px - 1199px):** 8-column grid, 32px outer margins, 16px gutters.
- **Mobile (<767px):** 4-column grid, 16px outer margins, 12px gutters.

Spacing follows a strict 8px base unit. Generous internal padding (32px+) within cards and sections is required to maintain the "Spacious" brand attribute. Grouped items should use `stack-sm`, while distinct sections must use `stack-lg`.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** and **Ambient Shadows** rather than stark borders.

1.  **Level 0 (Floor):** Neutral Background (#F8FAFC).
2.  **Level 1 (Surfaces):** Pure White cards with an extremely diffused shadow: `0 4px 20px rgba(15, 23, 42, 0.04)`.
3.  **Level 2 (Active/Floating):** Modals and dropdowns use a "Glass" effect: `backdrop-filter: blur(12px)` with a 1px white border at 20% opacity.
4.  **Outlines:** Use thin 1px borders in `tertiary_color` (#E2E8F0) for input fields and non-elevated containers. Shadows should never be harsh; if a shadow is clearly visible, it is too heavy.

## Shapes

The design system uses a **Soft** shape language. Elements are slightly rounded (0.25rem / 4px) to feel modern and accessible, but not so rounded as to appear "bubbly" or consumer-grade. 

- **Buttons & Inputs:** 4px radius.
- **Cards & Modals:** 8px radius (`rounded-lg`).
- **Profile Avatars:** Circular (pill) to provide a soft counter-balance to the structured grid.

## Components

- **Buttons:** Primary buttons use the `primary_color` with white text. Secondary buttons are "Ghost" style: thin #E2E8F0 border, no fill, Slate Navy text. Hover states should involve a subtle shift to the silver gradient background.
- **Input Fields:** Minimalist style with only a bottom border or a very faint 1px full border (#E2E8F0). Focus states transition the border to `primary_color` with no glow.
- **Chips/Tags:** Used for candidate skills or interview tags. Rectangular with 4px radius, light silver background, and secondary text color. No borders.
- **Cards:** White background, `rounded-lg` corners, and the diffused Level 1 shadow. Headers within cards should use `label-sm` for categorization.
- **Interview Timeline:** A vertical line component using #E2E8F0, with small `primary_color` dots for milestones, maintaining a clean, technical look.
- **Glass Panels:** Used for sidebars in the interview console to allow the background video or document to be partially visible, maintaining context.