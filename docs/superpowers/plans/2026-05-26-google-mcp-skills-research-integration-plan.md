# Google MCP and Skills Research Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement only the first safe MCP integration wave for Hermes Studio: Chrome DevTools MCP diagnostics, NotebookLM MCP as an optional research assistant, and Google Workspace MCP for source/archive workflows.

**Architecture:** Hermes Studio should not blindly route production jobs through arbitrary MCP servers. Add a controlled "External Research & Tool Providers" layer behind feature flags, while the existing Hermes workflow remains the canonical job runner. The first implementation wave is limited to developer diagnostics, optional source-grounded research, and read-only/archive-oriented Google Workspace workflows.

**Tech Stack:** Electron, Node.js MCP client adapter, existing Playwright/Chrome profiles, Gemini/Gems browser workflow, Google Flow automation, local file-based job artifacts, Chrome DevTools MCP, NotebookLM MCP, Google Workspace MCP.

---

## 2026-05-26 Scope Update

The first implementation pass is now intentionally limited to these three integrations:

1. Chrome DevTools MCP
   - Use only for developer diagnostics.
   - Purpose: inspect Google Flow/Gemini/ChatGPT/Electron browser state with console, network, screenshot, DOM, and performance evidence.
   - Must be disabled by default and never exposed as a normal end-user generation dependency.

2. NotebookLM MCP
   - Use only as an optional research provider beside the existing `Gemini Gems -> Gemini fallback` path.
   - Purpose: URL/document/source-grounded research, long-document Q&A, citation-oriented checks, and reusable channel/topic notebooks.
   - Must not bypass Hermes HPSL, duration, copyright transformation, Flow policy, or final QA guards.

3. Google Workspace MCP
   - Use first for Drive/Docs/Sheets source reading and output/archive organization.
   - Purpose: import source docs, archive scripts, SRT files, thumbnails, QA reports, and final render metadata.
   - Start read-only, then add write/archive mode only after explicit user enablement.

Everything else from the research pass is deferred:

- Antigravity: reference only for developer workflow and console UX ideas; not a Hermes runtime dependency.
- Gemini MCP: defer because it overlaps with existing Gemini/Gems/OpenRouter logic and may introduce API/key/cost concerns.
- Vertex Genmedia / Imagen / Veo / Nano Banana API path: defer because it requires billing/quota decisions and is outside this first no/low-cost integration wave.

## 2026-05-26 Review Verification Update

Reviewed `C:/Users/amd/hermes/HERMES_GOOGLE_MCP_INTEGRATION_REVIEW.md` against the current codebase.

Accepted:

- External MCP process lifecycle cleanup is valid. Hermes will spawn optional MCP servers from Electron/Node, so `external-provider-registry.mjs` must track child PIDs and terminate the full process tree on app quit, provider disable, timeout, and crash paths.
- NotebookLM MCP timeout and instant fallback are valid. NotebookLM MCP relies on browser/session automation, so every call must have a strict timeout and must fall back to the existing `Gemini Gems -> Gemini -> OpenRouter` chain without blocking rendering.
- Google Workspace OAuth token encryption is valid. Google Drive/Docs/Sheets tokens must not be stored as plaintext JSON. Use Electron `safeStorage` for encrypted local credential storage and expose clear account-reset controls.
- Provider settings persistence is valid, but should match the current Hermes storage model. The current repo has `bot_db_helper.py` with a `jobs` table and `workflow_json`; there is no verified `projects` table. Therefore persist per-job provider choices in normalized job input/workflow details first, and add migration-safe `jobs.research_provider` / `jobs.archive_provider` columns only if the implementation needs direct SQL filtering/reporting.
- Authentication account switching is required in the desktop console. The Authentication panel must let the user re-authenticate or switch accounts for ChatGPT, Gemini, Google Flow, YouTube Upload, NotebookLM, and Google Workspace when usage limits, quota, or account restrictions are hit.

Rejected or deferred:

- Do not add a `projects` SQLite table as part of this first MCP wave. It is not present in the verified schema and would expand the architecture beyond the current request.
- Do not make `tree-kill` mandatory until implementation checks whether Node/PowerShell process-tree cleanup is enough on Windows. The plan may use `tree-kill` or an equivalent Windows-safe helper, but the acceptance criterion is full child-process cleanup, not a specific package.
- Do not store broad OAuth tokens in the same plaintext `config-store.mjs` JSON file. The existing config store is suitable for non-secret preferences, not Google Workspace refresh tokens.

## Research Summary

### 1. Google official MCP direction

Google maintains `google/mcp`, a hub for official MCP servers, Cloud deployment guidance, and examples. The repository lists remote MCP servers for Google Cloud products and open-source MCP servers/extensions including Google Workspace, Firebase, Cloud Run, Google Analytics, MCP Toolbox for Databases, Google Cloud Storage, Genmedia, gcloud CLI, Google Observability, Flutter/Dart, Maps tooling, and Chrome DevTools.

Hermes relevance:

- Strong signal that MCP is a first-class Google direction.
- For Hermes Studio, the most relevant official/near-official items are:
  - Chrome DevTools MCP: browser QA/debugging.
  - Google Workspace MCP: Drive/Docs/Sheets source library, project notes, output archive.
  - Genmedia / Vertex AI Creative Studio experiments: possible future API path for Imagen/Veo/Nano Banana style generation.

Source:

- `https://github.com/google/mcp`

### 2. Antigravity

Google Antigravity is an agent-first IDE with Agent Manager, asynchronous agents, browser surface, MCP support, skills, and "Build with Google" bundles. It is useful as a development environment pattern and external agent host, but not something Hermes Studio should depend on at runtime.

Hermes relevance:

- Good inspiration for Hermes Studio's console UX: task artifacts, browser recordings, progress proofs, reviewable outputs.
- Useful for developers working on Hermes, not for end users running packaged Hermes Studio.
- Do not build Hermes Studio around Antigravity-specific config paths because this would make the app less portable.

Sources:

- `https://antigravity.google/docs/ide-overview?app=antigravity`
- `https://www.antigravity.google/docs/build-with-google`

### 3. Chrome DevTools MCP

`ChromeDevTools/chrome-devtools-mcp` is highly relevant. It lets an AI agent control and inspect live Chrome through Chrome DevTools, including screenshots, console logs, network requests, performance traces, input automation, snapshots, and Lighthouse. It supports Antigravity, Codex, Gemini CLI, Claude Code, VS Code, Cursor, and other clients. It also warns that browser contents are exposed to MCP clients, so it must be treated as a privileged diagnostic tool.

Hermes relevance:

- High value for debugging Google Flow, Gemini, ChatGPT thumbnail automation, and packaged Electron UI.
- Better than screenshot-only debugging because it can inspect network requests and console messages.
- Should be integrated only in developer/diagnostic mode, not enabled by default in user production runs.

Recommended use:

- Add a "Developer Diagnostics: Chrome DevTools MCP" plan for Hermes maintainers.
- Use it to inspect:
  - Google Flow selected mode image/video.
  - Whether media URLs appear after generation.
  - Gemini/Gems response completion state.
  - Electron renderer console errors.

Source:

- `https://github.com/ChromeDevTools/chrome-devtools-mcp`

### 4. NotebookLM MCP candidates

There are multiple NotebookLM MCP projects. The strongest candidate is `PleasePrompto/notebooklm-mcp`, which has significant GitHub activity and supports persistent Chrome auth, notebook Q&A, notebook management, citations, profiles, stdio/HTTP transports, and Codex CLI configuration. It uses real Chrome/Patchright and stores auth in per-user profile directories.

Other candidates:

- `moodRobotics/notebooklm-mcp-server`: simpler universal installer, persistent browser session, Antigravity/Gemini CLI examples, but much smaller project footprint.
- `Pantheon-Security/notebooklm-mcp-secure`: claims security hardening and broader features, but should be treated cautiously until audited.
- `roomi-fields/notebooklm-mcp`: newer, may be useful later but not first choice.

