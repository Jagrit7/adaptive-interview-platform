# Therapy Profile

> **When to Read This:** Load this when working on the therapy / biomarker / dashboard-backed sample stack rather than the generic sample apps.

## Scope

This scenario combines:

- `simple-backend`
- `react-video-client-avatar`
- `consultant_dashboard`
- `server-custom-llm`

## Main Differences From Generic Samples

- uses dashboard-backed client identity and meeting authorization
- may route LLM calls through a custom LLM server
- may enable Thymia voice biomarkers and Shen video vitals
- uses meeting-mode endpoints, not just generic AI-session startup

## Canonical Setup References

- repo entry guidance starts at `AGENTS.md` and `docs/ai/`
- `AGENT.md` remains the longer implementation guide for the sample stack
- detailed product/admin layer lives in `consultant_dashboard/docs/ai/`

## Known Hotspots

- profile-prefixed env translation in `simple-backend`
- meeting signal propagation between dashboard and backend
- custom-LLM tunnel freshness
- stale local processes during debugging

## Related Deep Dives

- `recipes/therapist.md`
- `simple-backend/core/meeting_mode.py`
- `simple-backend/core/consultant_dashboard.py`
