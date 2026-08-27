# 08 Security

> Security boundaries for the sample stack, especially where it integrates with production-style services.

## Trust Boundaries

- clients are public-facing sample apps
- `simple-backend` mints Agora credentials and may proxy access to other systems
- dashboard-backed auth is optional and must be explicitly enabled

## Important Risks

- do not expose sample secrets in committed `.env` files
- public custom-LLM URLs need perimeter protection in real deployments
- meeting mode relies on signed internal calls to consultant-dashboard
- test/demo defaults should not be copied blindly into production

## Related Deep Dives

- [therapy_profile](L2/therapy_profile.md) — auth and biomarker boundaries in the therapy stack
