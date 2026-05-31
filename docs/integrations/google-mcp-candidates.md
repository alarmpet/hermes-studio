# Google MCP First-Wave Candidates

Hermes Studio only approves these MCP candidates for the first integration wave. All are disabled by default and must run behind explicit developer/user controls.

| Provider | Type | Repo / Source | Auth model | Default | Hermes use | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Chrome DevTools MCP | diagnostic-provider | `https://github.com/ChromeDevTools/chrome-devtools-mcp` | Browser debug session | Disabled | Inspect Google Flow, Gemini, ChatGPT, and Electron console/network/DOM state | approved-first-wave |
| NotebookLM MCP | research-provider | `https://github.com/PleasePrompto/notebooklm-mcp` | Isolated browser profile | Disabled | Optional source-grounded research beside Gemini Gems fallback through `ask_question` | approved-first-wave |
| Google Workspace MCP | archive-provider | `https://github.com/aaronsb/google-workspace-mcp` | OAuth token | Disabled | Drive/Docs/Sheets source reading and output archive through `manage_drive` / `manage_docs` / `manage_sheets` | approved-first-wave |

## Safety Rules

- MCP providers do not replace the canonical Hermes local job runner.
- Browser-auth MCPs can expose account pages and session data; keep them disabled unless needed.
- OAuth tokens must use encrypted local storage through Electron `safeStorage`.
- NotebookLM calls must use a strict timeout and fall back to Gemini Gems/Gemini/OpenRouter.
- External MCP child processes must be stopped on app quit and provider disable.
- Live MCP calls use stdio JSON-RPC framing and remain opt-in through explicit context flags.

## Deferred References

| Candidate | Reason |
| --- | --- |
| Antigravity | Useful as a developer workflow reference, not a packaged Hermes runtime dependency. |
| Gemini MCP | Overlaps with existing Gemini/Gems/OpenRouter path and may add key/cost concerns. |
| Vertex Genmedia / Imagen / Veo | Requires billing/quota decisions and should be planned separately. |
