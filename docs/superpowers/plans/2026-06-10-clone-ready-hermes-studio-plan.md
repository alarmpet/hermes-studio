# Clone Ready Hermes Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh Git clone on another Windows PC install, build, launch, and verify Hermes YouTube Studio without depending on this PC's uncommitted files or hardcoded paths.

**Architecture:** Treat the repository as the source of truth, separate app/runtime assets from personal workspace data, and add deterministic onboarding scripts that validate Node, npm, Electron packaging, shortcut creation, and optional external providers. Keep secrets, Chrome profiles, generated outputs, and Obsidian local cache out of Git.

**Tech Stack:** Windows PowerShell, Node.js/npm, Electron, electron-builder, Playwright, sharp, ffmpeg-static, Git.

---

## Current Findings

- The local branch `feature/youtube-job-runner-integration` is ahead of `hermes-studio/feature/youtube-job-runner-integration` by 10 commits.
- The repository is not clone-ready yet because many required-looking files are still untracked, including `README.md`, `START_HERE.md`, `electron/services/flow-request-pacer.mjs`, `electron/services/longform-chapter-planner.mjs`, `electron/services/longform-chapter-renderer.mjs`, `electron/services/ollama-provider.mjs`, and many `scripts/check-*.mjs` files referenced by `package.json`.
- `scripts/check-shortcut.ps1` currently contains `C:\Users\amd\...` hardcoded paths, so it is not portable to another PC.
- `README.md` and `START_HERE.md` are untracked and currently mix app onboarding with wiki/agent context. A new PC user needs a short app-first install guide.
- Personal/local folders such as `.obsidian/`, `AI-Sessions/raw/`, `obsi/`, `scratch/`, generated outputs, Chrome profiles, OAuth tokens, and API keys must not be committed.

## File Structure

- Modify `C:\Users\amd\hermes\.gitignore`
  - Keep local credentials and generated outputs excluded.
  - Add explicit ignores for local Chrome/Flow profiles, scratch folders, generated screenshots, and temporary clone-test folders.
- Create or modify `C:\Users\amd\hermes\README.md`
  - App-first setup guide for a fresh Windows PC.
  - Explain required installs, build commands, launch commands, and optional provider setup.
- Create or modify `C:\Users\amd\hermes\START_HERE.md`
  - Split “app user onboarding” from “agent/wiki onboarding”.
  - Remove mojibake text and keep Korean/English paths readable.
- Create `C:\Users\amd\hermes\scripts\setup-hermes-studio.ps1`
  - Portable bootstrap: check Node/npm, install dependencies, install Playwright browser if needed, run a focused verification set, and package the Electron app.
- Create `C:\Users\amd\hermes\scripts\create-desktop-shortcut.ps1`
  - Portable shortcut creator using the current repository path and current user Desktop folder.
- Modify `C:\Users\amd\hermes\scripts\check-shortcut.ps1`
  - Remove hardcoded `C:\Users\amd`.
  - Validate shortcut target, launcher script, icon, working directory, and packaged exe.
- Modify `C:\Users\amd\hermes\scripts\check-packaged-runtime-contract.mjs`
  - Ensure every runtime file imported by packaged code exists in `dist-electron\win-unpacked\resources\app.asar.unpacked` or `resources\app.asar` as expected.
- Create `C:\Users\amd\hermes\scripts\check-clone-ready.mjs`
  - Fail if `package.json` references missing scripts.
  - Fail if runtime imports point to untracked or missing files.
  - Fail if forbidden local paths such as `C:\Users\amd` appear in portable scripts/docs.
- Modify `C:\Users\amd\hermes\package.json`
  - Add `setup:windows`, `shortcut:create`, and `check:clone-ready`.
  - Include `check:clone-ready` in the practical release verification path.
- Modify `C:\Users\amd\hermes\timeline.md`
  - Record the clone-ready packaging and shortcut decision after implementation.

## Task 1: Protect The Repository Boundary

**Files:**
- Modify: `C:\Users\amd\hermes\.gitignore`
- Test: `C:\Users\amd\hermes\scripts\check-clone-ready.mjs`

- [ ] **Step 1: Add ignore rules before staging**

Append these rules to `.gitignore`:

