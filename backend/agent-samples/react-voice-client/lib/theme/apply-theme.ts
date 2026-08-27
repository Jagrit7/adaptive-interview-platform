/**
 * Theme Configuration Type
 * Maps to API config fields that can be customized by users
 * Only includes fields that the API returns - other design tokens use defaults
 */
export type RemoteThemeConfig = {
  // Brand colors
  PRIMARY_COLOR?: string // e.g. "#00AEFC"
  PRIMARY_ACTION_BRAND_COLOR?: string // e.g. "#E62079"

  // Typography
  FONT_COLOR?: string // e.g. "#FFFFFF"
  PRIMARY_FONT_COLOR?: string // e.g. "#363636"
  SECONDARY_FONT_COLOR?: string // e.g. "#FFFFFF"

  // UI Elements
  BACKGROUND_COLOR?: string // e.g. "#111111"
  ICON_BG_COLOR?: string
  TOOLBAR_COLOR?: string
  INPUT_FIELD_BACKGROUND_COLOR?: string
  INPUT_FIELD_BORDER_COLOR?: string

  // Cards (from API)
  CARD_LAYER_1_COLOR?: string
  CARD_LAYER_2_COLOR?: string
  CARD_LAYER_3_COLOR?: string
  CARD_LAYER_4_COLOR?: string
  CARD_LAYER_5_COLOR?: string

  // Video/Media
  VIDEO_AUDIO_TILE_COLOR?: string
  VIDEO_AUDIO_TILE_OVERLAY_COLOR?: string
  VIDEO_AUDIO_TILE_TEXT_COLOR?: string
  VIDEO_AUDIO_TILE_AVATAR_COLOR?: string

  // Semantic states
  SEMANTIC_ERROR?: string
  SEMANTIC_SUCCESS?: string
  SEMANTIC_WARNING?: string
  SEMANTIC_NEUTRAL?: string
}

/**
 * CSS Variable Mapping
 * Maps API field names to internal CSS variable names
 */
const CSS_VAR_MAP: Record<keyof RemoteThemeConfig, string> = {
  PRIMARY_COLOR: "--primary",
  PRIMARY_ACTION_BRAND_COLOR: "--primary-brand",

  FONT_COLOR: "--foreground",
  PRIMARY_FONT_COLOR: "--font-high",
  SECONDARY_FONT_COLOR: "--secondary-foreground",

  BACKGROUND_COLOR: "--background",
  ICON_BG_COLOR: "--icon-bg",
  TOOLBAR_COLOR: "--toolbar-color",
  INPUT_FIELD_BACKGROUND_COLOR: "--input-field-bg",
  INPUT_FIELD_BORDER_COLOR: "--input-field-border",

  CARD_LAYER_1_COLOR: "--card_layer_1",
  CARD_LAYER_2_COLOR: "--card_layer_2",
  CARD_LAYER_3_COLOR: "--card_layer_3",
  CARD_LAYER_4_COLOR: "--card_layer_4",
  CARD_LAYER_5_COLOR: "--card_layer_5",

  VIDEO_AUDIO_TILE_COLOR: "--video-tile",
  VIDEO_AUDIO_TILE_OVERLAY_COLOR: "--video-tile-overlay",
  VIDEO_AUDIO_TILE_TEXT_COLOR: "--video-tile-text",
  VIDEO_AUDIO_TILE_AVATAR_COLOR: "--video-tile-avatar",

  SEMANTIC_ERROR: "--semantic-error",
  SEMANTIC_SUCCESS: "--semantic-success",
  SEMANTIC_WARNING: "--semantic-warning",
  SEMANTIC_NEUTRAL: "--semantic-neutral",
}

/**
 * Apply custom theme colors from API config
 * Only applies colors that are provided in the config
 * Keeps existing defaults for any missing values
 *
 * @example
 * ```typescript
 * const config = await fetch('/api/project/config').then(r => r.json())
 * applyCustomTheme(config)
 * ```
 */
export function applyCustomTheme(config: RemoteThemeConfig): void {
  if (typeof window === "undefined") return

  const root = document.documentElement

  // Apply each provided color to its CSS variable
  Object.entries(config).forEach(([apiField, colorValue]) => {
    if (colorValue && typeof colorValue === "string") {
      const cssVar = CSS_VAR_MAP[apiField as keyof RemoteThemeConfig]
      if (cssVar) {
        root.style.setProperty(cssVar, colorValue)
      }
    }
  })
}

/**
 * Convert hex color to RGB string
 * Useful for colors that need RGB format with opacity
 *
 * @example
 * hexToRgbString("#FF0000") => "255, 0, 0"
 * hexToRgbString("#F00") => "255, 0, 0"
 */
export function hexToRgbString(hex: string): string | null {
  let v = hex.trim()
  if (!v.startsWith("#")) return null
  v = v.slice(1)

  // Handle #RGB format
  if (v.length === 3) {
    const r = parseInt(v[0] + v[0], 16)
    const g = parseInt(v[1] + v[1], 16)
    const b = parseInt(v[2] + v[2], 16)
    return `${r}, ${g}, ${b}`
  }

  // Handle #RRGGBB format
  if (v.length === 6) {
    const r = parseInt(v.slice(0, 2), 16)
    const g = parseInt(v.slice(2, 4), 16)
    const b = parseInt(v.slice(4, 6), 16)
    return `${r}, ${g}, ${b}`
  }

  return null
}

/**
 * Get all current theme variables
 * Useful for debugging or displaying current theme
 */
export function getCurrentTheme(): Record<string, string> {
  const root = document.documentElement
  const computed = getComputedStyle(root)
  const theme: Record<string, string> = {}

  Object.values(CSS_VAR_MAP).forEach((cssVar) => {
    theme[cssVar] = computed.getPropertyValue(cssVar).trim()
  })

  return theme
}
