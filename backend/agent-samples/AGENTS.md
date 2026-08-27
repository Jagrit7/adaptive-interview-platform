# AI Agent Instructions

This repository uses progressive disclosure documentation. Docs live under
`docs/ai/` in three levels.

## How to Load

1. Read [docs/ai/L0_repo_card.md](docs/ai/L0_repo_card.md) to identify the repo.
2. Load ALL 8 files in `docs/ai/L1/`. They are small — load all upfront.
3. Follow L2 deep-dive links only when L1 isn't detailed enough.
4. Use [AGENT.md](AGENT.md) as a supplemental long-form implementation guide, especially for end-to-end sample bring-up and repo-spanning setup details.

## Git Conventions

### Commit messages

- Format: `type: description` or `type(scope): description`
- Types: `feat:`, `fix:`, `chore:`, `test:`, `docs:`
- Lowercase after prefix
- Present tense
- PR number appended
- No AI tool names
- No `Co-Authored-By` trailers
- Do not use `--no-verify`
- Do not change `git config` identity settings

### Branch names

- Format: `type/short-description`
- Lowercase, hyphen-separated
- Examples: `feat/meeting-transport`, `fix/token-bootstrap`, `docs/progressive-disclosure`

## Doc Commands

| Command | When to use |
| --- | --- |
| `generate docs` | `docs/ai/` does not exist yet |
| `update docs` | code changed and docs need refresh |
| `test docs` | verify docs still match repo behavior |

This repo follows the Agora `ai-devkit` progressive disclosure standard.