```gitignore

# Local browser/provider runtime state
.aistudio-browser-profile*/
browser-profiles/
flow-global-pacing*.json
flow-profile-*/

# Local scratch and generated review artifacts
scratch/
tmp/
temp/
*.png.tmp
*.mp4.tmp
scene_*_flow_*.png
scene_*_flow_*.json

# Agent/private workspace mirrors
obsi/
AI-Sessions/raw/
```

- [ ] **Step 2: Verify forbidden files remain untracked**

Run:

```powershell
git status --short --ignored | Select-String -Pattern "AI-Sessions/raw|client_secrets|youtube-token|browser-profiles|dist-electron|node_modules"
```

Expected:

```text
Ignored entries may appear with !!, but none of these paths should appear as staged files.
```

- [ ] **Step 3: Commit repository-boundary changes**

Run:

```powershell
git add .gitignore
git commit -m "chore: protect local Hermes runtime files"
```

Expected:

```text
[feature/youtube-job-runner-integration <hash>] chore: protect local Hermes runtime files
```

## Task 2: Add A Portable Desktop Shortcut Creator

**Files:**
- Create: `C:\Users\amd\hermes\scripts\create-desktop-shortcut.ps1`
- Modify: `C:\Users\amd\hermes\scripts\check-shortcut.ps1`
- Test: `C:\Users\amd\hermes\scripts\check-desktop-shortcut-launcher.mjs`

- [ ] **Step 1: Create the portable shortcut script**

Create `scripts/create-desktop-shortcut.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Launcher = Join-Path $Root "scripts\launch-hermes-studio.ps1"
$ExePath = Join-Path $Root "dist-electron\win-unpacked\Hermes YouTube Studio.exe"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Hermes YouTube Studio.lnk"

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Launcher script not found: $Launcher"
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Packaged app not found. Run npm run electron:pack first. Missing: $ExePath"
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = "$ExePath,0"
$Shortcut.Save()

Write-Output "Created shortcut: $ShortcutPath"
Write-Output "Target: $($Shortcut.TargetPath)"
Write-Output "Arguments: $($Shortcut.Arguments)"
Write-Output "WorkDir: $($Shortcut.WorkingDirectory)"
Write-Output "Icon: $($Shortcut.IconLocation)"
```

- [ ] **Step 2: Replace hardcoded shortcut check**

Replace `scripts/check-shortcut.ps1` with:

```powershell
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Hermes YouTube Studio.lnk"
$Launcher = Join-Path $Root "scripts\launch-hermes-studio.ps1"
$ExePath = Join-Path $Root "dist-electron\win-unpacked\Hermes YouTube Studio.exe"

if (-not (Test-Path -LiteralPath $ShortcutPath)) {
  throw "Shortcut not found: $ShortcutPath"
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)

Write-Output "Target: $($Shortcut.TargetPath)"
Write-Output "Arguments: $($Shortcut.Arguments)"
Write-Output "WorkDir: $($Shortcut.WorkingDirectory)"
Write-Output "Icon: $($Shortcut.IconLocation)"

if ($Shortcut.TargetPath -notmatch "powershell\.exe$") {
  throw "Shortcut should target powershell.exe"
}

if ($Shortcut.Arguments -notlike "*$Launcher*") {
  throw "Shortcut should launch $Launcher"
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "EXE not found: $ExePath"
}

$FileInfo = Get-Item -LiteralPath $ExePath
Write-Output "EXE exists: $ExePath"
Write-Output "EXE LastModified: $($FileInfo.LastWriteTime)"
```

- [ ] **Step 3: Run the shortcut scripts**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1
powershell -ExecutionPolicy Bypass -File scripts\check-shortcut.ps1
```

Expected:

```text
Created shortcut: <current user's Desktop>\Hermes YouTube Studio.lnk
EXE exists: <repo>\dist-electron\win-unpacked\Hermes YouTube Studio.exe
```

- [ ] **Step 4: Commit shortcut portability**

Run:

```powershell
git add scripts/create-desktop-shortcut.ps1 scripts/check-shortcut.ps1
git commit -m "fix: make Hermes desktop shortcut portable"
```

Expected:

```text
[feature/youtube-job-runner-integration <hash>] fix: make Hermes desktop shortcut portable
```

## Task 3: Add Clone-Ready Verification

**Files:**
- Create: `C:\Users\amd\hermes\scripts\check-clone-ready.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Write clone-ready checker**

