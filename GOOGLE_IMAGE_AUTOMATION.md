# Google AI Studio Image Automation

This automates the Google AI Studio web UI after the user logs in manually.

Do not request or paste Google session cookies such as `SID`, `SIDCC`, `__Secure-3PAPISID`, OAuth refresh tokens, or browser profile data. Those values can grant account access and should stay inside the user's browser.

## UI Automation Without API Keys

This flow uses a visible Chrome window with a separate local browser profile:

```powershell
node .\aistudio-ui-image.mjs --url "https://labs.google/fx/ko/tools/flow" --prompt "a cinematic vertical video of a matte black mechanical keyboard on a walnut desk" --out .\outputs\flow.mp4 --timeout 600
```

When the browser opens:

1. Log in to Google manually if prompted.
2. Make sure Flow is open.
3. Return to the terminal and press Enter.
4. The script opens or creates a Flow project.
5. It applies these settings: Video, Asset, 9:16, 1x, Veo 3.1 - Lite.
6. The script enters the prompt, clicks Generate, waits for the result, and saves the generated media when the page exposes it.

The browser profile is stored at `.aistudio-browser-profile` by default, so later runs can reuse the same login session without copying cookies.

Optional flags:

```powershell
node .\aistudio-ui-image.mjs --url "https://labs.google/fx/ko/tools/flow" --prompt "..." --out .\outputs\flow.mp4 --timeout 600 --profile .\.aistudio-browser-profile
```

## API Alternative

If you later decide to use the official Gemini API instead of the UI, `generate-gemini-image.mjs` is available:

```powershell
$env:GEMINI_API_KEY = "YOUR_API_KEY"
node .\generate-gemini-image.mjs --prompt "a cinematic product photo" --out .\outputs\image.png --aspect 16:9 --size 1K
```

## Why This Flow

The unsafe plan was to bypass Google login by copying browser cookies into a headless session. The safer UI replacement is a user-controlled browser profile: login stays inside the browser, while automation only controls normal page actions after login.

This does not bypass Google's login, 2FA, captcha, usage limits, subscription rules, or account policies. It only automates the clicks you would normally perform in the web UI.
