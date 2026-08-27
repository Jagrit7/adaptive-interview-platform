# 04 Conventions

> Repo-specific patterns for profiles, configuration, debugging, and testing.

## Profile Conventions

- env vars are `<PROFILE>_<SETTING>`
- profile names are case-insensitive at request time
- users often provide unprefixed vars; translate them before editing `.env`

## Logging / Debugging

- start backend with `python3 -u` or `PYTHONUNBUFFERED=1`
- curl dump files under `/tmp/agora_curl_*.sh` are the source of truth for actual Agora payloads

## Testing Pattern

- backend tests live under `simple-backend/tests/`
- integration tests cover endpoint behavior without requiring full RTC runtime

## Related Deep Dives

- None
