# Google Stitch instruction: shared skill-path page (DSA reference)

Design a responsive **individual learner skill-path detail page** for
InterviewPro. The first and only live path is **Data Structures & Algorithms
(DSA)**. This screen establishes the reusable format for every future skill
page, so the layout and components must be skill-agnostic and content-driven.

## Product context

- This belongs to the individual learning experience, not the enterprise panel
  builder.
- Keep the existing InterviewPro desktop header and left navigation visible.
- The `Skill paths` navigation item is active.
- DSA is available. Frontend, Backend, System Design, Databases and SQL,
  Communication, Behavioural, and AI/ML are visible on the overview but locked
  with a `Coming soon` label.
- Do not imply that coming-soon locks can be removed by gaining XP. They are
  product availability states, not learner prerequisites.

## Visual language

Follow the Lumina/InterviewPro individual theme: playful learning journey,
professional and supportive, modern minimalism with tactile controls.

- Font: Plus Jakarta Sans.
- Page background: very pale blue `#f8f9ff`.
- Primary indigo: `#4648d4`; deep indigo may be used for the hero.
- Success emerald: `#006c49`; mint accent: `#6cf8bb`.
- Warm amber is reserved for warnings or milestones.
- White cards, subtle cool-gray borders, soft shadows, and 16–32 px rounded
  corners.
- Use an 8 px spacing grid. Desktop: 12-column grid with roughly 64 px outer
  margins. Mobile: 4 columns and 16 px margins.
- Buttons are pill-shaped, tactile, and accessible. Avoid gradients, glass
  effects, neon, and enterprise dashboard styling.

## Required shared page anatomy

Use this exact information hierarchy for DSA and every future skill page:

1. Back link to `All skill paths`.
2. Skill hero with availability eyebrow, title, one-sentence outcome,
   difficulty/level, available-module count, and estimated duration.
3. Main two-column desktop layout; stack it on mobile.
4. Left column: a learning roadmap made from reusable module cards.
5. Right column: the preconfigured interviewer summary and primary action.
6. A small release-status note explaining whether the path is live or coming
   soon.

The page component must be driven by fields such as `slug`, `eyebrow`, `title`,
`description`, `level`, `modules`, and `interviewer`; do not hard-code a layout
that only works for DSA.

## DSA reference content

Hero:

- Eyebrow: `DSA FOUNDATIONS`
- Title: `Data Structures & Algorithms`
- Outcome: `Choose the right structure, explain the trade-off, and state the
  cost clearly.`
- Level: `Foundation`
- Three modules are currently available, approximately 65 minutes total.

Roadmap modules:

1. `Arrays and complexity` — available — Arrays, Big O, Complexity — 25 min.
2. `Stacks and queues` — available — Stacks, Queues — 20 min.
3. `Binary search` — available — Searching, O(log n) — 20 min.
4. `Hashing and linked lists` — coming soon.
5. `Trees and graphs` — coming soon.

Show the modules as a clear vertical journey. Available nodes use indigo;
completed nodes will use emerald in the future; coming-soon nodes use neutral
gray with a lock. Module states must remain distinguishable without relying on
color alone.

Interviewer card:

- Name: `Ari`
- Label: `Preconfigured interviewer`
- Description: supportive but rigorous DSA foundations interviewer.
- Five curated questions.
- Evaluates `DSA fundamentals`, `Complexity analysis`, and `Reasoning clarity`.
- Render the primary action as `Enter DSA interview` and link it to the dedicated
  dark interview experience. The learning page remains light; the interview
  room intentionally transitions into the focused dark arena documented in
  ADR-003.

## Responsive and accessibility requirements

- Provide desktop (1440 px) and mobile (390 px) frames.
- On mobile, keep the hero compact, place the interviewer card before or after
  the roadmap without losing the hierarchy, and avoid horizontal scrolling.
- Use semantic headings, visible focus states, AA text contrast, 44 px minimum
  tap targets, and text/icon combinations for status.
- Do not add charts, leaderboards, generic stock illustrations, or unrelated
  dashboard widgets.

## Deliverable

Return one polished DSA detail screen in desktop and mobile form plus a small
component/state sheet showing: module card `available`, `completed`, and
`coming soon`; skill overview card `available` and `coming soon`; and primary
button default, hover, focus, and disabled states. This page is the canonical
template for all future skill paths.
