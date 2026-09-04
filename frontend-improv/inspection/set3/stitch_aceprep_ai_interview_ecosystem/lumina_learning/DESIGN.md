---
name: Lumina Learning
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464554'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
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
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  max-width: 1280px
---

## Brand & Style
The design system is centered on a "Playful Learning Journey" narrative, balancing the energy of gamification with the sophistication required for professional growth. The interface must feel like a supportive companion—encouraging progress without feeling juvenile.

The aesthetic blends **Modern Minimalism** with **Tactile** elements. It utilizes high-quality whitespace to ensure clarity, while using soft depth and vibrant accents to celebrate user milestones. The goal is an emotional response of "confident momentum"—the user should feel both organized and inspired to take the next step in their curriculum.

## Colors
The palette is built on a "Warm Paper" foundation (`#FDFCF9`) to reduce eye strain during long study sessions. 

- **Primary (Indigo):** Used for main actions, active states, and progress-tracking path markers.
- **Secondary (Emerald):** Reserved for "Success" states, completion badges, and positive growth indicators.
- **Tertiary (Amber):** Used for highlights, streak indicators, and "Level Up" moments to provide visual warmth.
- **Neutrals:** A range of slate-inspired grays that maintain legibility while appearing softer than pure black.

## Typography
This design system uses **Plus Jakarta Sans** across all levels to maintain a friendly, contemporary, and geometric feel. 

- **Headlines:** Use tighter letter spacing and heavy weights (Bold/ExtraBold) to create a sense of importance and impact.
- **Body:** Set with generous line heights to ensure long-form educational content is easily digestible.
- **Labels:** Use semi-bold or bold weights even at small sizes to ensure functional elements remain highly legible against vibrant backgrounds.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a soft 8px rhythmic scale. 

- **Desktop:** A 12-column grid with wide 64px margins to create a "contained" and focused learning environment.
- **Mobile:** A 4-column grid with 16px margins. 
- **Rhythm:** Spacing between related cards should be 24px, while sections are separated by 48px or 64px to create a clear visual hierarchy. Use "safe areas" around progress maps to allow the pathing to feel organic rather than cramped.

## Elevation & Depth
The design system avoids harsh, traditional shadows in favor of **Tonal Layers** and **Soft Ambient Occlusion**.

- **Surface Levels:** Use subtle shifts in background color (e.g., a slightly cooler white or very light cream) to distinguish between the background and container layers.
- **Shadows:** When used, shadows should be highly diffused with a slight color tint matching the surface (e.g., a faint Indigo tint for primary cards).
- **Interactive Depth:** On hover, buttons and cards should "lift" using a slightly more pronounced, soft shadow and a subtle scale increase (1.02x) to mimic a tactile, physical response.

## Shapes
The shape language is defined by extreme roundedness to evoke friendliness and safety. 

- **Standard Components:** Buttons, inputs, and small cards use a minimum of 16px (1rem) radius.
- **Large Containers:** Course modules and achievement cards should use 24px or 32px corner radii.
- **Pill Shapes:** Always used for tags, chips, and progress bars to maintain the energetic, aerodynamic feel of the "journey" narrative.

## Components
- **Progress Maps:** Vertical or zig-zagging paths using thick, rounded lines in Primary Indigo. Completed nodes should use Emerald with a checkmark icon.
- **Achievement Cards:** Feature a centered, illustrated icon. The card background should use a very pale tint of the achievement's theme color (e.g., pale Amber for "Streak" achievements).
- **Buttons:** Large, high-contrast, and pill-shaped. The primary button should have a "thick" bottom border (3px) in a darker shade of Indigo to create a pressable, tactile feel.
- **Status Chips:** Bold, solid-color backgrounds with white text. Use high-contrast pairings (e.g., Emerald background for "Mastered").
- **Input Fields:** Thick 2px borders in a soft neutral, turning Primary Indigo on focus. Use inner-padding that mimics the generous roundedness of the outer corners.
- **Micro-interactions:** Subtle "bounce" physics on toggle switches and success animations for a rewarding feel.