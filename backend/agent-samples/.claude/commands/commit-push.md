---
description: Commit and push changes with linting
---

Create a git commit and push to remote. Follow this process carefully:

1. **Run Linting First** - MANDATORY:
   - Run `pnpm lint` to check for linting errors
   - If there are any errors or warnings, FIX THEM before proceeding
   - Run the lint command again to verify all issues are resolved
   - DO NOT skip this step - linting must be clean before committing

2. **Run Formatting** - MANDATORY:
   - Run `pnpm format` to fix any formatting issues
   - This ensures pre-commit hooks will pass

3. **Create Commit** - Follow the Git Safety Protocol:
   - Run `git status` to see all untracked files
   - Run `git diff` to see both staged and unstaged changes
   - Run `git log -5 --oneline` to see recent commit message style
   - Analyze all changes and draft a commit message following repository
     conventions
   - Add relevant files to staging area
   - Create commit with proper message format
   - If pre-commit hooks fail, fix the issues and retry
   - If formatting issues occur, run `pnpm format` and re-add files
   - Run `git status` after commit to verify success

4. **Push to Remote**:
   - Run `git push` to push the commit to remote
   - Confirm push was successful

IMPORTANT:

- Never skip the linting step
- Never skip the formatting step
- Never commit with linting errors
- Always follow pre-commit hook requirements
- If hooks reject commit, fix issues and retry
- Follow the repository's commit message style
