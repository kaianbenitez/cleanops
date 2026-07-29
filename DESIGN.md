---
name: ServiceSpark
colors:
  surface: '#f4fbf4'
  surface-dim: '#d4dcd5'
  surface-bright: '#f4fbf4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef6ee'
  surface-container: '#e8f0e9'
  surface-container-high: '#e3eae3'
  surface-container-highest: '#dde4dd'
  on-surface: '#161d19'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#2b322d'
  inverse-on-surface: '#ebf3eb'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#2457ff'
  on-primary: '#ffffff'
  primary-container: '#cdd8ff'
  on-primary-container: '#10266f'
  inverse-primary: '#4edea3'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#d94a38'
  on-tertiary: '#ffffff'
  tertiary-container: '#fc7c78'
  on-tertiary-container: '#711419'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3af'
  on-tertiary-fixed: '#410005'
  on-tertiary-fixed-variant: '#842225'
  background: '#f4fbf4'
  on-background: '#161d19'
  surface-variant: '#dde4dd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 260px
  container-padding: 2rem
  gutter: 1.5rem
  stack-gap: 1rem
  component-padding-x: 1rem
  component-padding-y: 0.5rem
---

## Brand & Style
The design system is engineered for high-efficiency residential cleaning operations, where clarity and trust are paramount. The brand personality is professional, surgical in its precision, and calming for dispatchers managing complex schedules. 

The aesthetic is a **Corporate Modern** hybrid: it borrows the high-density utility and "command-center" feel of developer tools, the spaciousness of modern documentation platforms, and the refined finish of premium fintech dashboards. The UI prioritizes "information scent" through purposeful whitespace and a meticulous hierarchy, ensuring that critical data like cleaner status or client issues are immediately scannable.

## Colors
The palette is rooted in a bright, practical ServiceSpark aesthetic.
- **Primary:** Electric cobalt is the signature color for navigation and primary actions. Completion remains green; cobalt is never used to imply a job status.
- **Neutral/Text:** A Deep Slate Navy provides high-contrast legibility and an authoritative tone for headers and body text.
- **Surface & Background:** A subtle distinction between the Soft Slate background and pure White surfaces creates a layered, "dashboard" depth that helps separate the navigation and utility areas from the active workspace.
- **Semantic Accents:** Lime marks completed/positive states, coral marks exceptions, and amber marks attention. Calendar job types may use distinct high-contrast accents, always paired with a text label.

## Typography
This design system utilizes **Inter** for its neutral, highly legible character, perfect for data-heavy SaaS interfaces. 
- **Hierarchy:** Use bold weights for headers to anchor sections. 
- **Data Display:** **JetBrains Mono** is introduced for labels and metadata (like timestamps or IDs) to provide a technical, precise feel.
- **Whitespace:** Always favor increased line-height over larger font sizes to maintain a sophisticated, airy feel.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model:
- **Left Sidebar:** A persistent 260px sidebar houses navigation. It uses a slightly darker tint of the background or white with a subtle right-border.
- **Main Canvas:** A fluid area that grows with the viewport, but content should be constrained to a max-width of 1440px to prevent excessive line lengths.
- **Grid:** Use a 12-column grid for dashboard widgets.
- **Mobile:** The sidebar collapses into a bottom navigation bar or a hamburger menu, and container padding reduces from 2rem to 1rem.

## Elevation & Depth
The system uses **Tonal Layering** combined with **Ambient Shadows** to create a structured hierarchy:
- **Level 0 (Background):** #F8FAFC. The lowest plane.
- **Level 1 (Cards/Surface):** White (#FFFFFF). These use a soft, diffused shadow: `0px 4px 12px rgba(15, 23, 42, 0.05)`.
- **Level 2 (Popovers/Modals):** Pure White. These use a more pronounced shadow: `0px 10px 32px rgba(15, 23, 42, 0.12)`.
- **Outlines:** Use a 1px border (#E2E8F0) for all Level 1 surfaces to maintain crispness even when shadows are subtle.

## Shapes
A consistent 12px (`0.75rem`) corner radius is applied to all primary containers (Cards, Modals) to soften the professional tone. 
- **Small Elements:** Buttons and Input fields use a 8px (`0.5rem`) radius.
- **Tags/Chips:** Use a fully rounded pill shape (9999px) for status indicators to distinguish them from interactive buttons.

## Components
- **Buttons:** 
  - *Primary:* Emerald background, white text. Bold weight.
  - *Secondary:* White background, Slate Navy border, Slate Navy text.
- **Input Fields:** Soft Slate background (#F1F5F9) with no border in resting state; transitions to White with a Primary Emerald border on focus.
- **Chips (Status Indicators):** Use low-opacity background tints of the status color with high-contrast text (e.g., Emerald at 10% opacity for "Completed").
- **Cards:** The workhorse of the dashboard. Always include a 1px border and the 12px rounded corners.
- **Navigation Items:** Use active states with a small vertical indicator on the left in Emerald, and a subtle light-emerald background tint for the entire row.
- **Iconography:** Use 20px sized minimalist line icons (Lucide) with a stroke weight of 2px for clarity.