Create `scripts/check-clone-ready.mjs`:

```javascript
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const packageJsonPath = resolve(root, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const failures = [];

function fail(message) {
  failures.push(message);
}

function assertExists(relativePath, reason) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${relativePath} missing: ${reason}`);
  }
}

for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  const matches = command.matchAll(/node\s+\.?\/?([^\s&|]+\.mjs)/g);
  for (const match of matches) {
    assertExists(match[1].replace(/^\.\//, ""), `package script ${name} references this file`);
  }
}

for (const required of [
  "README.md",
  "START_HERE.md",
  "scripts/setup-hermes-studio.ps1",
  "scripts/create-desktop-shortcut.ps1",
  "scripts/launch-hermes-studio.ps1",
  "electron/main.mjs",
  "electron/renderer/index.html",
  "youtube-workflow.mjs",
  "youtube-workflow-stages.mjs",
]) {
  assertExists(required, "fresh clone must include this onboarding/runtime file");
}

for (const portableFile of [
  "README.md",
  "START_HERE.md",
  "scripts/setup-hermes-studio.ps1",
  "scripts/create-desktop-shortcut.ps1",
  "scripts/check-shortcut.ps1",
]) {
  const absolutePath = resolve(root, portableFile);
  if (!existsSync(absolutePath)) continue;
  const text = readFileSync(absolutePath, "utf8");
  if (/C:\\Users\\amd/i.test(text)) {
    fail(`${portableFile} contains hardcoded C:\\Users\\amd`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: "clone-ready" }, null, 2));
```

- [ ] **Step 2: Add npm scripts**

In `package.json`, add these scripts near the existing setup/check scripts:

```json
"setup:windows": "powershell -ExecutionPolicy Bypass -File scripts/setup-hermes-studio.ps1",
"shortcut:create": "powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1",
"check:clone-ready": "node scripts/check-clone-ready.mjs"
```

- [ ] **Step 3: Run the checker and confirm it fails before setup script exists**

Run:

```powershell
npm.cmd run check:clone-ready
```

Expected before Task 4:

```text
scripts/setup-hermes-studio.ps1 missing
```

- [ ] **Step 4: Commit checker skeleton**

Run:

```powershell
git add package.json scripts/check-clone-ready.mjs
git commit -m "test: add Hermes clone readiness check"
```

Expected:

```text
[feature/youtube-job-runner-integration <hash>] test: add Hermes clone readiness check
```

## Task 4: Add A Windows Bootstrap Script

**Files:**
- Create: `C:\Users\amd\hermes\scripts\setup-hermes-studio.ps1`
- Test: `C:\Users\amd\hermes\scripts\check-clone-ready.mjs`

- [ ] **Step 1: Create setup script**

Create `scripts/setup-hermes-studio.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $InstallHint"
  }
}

Assert-Command "node" "Install Node.js LTS from https://nodejs.org/"
Assert-Command "npm" "Install Node.js LTS from https://nodejs.org/"
Assert-Command "git" "Install Git for Windows from https://git-scm.com/download/win"

$NodeVersion = (& node --version)
$NpmVersion = (& npm --version)
Write-Output "Node: $NodeVersion"
Write-Output "npm: $NpmVersion"

if ($NodeVersion -notmatch "^v(20|22|24)\.") {
  throw "Node.js 20, 22, or 24 is required. Current: $NodeVersion"
}

if (Test-Path -LiteralPath "package-lock.json") {
  npm.cmd ci
} else {
  npm.cmd install
}

npx.cmd playwright install chromium

npm.cmd run check:clone-ready
npm.cmd run check:studio-inputs
npm.cmd run check:flow-output-mode
npm.cmd run check:final-output-qa
npm.cmd run electron:pack
npm.cmd run shortcut:create
powershell -ExecutionPolicy Bypass -File scripts\check-shortcut.ps1

Write-Output "Hermes YouTube Studio setup complete."
Write-Output "Launch from the Desktop shortcut or run: powershell -ExecutionPolicy Bypass -File scripts\launch-hermes-studio.ps1"
```

- [ ] **Step 2: Run clone-ready check**

Run:

```powershell
npm.cmd run check:clone-ready
```

Expected:

```json
{
  "ok": true,
  "checked": "clone-ready"
}
```

- [ ] **Step 3: Run setup script on the current PC**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-hermes-studio.ps1
```