Hermes relevance:

- Very useful for research-grounded scripts if the user wants to maintain reusable notebooks per niche, channel, or source category.
- Useful for "source pack" workflows:
  - User drops URLs/PDFs/docs into a NotebookLM notebook.
  - Hermes asks grounded questions through MCP.
  - Hermes generates HPSL draft from cited notes rather than one-off web page scraping.
- Not ideal for direct packaged Hermes runtime yet because it depends on browser auth and non-official NotebookLM automation.

Recommended use:

- Pilot as optional research provider, not core provider.
- Store NotebookLM notebook id/name in Hermes project config.
- Use only for source-grounding and fact checks, not for final script generation unless the output passes Hermes draft QA.

Primary source:

- `https://github.com/PleasePrompto/notebooklm-mcp`

Secondary source:

- `https://github.com/moodRobotics/notebooklm-mcp-server`

### 5. Google Workspace MCP

`aaronsb/google-workspace-mcp` provides authenticated access to Gmail, Calendar, Drive and more, built on Google's Workspace CLI. It supports multi-account credential routing and Drive search/management workflows.

Hermes relevance:

- Useful for importing source docs from Drive/Docs/Sheets.
- Useful for archiving generated scripts, metadata, final output links, thumbnails, QA reports.
- Could support a "content calendar" workflow through Google Sheets/Calendar.
- Less urgent than fixing Gemini/Flow quality, but valuable for production operations.

Recommended use:

- Phase 2 after core video generation stabilizes.
- Start read-only: Drive search and Docs read.
- Later add write/export: save script, SRT, metadata, thumbnail copy, YouTube upload result.

Source:

- `https://github.com/aaronsb/google-workspace-mcp`

### 6. Gemini MCP and web-search MCP

`philschmid/gemini-mcp-server` exposes Gemini API tools such as web search and model delegation over MCP. It can run locally or remotely and uses `GEMINI_API_KEY` for stdio.

Hermes relevance:

- Useful for developer-side experiments and comparison against current Gemini browser/Gems workflow.
- Less aligned with the user's current "use free/browser/Gems first" direction because API keys may involve cost or quota.
- Good fallback for structured research when browser Gemini is unstable, but it must remain optional.

Source:

- `https://github.com/philschmid/gemini-mcp-server`

### 7. Genmedia / Vertex AI Creative Studio / Veo / Imagen / Nano Banana

`GoogleCloudPlatform/vertex-ai-creative-studio` is a large Google Cloud sample app showcasing Veo, Gemini Image Generation/Nano Banana, Chirp, Gemini TTS, Lyria, character consistency workflows, asset library, and experiments/MCP tools. It explicitly says it is not an officially supported Google product and is intended for demonstration rather than production.

Hermes relevance:

- Architecturally very relevant because Hermes is also a media pipeline.
- Potential future direction: replace fragile Google Flow browser automation with official Vertex AI/Genmedia API calls when the user accepts API cost and Google Cloud setup.
- Not immediate default because the user has repeatedly prioritized low/no-cost browser workflows and already uses Google Flow authenticated browser generation.

Recommended use:

- Study its prompt/workflow patterns for character consistency, asset library, and media job lifecycle.
- Do not depend on its app directly.
- Add a future "Provider Adapter" interface so Hermes can choose:
  - `flow-browser`
  - `vertex-genmedia-api`
  - `openai-image-api`
  - `local/mock`

Source:

- `https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio`

## Candidate Ranking for Hermes Studio

### Approved for first implementation wave

1. Chrome DevTools MCP
   - Purpose: debug Google Flow/Gemini/Electron UI with console/network/screenshot/performance evidence.
   - Runtime mode: developer-only.
   - Risk: exposes browser data to MCP client; keep disabled by default.

2. NotebookLM MCP pilot
   - Purpose: grounded research notebook for scripts and source verification.
   - Runtime mode: optional source provider.
   - Risk: unofficial browser automation; needs auth profile isolation and fallback.

