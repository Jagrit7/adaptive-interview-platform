# 07 Gotchas

> Critical pitfalls and recurring sample-stack failure modes.

## Frequent Failures

- dead custom-LLM tunnel URL in backend env
- Python stdout buffering hides agent creation failures
- stale local process serving old behavior
- wrong profile-prefix translation in `.env`

## Debug Truth Sources

- backend health endpoint
- latest `/tmp/agora_curl_*.sh`
- backend stdout with unbuffered logging

## Related Deep Dives

- [therapy_profile](L2/therapy_profile.md) — troubleshooting for the therapy stack
