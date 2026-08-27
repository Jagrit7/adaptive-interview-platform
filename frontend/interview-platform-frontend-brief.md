# Adaptive Interview Platform — Frontend Build Brief

Next.js app. Two screens for this phase: Home, and Create From Scratch (agent builder). "Use a recipe" flow reuses the same agent builder pre-filled with recipe data, so build the agent builder to be recipe-agnostic from day one.

This doc is the full spec: visual direction, page-by-page behavior, and the complete field list per agent. Build to this; don't invent scope beyond it yet.

---

## 1. Visual direction

Dark, near-black, like Agora's own console — but the accent system is per-role color, not a single brand blue. Color here isn't decoration: it's how a user tracks which interviewer is which, everywhere in the product (builder, live transcript, final report). Keep that mapping consistent across every screen you touch, now and later.

### Palette

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0C` | page background |
| `--surface` | `#131316` | cards, panels |
| `--surface-raised` | `#1B1B1F` | modals, active panel |
| `--border` | `#232327` | hairlines |
| `--border-strong` | `#333338` | hover/focus borders |
| `--text-primary` | `#EDEDEF` | headings, primary copy |
| `--text-secondary` | `#9C9CA3` | labels, helper text |
| `--text-muted` | `#5C5C63` | placeholders, disabled |

Role accents (assign one per interviewer persona, reused everywhere that persona appears — avatar ring, tab indicator, transcript speaker tag, score card):

| Role accent | Hex | Suggested default mapping |
|---|---|---|
| Indigo | `#6E56CF` | Technical |
| Amber | `#E8A33D` | Product / business |
| Teal | `#2DD4BF` | Hiring manager |
| Rose | `#F2545B` | Customer (role-play) |
| Violet | `#C2418C` | Behavioural |
| Slate | `#7A7A85` | Scorer / system (neutral, not a speaking persona) |

If a user adds a 6th+ custom agent, cycle a wider ramp rather than reusing a color already on screen — two agents sharing a color defeats the point.

### Typography

- Display face: something geometric/technical, not a default AI-safe serif — e.g. Space Grotesk or General Sans. Used sparingly: page title, agent name in its config header, and the home hero.
- Body face: Inter or similar clean sans for everything else.
- Mono face: JetBrains Mono (or similar) for anything transcript-like, IDs, or code-shaped values (voice IDs, model names).
- Type scale: keep it restrained — display 32/40px, section headers 18/20px, body 14/15px, captions/labels 12px. No more than 4 sizes on a single screen.

### Signature element: the waveform pulse

This is a voice product — make that legible in the UI, not just the feature list. A thin animated waveform (a row of vertical bars, amplitude subtly randomized) is the one recurring motif. Use it:
- Ambient and slow in the home hero background (very low opacity, not distracting)
- As a live "listening" indicator wherever an agent is actively speaking/listening in later live-session screens
- NOT on every card, button, or hover state — it's a signature, not a texture. If you're using it more than twice per screen, cut it back.

### Motion

- Page load: a single orchestrated reveal (hero text + cards fade/slide in staggered by ~60ms), not scattered per-element animation.
- Micro-interactions: hover states on cards/buttons get a subtle lift (2-4px translateY + border-color shift to `--border-strong`), 150-200ms ease.
- Respect `prefers-reduced-motion` — disable the waveform animation and stagger, keep instant state changes.
- No more than one animated element competing for attention at a time.

### General