Expected:

```text
Hermes YouTube Studio setup complete.
```

- [ ] **Step 4: Commit bootstrap script**

Run:

```powershell
git add scripts/setup-hermes-studio.ps1
git commit -m "chore: add Windows setup script for Hermes Studio"
```

Expected:

```text
[feature/youtube-job-runner-integration <hash>] chore: add Windows setup script for Hermes Studio
```

## Task 5: Document Fresh Clone Usage

**Files:**
- Modify: `C:\Users\amd\hermes\README.md`
- Modify: `C:\Users\amd\hermes\START_HERE.md`

- [ ] **Step 1: Replace README with app-first install guide**

Use this content for `README.md`:

```markdown
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

Agent operating rules live in `AGENTS.md`. Wiki validation can be run with:

```powershell
npm.cmd run validate:wiki
```
```

- [ ] **Step 2: Replace START_HERE with clean onboarding**

Use this content for `START_HERE.md`:

```markdown
# Start Here

Hermes has two working layers:

1. App code: `electron/`, `automation/`, `pipeline/`, `scripts/`, `youtube-workflow.mjs`.
2. Agent/wiki context: `AGENTS.md`, `CLAUDE.md`, `index.md`, `log.md`, `prompts/`, and curated `AI-Sessions/` notes.

For a normal app install on another Windows PC, start with `README.md` and run:

```powershell
npm.cmd run setup:windows
```

For Codex or another agent:

1. Read `AGENTS.md`.
2. Read `index.md` if the user asks to save, ingest, query, reference, or lint project knowledge.
3. Never store secrets, tokens, OAuth credentials, API keys, raw private notes, screenshots, or generated output artifacts in Git or wiki files.
4. Run `npm.cmd run check:clone-ready` before claiming the repository is portable to another PC.
```

- [ ] **Step 3: Verify docs contain no hardcoded local path**

Run:

```powershell
npm.cmd run check:clone-ready
```

Expected:

```json
{
  "ok": true,
  "checked": "clone-ready"
}
```

- [ ] **Step 4: Commit onboarding docs**

Run:

```powershell
git add README.md START_HERE.md
git commit -m "docs: add fresh PC setup guide"
```

Expected:

```text
[feature/youtube-job-runner-integration <hash>] docs: add fresh PC setup guide
```

## Task 6: Stage Required Runtime Files Only

