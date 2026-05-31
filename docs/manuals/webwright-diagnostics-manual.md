# Webwright Diagnostics Manual

Hermes Studio uses Playwright as the production browser automation engine. Webwright is optional and disabled by default.

## Why Webwright Is Optional

Webwright is useful for browser automation diagnosis because it creates reusable scripts, logs, and screenshots. It should not replace the existing Hermes Flow/Gemini/ChatGPT automation until the generated scripts are reviewed and validated.

## Install

```powershell
cd C:\Users\amd
git clone https://github.com/microsoft/Webwright.git
cd C:\Users\amd\Webwright
python -m pip install -e .
python -m playwright install chromium
```

## Enable in Hermes

Set this in the Hermes config or enable the Webwright diagnostics checkbox in Studio:

```json
{
  "webwrightDiagnosticsEnabled": true,
  "webwrightCommand": "webwright"
}
```

## Output

Each failed job may contain:

- `diagnostics-webwright\task.md`
- `diagnostics-webwright\webwright-diagnostics-result.json`
- `chatgpt-thumbnail-diagnostics.json`
- `chatgpt-thumbnail-diagnostics.png`
- `chatgpt-thumbnail-tool-menu.png`

## Operator Rule

If the failure code is `CHATGPT_HUMAN_VERIFICATION_REQUIRED`, complete Authenticate ChatGPT manually first. Webwright must not bypass human verification.

Before running a manual Webwright diagnostic against any authenticated browser profile, close Hermes Studio browser automation windows and confirm no job is currently running. Do not point Webwright at `chatgptProfileDir`, `geminiProfileDir`, or `flowProfileDir` while Hermes is actively using that profile.
