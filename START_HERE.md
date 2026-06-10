# Start Here

Hermes has two working layers:

1. App code: `electron/`, `automation/`, `pipeline/`, `scripts/`, `youtube-workflow.mjs`.
2. Agent/wiki context when present: `AGENTS.md`, `index.md`, `log.md`, `prompts/`, and curated `AI-Sessions/` notes.

For a normal app install on another Windows PC, start with `README.md` and run:

```powershell
npm.cmd run setup:windows
```

For Codex or another agent:

1. Read `AGENTS.md` if it is present in the workspace or provided by the thread context.
2. Read `index.md` if the user asks to save, ingest, query, reference, or lint project knowledge.
3. Never store secrets, tokens, OAuth credentials, API keys, raw private notes, screenshots, or generated output artifacts in Git or wiki files.
4. Run `npm.cmd run check:clone-ready` before claiming the repository is portable to another PC.
