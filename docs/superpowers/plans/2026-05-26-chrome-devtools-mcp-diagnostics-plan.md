# Chrome DevTools MCP Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a developer-only runbook for using Chrome DevTools MCP to diagnose Hermes Studio browser automation failures.

**Architecture:** Chrome DevTools MCP is a privileged diagnostic provider, not a production generation dependency. Use it only when debugging Google Flow, Gemini, ChatGPT thumbnail automation, or the Electron renderer, and keep collected artifacts focused on technical evidence.

**Tech Stack:** Windows PowerShell, `npx chrome-devtools-mcp@latest`, Hermes Electron dev mode, Chrome DevTools MCP, local screenshots/logs.

---

## Developer-Only Rule

Chrome DevTools MCP can inspect browser pages, console logs, DOM state, network requests, and screenshots. Treat it as developer-only because logged-in browser tabs may contain private account data.

Do not collect:

- cookies
- authorization headers
- account settings pages
- personal browser tabs
- full page dumps from unrelated websites
- private prompts or credentials beyond the failing Hermes workflow

## Windows Commands

Launch Hermes Studio in dev mode:

```powershell
cd C:\Users\amd\hermes
npm.cmd run electron:dev
```

Launch Chrome DevTools MCP only for the debugging session:

```powershell
npx chrome-devtools-mcp@latest
```

If the MCP client needs an explicit command entry, use:

```json
{
  "command": "npx",
  "args": ["chrome-devtools-mcp@latest"]
}
```

## Evidence To Collect

- console messages from the failing tab
- network request list around the failed action
- screenshot of the failing UI state
- DOM snapshot of the relevant controls
- performance trace only when a page hangs or becomes extremely slow

## Hermes Debug Targets

- Google Flow image/video mode selection
- Google Flow media URL exposure after generation
- Gemini/Gems JSON response completion state
- ChatGPT thumbnail generation controls
- Electron renderer console errors

## Task Checklist

- [ ] Start Hermes in dev mode.
- [ ] Reproduce one failed workflow only.
- [ ] Attach Chrome DevTools MCP to the relevant tab.
- [ ] Capture console messages, network summary, screenshot, and DOM snapshot.
- [ ] Save artifacts under the job directory or a developer diagnostics folder.
- [ ] Stop Chrome DevTools MCP after the debug session.
