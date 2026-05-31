# Packaged Render Unpacked Service Modules Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Keep this checklist updated as each task is completed.

**Goal:** Fix the packaged Hermes YouTube Studio final-render crash where `render-youtube-with-tts.mjs` cannot import `electron/services/timeline-transition-renderer.mjs`, and add a release gate so this class of packaged-only import failure cannot recur.

**Architecture:** Keep the external render runner model. Packaged Electron launches an unpacked render script from `app.asar.unpacked/scripts/render-youtube-with-tts.mjs`; every relative module that this script imports must either live beside it in `app.asar.unpacked` or be resolved through a deliberate runtime path. The conservative fix is to unpack the render script's service dependency closure and verify it from the exact packaged runtime path.

**Tech Stack:** Electron, electron-builder `asarUnpack`, Node ESM, PowerShell, existing Hermes check scripts.

---

## Confirmed Root Cause

The reported error is:

```text
ERR_MODULE_NOT_FOUND:
Cannot find module
C:\Users\amd\hermes\dist-electron\win-unpacked\resources\app.asar.unpacked\electron\services\timeline-transition-renderer.mjs
imported from
C:\Users\amd\hermes\dist-electron\win-unpacked\resources\app.asar.unpacked\scripts\render-youtube-with-tts.mjs
```

Local inspection confirms:

- `scripts/render-youtube-with-tts.mjs` imports:
  - `../electron/services/timeline-transition-renderer.mjs`
  - `../electron/services/render-effect-presets.mjs`
- `package.json` currently unpacks:
  - `scripts/**/*`
  - `node_modules/ffmpeg-static/**/*`
  - `node_modules/sharp/**/*`
- The packaged output currently contains `app.asar.unpacked/scripts/render-youtube-with-tts.mjs`.
- The packaged output does **not** contain `app.asar.unpacked/electron/services/timeline-transition-renderer.mjs`.

So this is not a Google Flow, TTS, subtitle, or ffmpeg rendering logic bug. It is a packaged runtime layout bug: the unpacked external Node script is executing outside `app.asar`, but its relative imports still point to sibling files that were not unpacked.

Kepler, the read-only `gpt-5.3-codex-spark` reviewer, independently reached the same conclusion and flagged the missing packaged import-graph test as the main regression gap.

`HERMES_PACKAGED_RENDER_MODULES_REVIEW.md` was also reviewed against the current code and packaged output. The file is mojibake-encoded, but its technical claims are still readable enough to validate. The following points are accepted and folded into this plan:

- Recursive dependency crawling is necessary; checking only the first-level imports of `render-youtube-with-tts.mjs` can miss a second-level packaged-only failure.
- The import parser should handle multiline static imports and simple string-literal dynamic imports.
- Packaged runtime checks should also assert physical native/runtime artifacts that final render depends on, especially `ffmpeg-static/ffmpeg.exe` and Sharp's Windows native package under `node_modules/@img`.

The following point is not adopted as a code-execution test: dynamically importing `render-youtube-with-tts.mjs` during verification. That script performs render work at module top level, so executing it as a probe could start TTS/ffmpeg side effects. Static graph verification is safer for a release gate.

---

## Design Decisions

- [ ] Keep `render-youtube-with-tts.mjs` as an unpacked external script. This avoids changing the Electron process model while fixing the immediate packaged failure.
- [ ] Add a deliberate `asarUnpack` rule for the render script's Electron service dependency closure. Recommended first implementation: unpack `electron/services/**/*.mjs`.
  - Reason: the renderer has already started sharing service modules with desktop orchestration. Unpacking only two files fixes today's crash, but the next import from `electron/services` can break final render again only after packaging.
  - Risk is acceptable: these are bundled source/service files already shipped in `app.asar`; user tokens and browser profiles live under `AppData\Roaming\hermes`, not in the packaged source tree.
- [ ] Add a stricter packaged-runtime check that validates `app.asar.unpacked` directly, not only extracted `app.asar` contents.
- [ ] Add a static ESM import resolver for unpacked render scripts instead of relying only on `node --check`.
  - `node --check` mainly catches syntax and may not prove every ESM relative import exists.
  - Dynamic import may execute top-level render code, which is unsafe because `render-youtube-with-tts.mjs` performs work at module top level.
- [ ] Make the import resolver recursive.
  - First-level checks catch today's missing `timeline-transition-renderer.mjs`.
  - Recursive checks prevent the same failure when a service module later imports another local module.
- [ ] Treat native runtime artifacts as part of the packaged render contract.
  - Final render depends on `ffmpeg-static`.
  - Image/thumbnail and other media operations may depend on Sharp's native Windows package.
  - These checks should remain existence/shape checks, not heavyweight media processing tests.
- [ ] Keep the old source-mode checks, but make packaged release checks fail loudly when a packaged artifact exists and the unpacked dependency closure is incomplete.

---

## Implementation Tasks

- [ ] Create a packaged render import-graph checker.
  - Add `scripts/check-packaged-render-import-graph.mjs`.
  - Input root: `dist-electron/win-unpacked/resources/app.asar.unpacked`.
  - Entry file: `scripts/render-youtube-with-tts.mjs`.
  - Parse static import statements from the entry and recursively inspect relative `.mjs` imports.
  - Use a DFS/BFS visited set so repeated imports and import cycles do not loop forever.
  - Support these import forms:

```javascript
const staticImportRegex = /import\s+(?:[^{"']*\{[\s\S]*?\}|[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
const sideEffectImportRegex = /import\s+["']([^"']+)["']/g;
const dynamicImportRegex = /import\((["'])([^"'\n]+)\1\)/g;
```

  - Assert every resolved relative import exists under `app.asar.unpacked`.
  - Ignore built-in imports such as `node:fs` and package imports such as `ffmpeg-static`; those are checked by separate package artifact assertions.
  - If an import has no extension, resolve in this order:
    - exact path
    - `<path>.mjs`
    - `<path>.js`
    - `<path>/index.mjs`
    - `<path>/index.js`
  - For this incident, the checker must explicitly catch:
    - `electron/services/timeline-transition-renderer.mjs`
    - `electron/services/render-effect-presets.mjs`
  - Do not execute the render script during this check.

- [ ] Wire the checker into the existing package verification path.
  - Update `package.json` `check:packaged-render-runner` to include `node scripts/check-packaged-render-import-graph.mjs`.
  - Update `scripts/check-electron-config.mjs` to assert that the selected `asarUnpack` policy includes `electron/services/**/*.mjs` or an equivalent render service dependency rule.
  - Update `scripts/check-packaged-runtime-contract.mjs` to read from both:
    - extracted `app.asar` for normal app source contracts
    - `app.asar.unpacked` for external render runtime contracts
  - Add exact physical artifact assertions:
    - `dist-electron/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe`
    - `dist-electron/win-unpacked/resources/app.asar.unpacked/node_modules/@img/sharp-win32-x64`
    - at least one `.node` file under `node_modules/@img/sharp-win32-x64`

- [ ] Fix the packaging rule.
  - Update `package.json` `build.asarUnpack`:

```json
"asarUnpack": [
  "scripts/**/*",
  "electron/services/**/*.mjs",
  "node_modules/ffmpeg-static/**/*",
  "node_modules/sharp/**/*"
]
```

- [ ] Rebuild the packaged desktop app.
  - Run `npm.cmd run electron:pack`.
  - Confirm `dist-electron/win-unpacked/resources/app.asar.unpacked/electron/services/timeline-transition-renderer.mjs` exists.
  - Confirm `dist-electron/win-unpacked/resources/app.asar.unpacked/electron/services/render-effect-presets.mjs` exists.

- [ ] Verify with automated checks.
  - Run `node scripts/check-packaged-render-import-graph.mjs`.
  - Run `npm.cmd run check:packaged-render-runner`.
  - Run `node scripts/check-packaged-runtime-contract.mjs`.
  - Run `node scripts/check-electron-config.mjs`.
  - Run `npm.cmd run check`.

- [ ] Verify the actual failure path.
  - Restart Hermes YouTube Studio from the updated desktop shortcut after closing old processes.
  - Retry the failed job from the packaged app.
  - If scene media already exists, prefer a render-only retry to avoid burning Flow generation time.
  - Confirm the error has moved past module resolution and either completes final render or fails on a new, real media/TTS issue.

- [ ] Update project history.
  - Append `timeline.md` with:
    - date/time
    - failure symptom
    - root cause
    - packaging/check changes
    - verification commands

---

## Regression Tests To Add

- [ ] `scripts/check-packaged-render-import-graph.mjs` should fail on the current broken package where `scripts` is unpacked but `electron/services` is not.
- [ ] The same checker should pass after `electron/services/**/*.mjs` is included in `asarUnpack` and the package is rebuilt.
- [ ] The checker should catch nested missing dependencies, not only imports in the entry file.
- [ ] The checker should parse multiline imports, side-effect imports, and simple string-literal dynamic imports without executing the modules.
- [ ] `scripts/check-electron-config.mjs` should fail if someone later removes the service unpack rule while the render script still imports `../electron/services/*`.
- [ ] `scripts/check-packaged-runtime-contract.mjs` should report the exact missing unpacked file path, not a vague package contract failure.
- [ ] `scripts/check-packaged-runtime-contract.mjs` should fail with a precise message if `ffmpeg.exe` or Sharp's native Windows package is missing from `app.asar.unpacked/node_modules`.

---

## Risks And Mitigations

- [ ] **Risk:** Unpacking all `electron/services/**/*.mjs` slightly increases the unpacked package footprint.
  - **Mitigation:** Accept this for reliability; these files are already shipped in the app package and do not contain user secrets.

- [ ] **Risk:** A render script may later import from `automation`, `pipeline`, or another top-level folder and repeat the same packaged-only failure.
  - **Mitigation:** The static import-graph checker should follow relative imports and fail on any missing target, regardless of folder.

- [ ] **Risk:** A regex-based parser can miss complex JavaScript import patterns.
  - **Mitigation:** Keep the checker intentionally scoped to Hermes render scripts: static imports, side-effect imports, and string-literal dynamic imports. If render scripts start using computed dynamic imports, require an explicit allowlist entry or switch this checker to a real parser such as `es-module-lexer`.

- [ ] **Risk:** Sharp's native files may live under platform-specific `@img` packages rather than inside the top-level `sharp` package.
  - **Mitigation:** Check the Windows package path actually used by the current dependency layout: `node_modules/@img/sharp-win32-x64`, and require at least one native `.node` binding there.

- [ ] **Risk:** The desktop shortcut may still launch an old running process or old package after rebuild.
  - **Mitigation:** After implementation, close existing Hermes processes before verifying and confirm the shortcut target points at the freshly rebuilt `dist-electron/win-unpacked\Hermes YouTube Studio.exe`.

- [ ] **Risk:** Fixing this module error may reveal the next downstream issue in TTS, ffmpeg, or media duration.
  - **Mitigation:** Treat that as a separate failure only after module resolution is proven fixed; preserve logs and `render-report-v2.json`.

---

## Recommended Execution Order

1. Add the import-graph checker first and run it against the current package to reproduce the missing module in a controlled way.
2. Add native artifact assertions for ffmpeg and Sharp in the packaged runtime contract.
3. Update `asarUnpack` and check scripts.
4. Rebuild the Electron package.
5. Run the full verification set.
6. Relaunch the desktop app and retry the failed final render path.