- Border radius: 8px on controls, 12-16px on cards. No fully-square corners, no pill-everything.
- Keyboard focus must be visibly distinct (a 2px ring in the active role's accent color, or `--text-primary` on neutral controls).
- Fully responsive down to mobile — the agent builder in particular needs a workable narrow-viewport layout (see section 3).

---

## 2. Page 1 — Home

**Purpose:** name the project, then choose a starting point. Nothing else on this page.

### Layout

- Centered, generous vertical whitespace, waveform pulse ambient behind everything at very low opacity.
- Hero: large, editable project name field styled like a live console prompt — placeholder text "Untitled panel" in `--text-muted`, blinking cursor, click-to-edit inline (no separate "edit" button). This is the project's name for later reference, not a form field with a label — it should feel like naming a document, not filling out a form.
- Below the hero, two large interactive choice cards, side by side on desktop, stacked on mobile:
  1. **Use a recipe** — teaser copy naming that presets exist (SDE panel, UPSC-style panel, etc. — pull actual names from the recipe list once defined), each with its role-accent colors visible as small swatches so the choice card itself previews the palette a user will get.
  2. **Build from scratch** — plain framing: "Add agents one at a time and configure everything yourself."
- Each card: distinct subtle accent glow on hover (border-color shift + slight elevation), not two identical gray boxes with different text.

### Copy rules

- Active voice, plain verbs: "Use a recipe" / "Build from scratch," not "Recipe Mode" / "Custom Mode."
- No filler subheading under the project name field — the placeholder text does that job.

### Behavior

- Selecting either card navigates to the agent builder (page 2). "Use a recipe" passes a recipe ID that pre-populates agents; "Build from scratch" opens the builder with zero agents.

---

## 3. Page 2 — Agent builder (create from scratch / recipe-populated)

**Purpose:** add any number of agents, fully configure each one, configure the scorer, save the panel.

### Layout

- **Left rail** (collapses to a top scroll-strip on mobile): list of added agents. Each row shows a color dot (its role accent), name, and role label. "+ Add agent" pinned at the bottom of the rail, always visible.
- **Main panel**: the currently-selected agent's full config form. Selecting a rail item swaps this panel; the selected rail item gets a left border in its accent color.
- **Scorer** gets its own entry in the rail, visually distinct (slate accent, no avatar/voice-related fields, placed either at the top or bottom of the rail list, separated by a divider) since it isn't a voice agent.
- **Top bar**: project name (editable, same inline-console-prompt style as home), Save button, and eventually a Start/Preview action (not needed this phase, just leave the slot).

### Adding an agent

- "+ Add agent" opens a lightweight inline step: pick a role archetype (Technical / Hiring manager / Product / Customer / Behavioural / Custom) which pre-assigns a default accent color and a starter system prompt template — not a blank form. User can rename, recolor (from the palette, not a full color picker — keep it constrained to the defined ramp plus a few extras), and reassign role freely afterward.
- No hard cap on agent count, but the rail should handle 8-10 gracefully before it needs to scroll.

### Per-agent config form

Organize into collapsible sections. Default open: Identity, Voice, Behavior/Prompt. Default collapsed: everything else, with sensible defaults already filled in (so a user who touches nothing still gets a working agent).

**Identity**
- Name (text)
- Role/persona type (select: Technical, Hiring manager, Product, Customer, Behavioural, Custom)
- Accent color (swatch picker, constrained palette)
- Avatar/icon (small icon picker or auto-generated from name initials — don't build a full image upload for this phase)

**Voice**
- TTS voice (dropdown, vendor + voice name)
- Language / accent (dropdown)
- Speaking style (pace/tone slider or preset chips, only if the eventual vendor supports it — otherwise omit rather than fake it)

**Behavior / prompt**
- System prompt (large textarea, pre-filled per role template, fully editable)
- Greeting message (short text field, only relevant/shown if this agent can be the opening speaker — see Turn-taking)
- Failure/fallback message (short text field, default provided)
- Scenario/context brief (textarea, only shown when Role-play mode is toggled on under Skills — conditionally rendered, not always visible)

**Interview logic**
- Difficulty band (min-max slider or two selects: starting difficulty + adjustable range)
- Seed questions (optional repeatable text list — add/remove rows, not required)
- Follow-up aggressiveness (slider: light touch → probing)
- Max turns before handoff (number input, sensible default e.g. 4-6)

**Skills** (toggle switches, each with a one-line description on hover/inline, not a separate help modal)
- Role-play / scenario mode
- Loop until satisfied
- Contradiction / vagueness probing
- (Interrupt sensitivity lives here too, or under Voice — pick one, don't duplicate)

**Tools**
- Multi-select of available tools (e.g. code execution, knowledge base lookup) — render as chips, empty state says plainly "No tools enabled" rather than an empty box.

**Turn-taking**
- Can open the interview (toggle)
- Handoff triggers (this can start as a simple multi-select against other agents' names/roles — "hands off to Product when: business impact not addressed" — free text condition field is fine for this phase, don't over-engineer a rule builder yet)
- Priority weight (number input or simple low/medium/high select)

**Scoring input**
- Competencies this agent owns (repeatable tag list — e.g. "System design," "Customer empathy") — this is what feeds the scorer's per-agent coverage check.

### Scorer config (separate entry, not a per-agent form)

- Competency list (auto-populated from every agent's "Scoring input" tags, editable)
- Rubric/weight per competency (simple 1-5 or percentage weight per item)
- Satisfaction threshold (single slider or number — score needed per competency to count as "covered")

### Empty / error states

- Zero agents: main panel shows a plain invitation ("Add your first agent to get started") not a broken-looking blank form.
- Validation errors (e.g. missing prompt on save): inline under the specific field, in the interface's voice — state what's missing and what to do, no vague "something went wrong."

### Save

- Save button in the top bar persists the whole panel (all agents + scorer config) as a named project. What it saves to (local state, API call) is a backend concern outside this doc — the frontend just needs a clear saved/unsaved indicator (e.g. a dot next to the Save button that clears on save).

---

## 4. Stack notes

- Next.js, App Router.
- Build the per-agent config form schema-driven if practical — the field list above is stable and reused for every agent instance, so a form generated from a shared schema will be far less error-prone than hand-built forms per role.
- Keep the color-token system in one place (CSS variables or a Tailwind theme extension) so role colors stay consistent if reused later in live-session and report screens.
- This doc doesn't cover the live-interview screen or the final report screen — those come later; don't build ahead of them.