3. Google Workspace MCP
   - Purpose: Drive/Docs/Sheets source ingestion and archive/export.
   - Runtime mode: optional integration with explicit OAuth.
   - Risk: broad Google account permissions; start read-only.

### Deferred after first implementation wave

4. Genmedia/Vertex AI provider adapter
   - Purpose: API-based image/video generation with better reliability than Flow browser automation.
   - Runtime mode: paid/advanced provider.
   - Risk: Google Cloud setup, billing, quotas, policy requirements.

5. Gemini MCP server
   - Purpose: API-based research/model delegation.
   - Runtime mode: optional fallback.
   - Risk: key/cost; overlaps with existing Gemini/Gems/OpenRouter logic.

6. Antigravity skills/bundles
   - Purpose: developer environment, not packaged app runtime.
   - Runtime mode: use externally while developing Hermes.
   - Risk: product-specific config and portability issues.

## Proposed Hermes Architecture

### New boundary: External Provider Registry

Create a registry that knows about optional providers but does not hard-code them into the main workflow.

Provider types:

- `research-provider`
  - `gemini-gems-browser`
  - `gemini-browser`
  - `openrouter`
  - `notebooklm-mcp`

- `asset-provider`
  - `google-flow-browser`
  - existing local/mock media verification only

- `diagnostic-provider`
  - `chrome-devtools-mcp`
  - existing Playwright screenshots/logs

- `archive-provider`
  - `local-files`
  - `google-drive-mcp`
  - `google-docs-mcp`

This keeps Hermes Studio stable: if any MCP provider fails, the job should degrade gracefully or mark `action-required` without breaking the canonical local pipeline.

### Authentication and Account Switching Boundary

Hermes already exposes Authentication buttons for ChatGPT, Gemini, Google Flow, and YouTube Upload in `electron/renderer/index.html`, with auth routing through `electron/services/auth-service.mjs`. The first MCP wave must extend this panel from simple "authenticate once" buttons into account management:

- Each auth target shows:
  - current status
  - provider/account label when detectable
  - last authenticated time
  - "Authenticate / Open" button
  - "Change Account" button
  - "Clear Saved Session" button
- Browser-profile providers:
  - ChatGPT
  - Gemini
  - Google Flow
  - NotebookLM
  - Chrome DevTools diagnostic browser
- OAuth-token providers:
  - YouTube Upload
  - Google Workspace
- "Change Account" behavior:
  - Browser-profile provider: close any active auth browser for that provider, mark the current profile as stale, open a clean profile or account chooser URL, then update status after the user finishes login.
  - OAuth-token provider: delete/revoke the encrypted local token, start OAuth again, and store the replacement token through secure storage.
- "Clear Saved Session" behavior must be explicit and guarded with a confirmation because it removes local login state.
- When generation fails because of account quota, session expiry, or provider usage limits, the console should surface an `action-required` message with a direct button to the relevant provider's account-change flow.

## Implementation Plan

### Task 1: Add First-Wave MCP Candidate Registry Documentation

Status: implemented in `docs/integrations/google-mcp-candidates.md`.

**Files:**

- Create: `docs/integrations/google-mcp-candidates.md`
- Modify: `timeline.md`

Steps:

- [ ] Create a candidate matrix with only Chrome DevTools MCP, NotebookLM MCP, and Google Workspace MCP as `approved-first-wave`.
- [ ] Move Antigravity, Gemini MCP, and Vertex Genmedia into a `deferred-reference-only` section.
- [ ] Include explicit warnings for browser-auth MCPs and Google account permissions.
- [ ] State that MCP providers cannot replace the canonical Hermes job runner.
- [ ] Add a timeline entry for this research pass.
- [ ] Verification: `node scripts/check-timeline-contract.mjs`

### Task 2: Add External Provider Registry Skeleton

Status: implemented in `electron/services/external-provider-registry.mjs`.

**Files:**