**Files:**
- Stage required modified/new app files after review.
- Do not stage: `C:\Users\amd\hermes\.obsidian\`, `C:\Users\amd\hermes\AI-Sessions\raw\`, `C:\Users\amd\hermes\obsi\`, `C:\Users\amd\hermes\scratch\`, local tokens, generated outputs.

- [ ] **Step 1: List untracked files required by package scripts**

Run:

```powershell
npm.cmd run check:clone-ready
```

Expected:

```text
If it fails, every missing path in the JSON failure list must be either committed or removed from package.json scripts.
```

- [ ] **Step 2: Stage runtime and test files deliberately**

Run a reviewed `git add` list, starting with these known required files:

```powershell
git add electron/services/flow-request-pacer.mjs
git add electron/services/korean-text-guard.mjs
git add electron/services/longform-chapter-planner.mjs
git add electron/services/longform-chapter-renderer.mjs
git add electron/services/ollama-provider.mjs
git add electron/services/ollama-script-polish-guard.mjs
git add electron/services/ollama-storyboard-assist.mjs
git add scripts/check-auto-flow-output-mode-policy.mjs
git add scripts/check-auto-video-tts-duration-safety.mjs
git add scripts/check-flow-request-pacer-contract.mjs
git add scripts/check-longform-chapter-plan-contract.mjs
git add scripts/check-longform-chapter-render-contract.mjs
git add scripts/check-ollama-provider-contract.mjs
git add scripts/check-ollama-job-options-contract.mjs
git add scripts/check-ollama-ui-contract.mjs
git add scripts/check-ollama-script-polish-guard.mjs
git add scripts/check-ollama-storyboard-assist.mjs
git add scripts/check-ollama-draft-integration.mjs
```

- [ ] **Step 3: Inspect staged files**

Run:

```powershell
git diff --cached --name-status
```

Expected:

```text
Only app code, docs, package metadata, and verification scripts are staged.
No token, generated output, raw wiki, Chrome profile, or personal cache path is staged.
```

- [ ] **Step 4: Commit required runtime files**

Run:

```powershell
git commit -m "feat: include Hermes Studio runtime files for fresh clones"
```

Expected:

```text
[feature/youtube-job-runner-integration <hash>] feat: include Hermes Studio runtime files for fresh clones
```

## Task 7: Run A Clean Clone Smoke Test

**Files:**
- No source edits expected unless this task finds missing tracked files.

- [ ] **Step 1: Create a clean local clone from the current repository**

Run:

```powershell
$TempRoot = Join-Path $env:TEMP "hermes-clone-ready-test"
if (Test-Path $TempRoot) { Remove-Item -LiteralPath $TempRoot -Recurse -Force }
git clone C:\Users\amd\hermes $TempRoot
Set-Location $TempRoot
git checkout feature/youtube-job-runner-integration
```

Expected:

```text
Cloning into '<temp>\hermes-clone-ready-test'...
Already on 'feature/youtube-job-runner-integration'
```

- [ ] **Step 2: Install dependencies in the clean clone**

Run:

```powershell
npm.cmd install
```

Expected:

```text
added <n> packages
```

- [ ] **Step 3: Run clone-ready and focused checks**

Run:

```powershell
npm.cmd run check:clone-ready
npm.cmd run check:studio-inputs
npm.cmd run check:flow-output-mode
npm.cmd run check:final-output-qa
```

Expected:

```text
Each command exits with status 0.
```

- [ ] **Step 4: Package in the clean clone**

Run:

```powershell
npm.cmd run electron:pack
```

Expected:

```text
win-unpacked package created under dist-electron.
```

- [ ] **Step 5: Create and validate shortcut from the clean clone**

Run:

```powershell
npm.cmd run shortcut:create
powershell -ExecutionPolicy Bypass -File scripts\check-shortcut.ps1
```

Expected:

```text
The Desktop shortcut points to the clean clone launcher and the clean clone packaged EXE exists.
```

## Task 8: Push And Confirm Remote Clone Readiness

**Files:**
- No source edits expected.

- [ ] **Step 1: Confirm local status has no required unstaged app files**

Run:

```powershell
git status --short
```

Expected:

```text
Only intentionally ignored or explicitly deferred personal/wiki/scratch files remain untracked or modified.
```

- [ ] **Step 2: Push to the Hermes Studio remote**

Run:

```powershell
git push hermes-studio feature/youtube-job-runner-integration
```

Expected:

```text
feature/youtube-job-runner-integration -> feature/youtube-job-runner-integration
```

- [ ] **Step 3: Verify remote contains the setup files**

Run:

```powershell
git ls-remote --heads hermes-studio feature/youtube-job-runner-integration
git show hermes-studio/feature/youtube-job-runner-integration:README.md | Select-String -Pattern "setup:windows"
git show hermes-studio/feature/youtube-job-runner-integration:scripts/setup-hermes-studio.ps1 | Select-String -Pattern "Hermes YouTube Studio setup complete"
```

Expected:

```text
Remote branch exists, README documents setup:windows, and setup script is present on the remote branch.
```

## Final Verification Checklist

- [ ] `npm.cmd run check:clone-ready`
- [ ] `npm.cmd run check:studio-inputs`
- [ ] `npm.cmd run check:flow-output-mode`
- [ ] `npm.cmd run check:final-output-qa`
- [ ] `npm.cmd run electron:pack`
- [ ] `npm.cmd run shortcut:create`
- [ ] `powershell -ExecutionPolicy Bypass -File scripts\check-shortcut.ps1`
- [ ] Clean clone test from `C:\Users\amd\hermes` into `%TEMP%\hermes-clone-ready-test`
- [ ] Push to `hermes-studio/feature/youtube-job-runner-integration`

## Self-Review

- Spec coverage: The plan covers Git clone readiness, install/setup, packaging, shortcut portability, missing untracked runtime files, documentation, clean clone smoke testing, and remote push confirmation.
- Placeholder scan: No implementation step relies on “TBD” or unnamed error handling. Every new script has concrete code and each verification command has an expected result.
- Type/path consistency: All paths use `C:\Users\amd\hermes` for the current workspace in the plan, while scripts themselves resolve paths dynamically from their own location so they work on another PC.

