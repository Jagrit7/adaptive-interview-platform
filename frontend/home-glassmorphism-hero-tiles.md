# Home Page — Glassmorphism Tile-Dashboard Hero (Vapi-style)

Scope: `frontend/app/page.tsx` (Home) only, plus one new shared component `frontend/components/ui/GlassTile.tsx` (and `GlassDashboardPreview.tsx`) so the same treatment can be reused later in the builder summary strip or report screen. Do NOT touch `frontend/app/builder/` — that restructure is a separate, already-scoped task.

## Reference

Attached screenshot (Vapi marketing site): a dark hero with a warm red/amber gradient glow bleeding through a floating panel of translucent, frosted "glass" tiles — four small stat tiles in a row (Total calls, Avg latency, Avg cost, Success rate), then three larger glass agent-card tiles below them with mini sparkline graphs. Everything sits on top of a background photo, with the glass surfaces letting the color/light behind them show through, blurred.

We're not copying Vapi's content (we have no live call data on the Home page) or its warm color — we're copying the **surface treatment**: translucent, blurred, bordered tiles floating over a glowing gradient, with a tile-grid arranged above the main content, exactly like the screenshot's stat-row-above-cards hierarchy. Our version uses our own per-role accent palette and our own SDE panel as the illustrative content.

## What's changing and why

The current Home hero (per the original frontend brief) is: centered project-name field, ambient waveform behind everything, then two flat choice cards below. It works but reads as a form, not a product. Adding a glass tile-dashboard preview above the choice cards — populated with our real SDE recipe as sample content — gives the page an immediate "this is a working product" impression the same way Vapi's hero screenshot does, before the user has configured anything themselves.

Nothing about Home's actual behavior changes — project name field, waveform motif, and the two choice cards keep their existing copy/behavior/motion rules from the original brief. This is a new decorative/illustrative section added above them, not a replacement.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│         (ambient waveform pulse, very low opacity)        │
│                                                            │
│              [ Untitled panel ]  ← editable, unchanged    │
│                                                            │
│   ┌────────────────────────────────────────────────────┐ │
│   │  glow: role-accent gradient blob, blurred, behind   │ │
│   │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐            │ │
│   │  │ tile  │ │ tile  │ │ tile  │ │ tile  │  ← stat row │ │
│   │  └───────┘ └───────┘ └───────┘ └───────┘            │ │
│   │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │ │
│   │  │ agent tile │ │ agent tile │ │ agent tile │        │ │
│   │  │ (glass)    │ │ (glass)    │ │ (glass)    │        │ │
│   │  └────────────┘ └────────────┘ └────────────┘       │ │
│   └────────────────────────────────────────────────────┘ │
│                                                            │
│   [ Use a recipe ]        [ Build from scratch ]           │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

The whole glass panel is purely illustrative (non-interactive, or at most a subtle hover shimmer) — it previews what a configured panel looks like, it does not link anywhere or read real state. Clicking still only happens via the two existing choice cards underneath.

## Glass tile spec

New CSS variables (add alongside the existing token table, don't replace it):

| Token | Value | Use |
|---|---|---|
| `--glass-surface` | `rgba(19, 19, 22, 0.45)` | tile background |
| `--glass-border` | `rgba(237, 237, 239, 0.08)` | tile border, 1px |
| `--glass-highlight` | `rgba(237, 237, 239, 0.06)` | top inner highlight (1px inset, top edge only) |
| `--glass-blur` | `blur(20px)` | `backdrop-filter` value |

- `backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);` on every tile.
- Border-radius 14px on tiles (matches the card radius already defined in the base brief, not a new value).
- Box-shadow: soft, dark, `0 8px 24px rgba(0,0,0,0.35)` — no colored shadow, the color comes from the glow blob behind, not the tile itself.
- Tiles never have their own solid gradient fill — the color always comes from what's blurred behind them (the glow blob), so tiles must sit in front of, not instead of, the glow layer.

### Glow blob (the "behind the glass" color)

- One large, soft, blurred gradient shape (radial or conic) positioned behind the tile grid, `filter: blur(80px)`, opacity ~0.35.
- Color: a blend of 2–3 role accents already in the palette (Indigo `#6E56CF`, Amber `#E8A33D`, Teal `#2DD4BF`) rather than Vapi's single warm red — this is what makes it "ours" instead of a copy of their screenshot. Rotate slowly (very slow, 30s+ loop) or keep fully static if `prefers-reduced-motion` is set.
- The blob must stay behind `z-index`-wise; it should never be sharp or fully opaque anywhere.

### Stat tile row (4 small tiles)

Illustrative, static numbers pulled from the SDE recipe's own defaults — not live/fake-live metrics, and never phrased as if they're real usage data. Label them plainly, e.g.:
- "4 interviewer roles"
- "Adaptive difficulty"
- "Live voice, Agora"
- "Evidence-based scoring"

Each tile: label (`--text-secondary`, 12px caption) + short value/phrase (`--text-primary`, 14–15px body). No numbers-that-look-like-metrics-but-aren't (don't invent a fake "93% success rate" the way a real dashboard would show — that would misrepresent the product).

### Agent tiles (3 larger tiles below the stat row)

Preview three of the SDE panel's real roles (Technical, Hiring manager, Behavioural — pick any 3, doesn't need to be all 4) as mini glass cards:
- Small color dot in that role's accent (same accent tokens as the rest of the app — Indigo/Amber/Teal/etc.)
- Role name + one-line description straight from that role's existing default prompt/persona summary
- A thin static waveform glyph (not animated here — this is a preview tile, the real animated waveform stays reserved for the actual hero background and later the live-session "listening" indicator, per the original brief's "don't overuse it" rule)

## Responsive behavior

- Desktop: stat row is 4-across, agent tiles 3-across, all inside one glass panel.
- Mobile: stat row wraps to 2x2, agent tiles stack to a single column, still inside the same glass panel (don't break the panel into separate floating cards on mobile — keep it one contained unit that just reflows).
- Respect `prefers-reduced-motion`: glow blob rotation off, tile hover shimmer off, everything else stays static (this matches the reduced-motion rule already defined for the waveform in the base brief).

## What NOT to change

- Editable project-name field — same inline console-prompt behavior as before, untouched.
- The two "Use a recipe" / "Build from scratch" choice cards — same copy, same click behavior, same hover treatment as the original brief. The glass panel sits above them, doesn't replace or restyle them.
- Ambient waveform pulse — stays as its own separate, very-low-opacity background layer; the glow blob is a new, additional element, not a swap-in replacement for the waveform.
- Type scale, spacing scale, and the base color-token table — unchanged; this brief only adds glass/glow tokens on top.
- No real data wiring — every number/label in the glass tiles is static illustrative content, not pulled from any backend call.
- Builder page, scorer config, or any other screen — out of scope for this task, same as stated above.