- Create: `electron/services/external-provider-registry.mjs`
- Create: `scripts/check-external-provider-registry.mjs`
- Modify: `package.json`

Provider records:

```js
{
  id: "notebooklm-mcp",
  type: "research-provider",
  status: "experimental",
  defaultEnabled: false,
  auth: "browser-profile",
  risk: "unofficial-browser-automation",
  command: "npx",
  args: ["notebooklm-mcp@latest"],
}
```

Acceptance:

- Registry contains only Chrome DevTools MCP, NotebookLM MCP, and Google Workspace MCP as active first-wave candidates.
- Registry may include deferred reference metadata for Antigravity, Gemini MCP, and Vertex Genmedia only if `status: "deferred"` and `defaultEnabled: false`.
- All external providers are disabled by default.
- Active provider processes are tracked by provider id and pid.
- Registry exposes `stopProvider(providerId)` and `stopAllProviders()` so Electron can clean up on app quit and provider disable.
- `npm run check` includes the registry contract.

### Task 2A: Add MCP Process Lifecycle Cleanup Guard

Status: implemented. Electron now calls `stopAllProviders()` during app shutdown paths.

**Files:**

- Modify: `electron/services/external-provider-registry.mjs`
- Modify: `electron/main.mjs`
- Create: `scripts/check-mcp-process-lifecycle.mjs`
- Modify: `package.json`

Behavior:

- `external-provider-registry.mjs` must maintain a map of active MCP process records:

```js
{
  providerId: "notebooklm-mcp",
  pid: 1234,
  startedAt: "2026-05-26T12:00:00.000Z",
  command: "npx",
  args: ["notebooklm-mcp@latest"]
}
```

- Electron main must call `stopAllProviders()` during `before-quit`, `window-all-closed`, and fatal provider disable paths.
- Windows cleanup may use `taskkill /PID <pid> /T /F`, `tree-kill`, or a local helper. The implementation must avoid string-built destructive file commands and only target tracked PIDs.
- Provider shutdown must be logged as a workflow diagnostic event, not silently swallowed.

Acceptance:

- `scripts/check-mcp-process-lifecycle.mjs` verifies that:
  - process records are tracked
  - `stopProvider`
  - `stopAllProviders`
  - Electron quit hook integration
  - Windows process-tree cleanup command or library call
- `npm run check` includes the lifecycle check.

### Task 2B: Add Secure Token Storage Helper

Status: implemented in `electron/services/secure-token-store.mjs` for Google Workspace and future OAuth-token providers.

**Files:**

- Create: `electron/services/secure-token-store.mjs`
- Create: `scripts/check-secure-token-store.mjs`
- Modify: `electron/services/workspace-archive-provider.mjs` after it exists
- Modify: `pipeline/youtube-auth.mjs` only after a compatibility migration plan is written

Behavior:

- Store Google Workspace OAuth tokens with Electron `safeStorage` when encryption is available.
- Store only encrypted buffers/base64 payloads on disk.
- Non-secret provider preferences remain in `config-store.mjs`.
- If `safeStorage.isEncryptionAvailable()` is false, Google Workspace write/archive mode must be disabled and the UI must show action-required guidance.
- YouTube Upload token migration is deferred until Google Workspace secure storage is working, because YouTube upload already exists and should not be destabilized in the same patch.

Acceptance:

- `scripts/check-secure-token-store.mjs` verifies:
  - `safeStorage` is imported from `electron`
  - plaintext token JSON is not written by the secure helper
  - unavailable encryption produces an explicit error/action-required path
  - provider preferences and secrets are separated

### Task 3: Add Developer Diagnostics Plan for Chrome DevTools MCP

Status: implemented as a developer-only Windows runbook in `docs/superpowers/plans/2026-05-26-chrome-devtools-mcp-diagnostics-plan.md`.

**Files:**

- Create: `docs/superpowers/plans/YYYY-MM-DD-chrome-devtools-mcp-diagnostics-plan.md`

Plan contents:

- How to launch Hermes Studio in dev mode.
- How to connect Chrome DevTools MCP to the relevant Chrome/Flow/Gemini session.
- Which artifacts to collect:
  - console messages
  - network request list
  - screenshot
  - DOM snapshot
  - performance trace only when needed
- What not to collect:
  - cookies
  - account pages
  - personal browser tabs

Acceptance:

- Plan gives exact commands for Windows.
- Plan keeps Chrome DevTools MCP developer-only.

### Task 4: NotebookLM Research Provider Pilot

Status: partially implemented. Job schema, UI provider selection, auth target, timeout/fallback contract, prompt builder, failure classifier, Gemini context injection, and opt-in MCP stdio `ask_question` live call path are implemented. The remaining work is end-to-end auth/profile validation against a real NotebookLM account.

**Files:**

- Create: `electron/services/notebooklm-provider.mjs`
- Create: `scripts/check-notebooklm-provider-contract.mjs`
- Modify: `youtube-workflow-stages.mjs`

Behavior:

- Add optional `researchProvider: "notebooklm-mcp"` mode.
- Hermes asks NotebookLM for source-grounded facts, citations, and long-document Q&A results.
- Hermes still passes the result through existing HPSL draft generation and QA.
- If NotebookLM MCP fails, times out, or auth expires, Hermes falls back to Gemini Gems and records the provider failure.
- NotebookLM must be selectable per job or as a saved app default; it must not become the global default silently.
- Every NotebookLM MCP call must have a strict timeout, default 30 seconds.
- Timeout/session/auth failures must be classified as provider failures and written to the provider fallback chain.

Acceptance:

- NotebookLM provider cannot bypass:
  - HPSL structure QA
  - duration QA
  - source transformation/copyright guard
  - Flow prompt safety
- NotebookLM timeout cannot hang the Electron UI or final render stage.

### Task 5: Google Workspace Archive Pilot

Status: partially implemented. Auth target, secure token storage boundary, archive provider selection, readonly scopes, credential loader, archive record shape, and opt-in MCP stdio `manage_drive search` live call path are implemented. The remaining work is end-to-end OAuth validation against a real Google Workspace account.

**Files:**

- Create: `electron/services/workspace-archive-provider.mjs`
- Create: `scripts/check-workspace-archive-provider-contract.mjs`
- Modify: renderer settings UI only if the provider is enabled.

Behavior:

- Read-only first:
  - Drive search for source docs.
  - Docs read for scripts.
  - Sheets read for planned topics/content calendars if configured.
- Later write mode:
  - Save final script, metadata, SRT, thumbnail path, final video path/report.

Acceptance:

- OAuth scopes are documented.
- User must explicitly enable write/archive mode.
- Local file output remains canonical.
- Google Workspace tokens are stored through `secure-token-store.mjs`, not plaintext config JSON.
- Workspace auth can be changed from the Authentication panel without manually deleting files.

### Task 6: Authentication Account Management UI

Status: implemented for the desktop console. The Authentication panel now has authenticate, change account, and clear saved session controls for ChatGPT, Gemini, Google Flow, YouTube Upload, NotebookLM, and Google Workspace.

**Files:**

- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/preload.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/services/auth-service.mjs`
- Modify: `electron/services/config-store.mjs`
- Create: `scripts/check-auth-account-switching.mjs`
- Modify: `package.json`

Behavior:

- Extend the Authentication panel with account management rows for:
  - ChatGPT
  - Gemini
  - Google Flow
  - YouTube Upload
  - NotebookLM
  - Google Workspace
- Each row has:
  - status text
  - last authenticated time
  - `Authenticate / Open`
  - `Change Account`
  - `Clear Saved Session`
- `Change Account` for browser-profile providers:
  - releases any profile lock
  - opens a clean account chooser or fresh provider profile
  - updates `config.auth[target]` with `status: "auth-window-opened"`, `lastStartedAt`, and `profileDir`
- `Change Account` for OAuth-token providers:
  - deletes the encrypted token for that target
  - opens OAuth again
  - updates status with `lastStartedAt`
- `Clear Saved Session`:
  - requires confirmation
  - removes the provider-specific browser profile or encrypted token
  - sets status to `cleared`
- Account-change actions must never delete unrelated profiles or shared app data.

Acceptance:

- `scripts/check-auth-account-switching.mjs` verifies:
  - UI contains Change Account controls for all six targets
  - preload exposes `authChangeAccount` and `authClearSession`
  - main process registers IPC handlers
  - auth service exports `changeAuthAccount` and `clearAuthSession`
  - config supports auth metadata for NotebookLM and Google Workspace
- Existing `scripts/check-local-studio-product.mjs` still passes for the original four auth buttons.

### Task 7: Persist MCP Provider Choices in Job Metadata

Status: implemented in normalized YouTube job options and desktop job submission payloads.

**Files:**

- Modify: `youtube-job-schema.mjs`
- Modify: `electron/renderer/app.js`
- Modify: `youtube-job-runner.mjs`
- Modify: `workflow-db-events.mjs`
- Modify: `bot_db_helper.py` only if direct SQL filtering/reporting is needed
- Create: `scripts/check-mcp-provider-persistence.mjs`
- Modify: `package.json`

Behavior:

- Add normalized job input fields:

```js
{
  researchProvider: "gemini-gems-browser",
  archiveProvider: "local-files"
}
```

- Allowed `researchProvider` values:
  - `gemini-gems-browser`
  - `notebooklm-mcp`
- Allowed `archiveProvider` values:
  - `local-files`
  - `google-workspace-mcp`
- Persist these choices in the job JSON/workflow details.
- Add `jobs.research_provider` and `jobs.archive_provider` columns only if `workflow_json` is not enough for job list filtering.

Acceptance:

- Provider choices survive job creation and appear in workflow events.
- Invalid provider ids are rejected during schema normalization.
- If SQLite columns are added, use migration-safe `ensure_column` and keep existing DBs compatible.

## Recommended Order

1. Document first-wave candidates and risks.
2. Add provider registry skeleton with all first-wave providers disabled by default.
3. Add process lifecycle cleanup before any MCP server is spawned in production.
4. Add secure token storage before Google Workspace write/archive auth.
5. Add Authentication account switching controls so usage-limit/account-expiry recovery is available from the console.
6. Add Chrome DevTools MCP diagnostic workflow for developers.
7. Pilot NotebookLM MCP as optional grounded research provider with 30-second timeout/fallback.
8. Add Google Workspace read-only source/archive provider.
9. Persist provider choices in job metadata.
10. Only after the above is stable, revisit deferred providers in a separate plan.

## Decisions

- Do not replace Gemini Gems with NotebookLM. NotebookLM should supplement source grounding, not become the script generator.
- Do not expose arbitrary MCP configuration in the packaged Hermes Studio UI yet. That is too risky for non-technical users.
- Do not make Antigravity a runtime dependency.
- Do not switch media generation to Vertex/Veo/Imagen by default until cost, quota, and auth are explicitly accepted.
- Do use Chrome DevTools MCP for developer debugging because it directly addresses recurring Flow/Gemini browser automation failures.
- Do implement only Chrome DevTools MCP, NotebookLM MCP, and Google Workspace MCP in this first wave.
- Do add Authentication account-change controls for all browser-profile and OAuth-token providers.
- Do encrypt Google Workspace OAuth tokens with Electron `safeStorage`.
- Do not add a new `projects` table in this first MCP wave.

## Open Questions

1. Should NotebookLM be used only for URL/article source verification, or also for keyword-based channel research?
2. Should Hermes Studio expose MCP settings in the app UI, or keep MCP integrations developer-configured for now?
3. Should Google Workspace write/archive mode save outputs to a fixed Hermes folder structure in Drive, or let the user choose a Drive folder per saved app profile?
4. For browser-profile account switching, should Hermes keep multiple named profiles per provider, or simply clear/switch the single provider profile?
