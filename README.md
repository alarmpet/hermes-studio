# Hermes YouTube Studio

Hermes YouTube Studio is a Windows desktop workflow for drafting, generating, rendering, and reviewing YouTube videos.

## Fresh Windows PC Setup

1. Install Git for Windows.
2. Install Node.js LTS 20 or newer.
3. Clone the repository.
4. Open PowerShell in the repository folder.
5. Run:

```powershell
npm.cmd run setup:windows
```

The setup script installs npm dependencies, installs Playwright Chromium, runs core verification checks, packages the Electron app, and creates a Desktop shortcut named `Hermes YouTube Studio`.

## Launch

Use the Desktop shortcut, or run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\launch-hermes-studio.ps1
```

## Optional Providers

- Google Flow requires a logged-in Chrome/Flow session and may be rate limited by Google.
- Ollama local assist is optional. Configure the app with an Ollama base URL only on trusted LANs.
- YouTube upload requires local OAuth credentials and tokens. Do not commit credentials or tokens.

## Verification

Run focused checks:

```powershell
npm.cmd run check:clone-ready
npm.cmd run check:studio-inputs
npm.cmd run check:flow-output-mode
npm.cmd run check:final-output-qa
```

Run packaging:

```powershell
npm.cmd run electron:pack
npm.cmd run shortcut:create
```

## Agent/Wiki Context

Agent operating rules may be present in `AGENTS.md` in agent-managed workspaces. Wiki validation can be run with:

```powershell
npm.cmd run validate:wiki
```
