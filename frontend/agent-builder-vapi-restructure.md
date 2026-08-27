# Agent Builder Page — Restructure to Vapi-style Tabbed Layout

Scope: `frontend/app/builder/` only (`AgentConfigForm.tsx`, `LeftRail.tsx`, `ScorerConfigForm.tsx`). Do NOT touch `frontend/app/page.tsx` (home page) — that stays as-is.

## What's changing and why

Right now the per-agent config is one long form with collapsible sections. Vapi's assistant builder — which this should now resemble — instead splits configuration into a **tab strip**, each tab a focused single-purpose panel, plus a persistent live summary and a test action always visible regardless of which tab is open. This scales better as more fields get added and makes the builder feel like a real product rather than a settings form.

Nothing about the underlying config schema changes — this is purely a restructuring of how the same fields from the existing schema (Identity, Voice, Behavior/Prompt, Interview logic, Skills, Tools, Turn-taking, Scoring input) are presented.

## Layout

```
┌─────────────┬──────────────────────────────────────────────┐
│             │  [Agent name]                    [Talk] [Save]│
│  Left rail  │  ───────────────────────────────────────────  │
│  (agents +  │  Live summary strip (see below)               │
│  scorer)    │  ───────────────────────────────────────────  │
│  unchanged  │  [Identity] [Voice] [Prompt] [Interview]       │
│  from       │  [Skills] [Tools] [Turn-taking] [Scoring]      │
│  current    │  ───────────────────────────────────────────  │
│  build      │                                                │
│             │  <active tab's form content>                  │
│             │                                                │
└─────────────┴──────────────────────────────────────────────┘
```

Left rail stays exactly as already built — no changes there.

### Live summary strip

A slim horizontal strip directly under the agent name, always visible regardless of active tab (this is the equivalent of Vapi's cost/latency estimate, adapted to our domain — we don't have a cost metric, so show what actually matters here):

- Current difficulty band (e.g. "Medium → Hard")
- Voice (vendor + voice name, small icon if available)
- Skill count enabled (e.g. "2 of 4 skills on") as a simple chip row
- Role accent color swatch + role label

Style: single row, small text, muted background (`--surface`), no borders between items — a status line, not another card. Update live as the person edits any tab, no save required to see it reflect.

### Tab strip

Seven tabs, directly mapping onto the existing field groups — don't invent new categories:

1. **Identity** — name, role/persona type, accent color, avatar
2. **Voice** — TTS voice, language, speaking style (if applicable), interrupt sensitivity (move this here from Skills if it's currently there — it's a voice/audio concern, keep it in one place)
3. **Prompt** — system prompt (large textarea), greeting message, failure/fallback message, scenario/context brief (conditionally shown when Role-play mode is on)
4. **Interview logic** — difficulty band, seed questions (repeatable list), follow-up aggressiveness, max turns before handoff
5. **Skills** — role-play mode, loop until satisfied, contradiction/vagueness probing (toggle switches, each with inline one-line description)
6. **Tools** — multi-select of available tools as chips, empty state message if none enabled
7. **Turn-taking & Scoring** — can-open toggle, handoff triggers, priority weight, AND competency tags for scoring (these two were separate sections before; combine into one tab since both are "how this agent fits into the panel," not standalone concerns)

Tab styling: underline-style active indicator in the agent's own accent color (not a generic brand color) — reinforces the per-role color system already in place. Inactive tabs in `--text-secondary`, active tab in `--text-primary`. Keep the tab bar itself in a single row; if it wraps on narrow viewports, that's acceptable, don't scroll-hide tabs.

Switching tabs must not lose any unsaved edits on other tabs — all tabs share one in-memory config object for the currently selected agent (this should already be true given `builderStore.ts`; just confirm tab-switching doesn't reset or discard state).

### Persistent header actions

Top-right of the panel, visible regardless of active tab:
- **Talk** button — starts a live test of just this one agent (calls the existing `/token` and `/agents/start` routes the same way `test-voice` does, scoped to this agent's current in-progress config, not a saved recipe). This is the single most valuable addition from the Vapi pattern — configuring something you can't quickly test isn't nearly as useful as one you can test immediately without leaving the page.
- **Save** button — existing save behavior, unchanged.

### Empty / validation states

Unchanged from current behavior — zero-agents empty state, inline field validation — just now scoped per-tab instead of one long form (e.g. a missing prompt shows its error under the Prompt tab, and the tab label can carry a small dot/indicator if that tab has an unresolved error, so the person doesn't have to hunt across seven tabs to find what's wrong).

## What NOT to change

- Left rail (agent list, add-agent flow) — unchanged
- Scorer config (`ScorerConfigForm.tsx`) — this is a separate entity from a single agent, not part of this tab restructure. Leave it as its own rail entry with its own form, same as now.
- Home page (`app/page.tsx`) — explicitly out of scope for this task
- The design system tokens (colors, type, motion) from the original frontend brief — this task is about information architecture (tabs vs. one long scroll), not the visual language itself
- No new fields — every field in the new tabs already exists in the current schema; this is a reorganization, not new scope
