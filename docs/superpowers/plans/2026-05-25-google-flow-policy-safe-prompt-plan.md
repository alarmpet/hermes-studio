# Google Flow Policy Safe Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Google Flow image/video generation failures caused by celebrity, public figure, or real-person likeness prompts while preserving useful visual storytelling.

**Architecture:** Add a Flow prompt safety layer between draft scene planning and Google Flow submission. The layer rewrites risky real-person names and likeness cues into generic roles, records exactly what was changed, retries once with a safer prompt when Flow blocks generation, and exposes the reason in Electron progress and diagnostics.

**Tech Stack:** Node.js ES modules, Playwright Google Flow automation, existing Hermes YouTube workflow, static smoke scripts, Google Flow Help guidance.

---

## Evidence From Google Flow Help

Google Flow's official help says video prompts should describe the scene in detail and be specific about subject, action, environment, lighting, and style. It also documents references, characters, avatars, and ingredients as special mechanisms, with safety checks around likeness and avatar content. Flow's video model table also shows short clip lengths are model-specific, so Hermes must keep prompts concise and scene-scoped rather than pushing a whole article/person into one prompt.

Sources:
- [Create videos in Google Flow](https://support.google.com/flow/answer/16353334?hl=en&ref_topic=16908930)
- [Create & edit images in Google Flow](https://support.google.com/flow/answer/16729550?hl=en&ref_topic=16908930)
- [Create & use your avatar in Google Flow](https://support.google.com/flow/answer/17102997?hl=en&ref_topic=16908930)
- [Learn about Google Flow models & supported features](https://support.google.com/flow/answer/16352836?hl=en&ref_topic=16908930)

## Root Cause Hypothesis

The observed error says:

```text
이 프롬프트는 유명인의 동영상 생성에 관한 Google 정책을 위반할 가능성이 있습니다.
```

This is most likely triggered before media generation because a Flow prompt contains a famous person's name, a public figure name, or a likeness-style instruction that resembles "make this real person appear in a video."

Current Hermes risk points:

- `automation/gemini-research-draft.mjs` asks Gemini to create `character_profile` and scene prompts.
- `youtube-workflow.mjs` normalizes scenes and applies `character_profile` to every `image_prompt`.
- `electron/services/script-planner.mjs` creates `Scene keywords` from narration, which may include article names, politician names, celebrity names, company leaders, or entertainers.
- `automation/google-flow-media.mjs` submits the prompt directly to Google Flow and currently does not classify policy warning text or retry with a sanitized prompt.

## Prompt Policy Rules To Implement

Hermes should not try to bypass Google policy. It should produce policy-safe prompts:

- Do not include names of celebrities, entertainers, athletes, politicians, public officials, CEOs, founders, journalists, influencers, or other identifiable living public figures in Flow prompts.
- Do not ask Flow to depict a real person, mimic a real person's face/body/voice, or show a person who "looks like" a named person.
- Replace risky real-person references with roles:
  - `Elon Musk` -> `a tech company CEO`
  - `BTS Jungkook` -> `a popular K-pop singer`
  - `Donald Trump` -> `a former US president`
  - `손흥민` -> `a professional football player`
  - `이재용` -> `a large technology company executive`
- Keep factual names in the Korean narration where needed, but do not pass them to Google Flow visual prompts.
- Prefer objects, locations, symbolic B-roll, charts, device close-ups, anonymous crowds, silhouettes, over-the-shoulder shots, hands, newsrooms, court/building exteriors, generic professionals, and UI-like abstract visual metaphors.
- If a real person is central to the story, visualize the context around the person instead of the person: podium without face, empty press room, blurred crowd, phone screen without readable text, symbolic object, city/building, hands signing papers, timeline board without names.
- Avoid generated text inside Flow media. Hermes overlays Korean captions itself later.

---

## File Structure

- Create: `C:\Users\amd\hermes\electron\services\flow-prompt-safety.mjs`
  - Owns Flow prompt sanitization, risk detection, replacement rules, and audit metadata.
- Create: `C:\Users\amd\hermes\scripts\check-flow-prompt-safety.mjs`
  - Static and behavioral regression checks for celebrity/public-figure sanitization.
- Modify: `C:\Users\amd\hermes\electron\services\script-planner.mjs`
  - Run generated `image_prompt` through `sanitizeFlowPrompt()` before returning scenes.
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
  - Sanitize Gemini-provided scene prompts during normalization, preserve `flow_prompt_safety` metadata per scene.
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
  - Add prompt instruction that Flow visual prompts must not include identifiable real public figures.
- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
  - Detect Flow policy warning text, save diagnostics, and retry once with the stricter fallback prompt.
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
  - Emit safety metadata into workflow events before Flow submission.
- Modify: `C:\Users\amd\hermes\package.json`
  - Add `node ./scripts/check-flow-prompt-safety.mjs` to `check`.

---

## Task 1: Flow Prompt Safety Module

**Files:**
- Create: `C:\Users\amd\hermes\electron\services\flow-prompt-safety.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-flow-prompt-safety.mjs`

- [ ] **Step 1: Write the failing safety check**

Create `C:\Users\amd\hermes\scripts\check-flow-prompt-safety.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { sanitizeFlowPrompt, isFlowPolicyWarningText } from "../electron/services/flow-prompt-safety.mjs";

const risky = [
  "9:16 cinematic scene of Elon Musk presenting a new robot on stage.",
  "A realistic video of BTS Jungkook walking through Seoul.",
  "Donald Trump speaking at a podium, close-up face, photorealistic.",
  "손흥민이 경기장에서 골을 넣는 장면.",
].join("\n");

const result = sanitizeFlowPrompt(risky, {
  title: "AI news",
  sceneOrder: 1,
  visualCategory: "news-context",
});

assert.equal(result.changed, true, "known public figure prompts must be changed");
assert.doesNotMatch(result.prompt, /Elon Musk|Jungkook|Donald Trump|손흥민/i);
assert.match(result.prompt, /tech company CEO|K-pop singer|former US president|professional football player/i);
assert.match(result.prompt, /Do not depict any identifiable real public figure/i);
assert.ok(result.flags.includes("PUBLIC_FIGURE_REFERENCE"));

assert.equal(isFlowPolicyWarningText("이 프롬프트는 유명인의 동영상 생성에 관한 Google 정책을 위반할 가능성이 있습니다."), true);
assert.equal(isFlowPolicyWarningText("Flow did not expose a new video URL."), false);

console.log(JSON.stringify({ ok: true, checked: "flow-prompt-safety" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-flow-prompt-safety.mjs
```

Expected: FAIL because `flow-prompt-safety.mjs` does not exist yet.

- [ ] **Step 3: Implement the safety module**

Create `C:\Users\amd\hermes\electron\services\flow-prompt-safety.mjs`:

```js
const PUBLIC_FIGURE_REPLACEMENTS = [
  { pattern: /\bElon Musk\b/gi, replacement: "a tech company CEO" },
  { pattern: /\bDonald Trump\b/gi, replacement: "a former US president" },
  { pattern: /\bJoe Biden\b/gi, replacement: "a US political leader" },
  { pattern: /\bTaylor Swift\b/gi, replacement: "a famous pop singer" },
  { pattern: /\bJungkook\b|\bBTS Jungkook\b|정국/gi, replacement: "a popular K-pop singer" },
  { pattern: /손흥민|Son Heung-min/gi, replacement: "a professional football player" },
  { pattern: /이재용|Lee Jae-yong/gi, replacement: "a large technology company executive" },
];

const GENERIC_LIKENESS_PATTERNS = [
  /\blooks like\b/gi,
  /\bface of\b/gi,
  /\bimpersonating\b/gi,
  /\bdeepfake\b/gi,
  /닮은/gi,
  /얼굴/gi,
  /실사\s*얼굴/gi,
];

const FLOW_POLICY_WARNING_PATTERNS = [
  /유명인의\s*동영상\s*생성/i,
  /google\s*정책을\s*위반/i,
  /celebrity/i,
  /public\s*figure/i,
  /likeness/i,
];

export function isFlowPolicyWarningText(text = "") {
  return FLOW_POLICY_WARNING_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

export function sanitizeFlowPrompt(prompt = "", context = {}) {
  let output = String(prompt || "");
  const flags = [];
  const replacements = [];

  for (const rule of PUBLIC_FIGURE_REPLACEMENTS) {
    output = output.replace(rule.pattern, (match) => {
      flags.push("PUBLIC_FIGURE_REFERENCE");
      replacements.push({ from: match, to: rule.replacement });
      return rule.replacement;
    });
  }

  for (const pattern of GENERIC_LIKENESS_PATTERNS) {
    if (pattern.test(output)) {
      flags.push("LIKENESS_LANGUAGE");
      output = output.replace(pattern, "generic non-identifiable appearance");
    }
  }

  const safetySuffix = [
    "Do not depict any identifiable real public figure, celebrity, politician, athlete, influencer, or named private person.",
    "Use only fictional, anonymous, non-identifiable people or symbolic B-roll.",
    "Avoid faces when the story involves a real person; show objects, locations, silhouettes, hands, crowds, devices, charts, or contextual scenes instead.",
    "No logos, no readable text, no subtitles, no watermarks.",
  ].join(" ");

  const compact = `${output} ${safetySuffix}`.replace(/\s+/g, " ").trim();

  return {
    prompt: compact,
    changed: replacements.length > 0 || flags.length > 0 || compact !== String(prompt || "").trim(),
    flags: Array.from(new Set(flags)),
    replacements,
    context: {
      title: context.title || "",
      sceneOrder: context.sceneOrder || 0,
      visualCategory: context.visualCategory || "",
    },
  };
}

export function buildFlowSafeFallbackPrompt({ title = "", narration = "", visualCategory = "", sceneOrder = 1 } = {}) {
  return sanitizeFlowPrompt([
    "9:16 cinematic YouTube shorts B-roll scene.",
    visualCategory ? `Visual category: ${visualCategory}.` : "",
    `Topic context: ${title}.`,
    `Narration meaning: ${narration}.`,
    "Show symbolic, non-identifiable visuals that explain the story: objects, hands, environments, blurred crowd, newsroom desk, device close-ups, charts without readable text, or location exterior.",
    "Use anonymous fictional people only if needed, filmed from behind or in silhouette.",
    "Dynamic close-up to medium shot, realistic lighting, smooth camera movement.",
  ].filter(Boolean).join(" "), { title, sceneOrder, visualCategory });
}
```

- [ ] **Step 4: Run safety check**

Run:

```powershell
node scripts/check-flow-prompt-safety.mjs
```

Expected: PASS.

---

## Task 2: Sanitize Scene Planner Prompts

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\script-planner.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-visual-storytelling-prompts.mjs`

- [ ] **Step 1: Extend existing visual storytelling check**

Add to `C:\Users\amd\hermes\scripts\check-visual-storytelling-prompts.mjs`:

```js
const publicFigureScenes = planScenesFromScript({
  title: "Elon Musk AI company news",
  script: "Elon Musk가 새 인공지능 회사를 발표했습니다. 투자자들은 기술 경쟁의 변화를 주목하고 있습니다.",
  targetSeconds: 30,
  characterProfile: "same Korean tech reporter in her early 30s, black bob haircut, teal blazer",
});

const publicFigurePrompts = publicFigureScenes.map((scene) => scene.image_prompt).join("\n");
assert.doesNotMatch(publicFigurePrompts, /Elon Musk/i, "Flow prompts must not include famous person names");
assert.match(publicFigurePrompts, /tech company CEO|public figure|anonymous|symbolic/i, "Flow prompts should use generic roles and safe B-roll");
assert.ok(publicFigureScenes.some((scene) => scene.flow_prompt_safety?.changed), "scene should record safety rewrite metadata");
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-visual-storytelling-prompts.mjs
```

Expected: FAIL until planner uses `sanitizeFlowPrompt()`.

- [ ] **Step 3: Import and apply sanitizer**

In `C:\Users\amd\hermes\electron\services\script-planner.mjs`, import:

```js
import { sanitizeFlowPrompt } from "./flow-prompt-safety.mjs";
```

Add helper:

```js
function finalizeFlowPrompt({ prompt, title, order, visualCategory }) {
  const safety = sanitizeFlowPrompt(prompt, { title, sceneOrder: order, visualCategory });
  return {
    image_prompt: safety.prompt,
    flow_prompt_safety: safety,
  };
}
```

When returning scenes from `planScenesFromScript()` and `planScenesFromHpsl()`, replace direct `image_prompt` assignment with:

```js
const visualCategory = visualCategoryForOrder(scene.order);
const prompt = buildVisualStoryPrompt({ title, narration: scene.narration, order: scene.order, visualCategory, characterProfile });
const safe = finalizeFlowPrompt({ prompt, title, order: scene.order, visualCategory });
return {
  order: scene.order,
  visual_category: visualCategory,
  narration: scene.narration,
  duration_seconds: duration,
  ...safe,
};
```

Use the section-based visual category in the HPSL branch.

- [ ] **Step 4: Run visual storytelling check**

Run:

```powershell
node scripts/check-visual-storytelling-prompts.mjs
```

Expected: PASS.

---

## Task 3: Sanitize Gemini Draft Prompts During Normalization

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-youtube-draft-quality.mjs`

- [ ] **Step 1: Add regression to draft quality check**

Append to `C:\Users\amd\hermes\scripts\check-youtube-draft-quality.mjs`:

```js
import { normalizeYouTubeDraft } from "../youtube-workflow.mjs";

const celebrityDraft = normalizeYouTubeDraft({
  title: "Elon Musk robot news",
  structure: "HPSL",
  hpsl: {
    hook: { goal: "Hook", narration: "Elon Musk가 로봇을 공개했습니다.", target_seconds: 7 },
    point: { goal: "Point", narration: "핵심은 기술 경쟁입니다.", target_seconds: 13 },
    story: { goal: "Story", narration: "투자자들은 시장 변화를 봅니다.", target_seconds: 30 },
    lesson: { goal: "Lesson", narration: "과장보다 실제 활용을 봐야 합니다.", target_seconds: 10 },
  },
  script: "Elon Musk가 로봇을 공개했습니다.",
  scenes: [{
    order: 1,
    narration: "Elon Musk가 무대에서 로봇을 발표했습니다.",
    image_prompt: "Photorealistic close-up of Elon Musk presenting a robot on stage.",
    duration_seconds: 8,
  }],
});

assert.doesNotMatch(celebrityDraft.scenes[0].image_prompt, /Elon Musk/i);
assert.match(celebrityDraft.scenes[0].image_prompt, /tech company CEO|anonymous|public figure/i);
assert.ok(celebrityDraft.scenes[0].flow_prompt_safety?.changed);
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-youtube-draft-quality.mjs
```

Expected: FAIL until `normalizeScene()` applies sanitizer.

- [ ] **Step 3: Sanitize normalized scenes**

In `C:\Users\amd\hermes\youtube-workflow.mjs`, import:

```js
import { sanitizeFlowPrompt } from "./electron/services/flow-prompt-safety.mjs";
```

In `normalizeScene(scene, index, title, characterProfile)`, after `withCharacterProfile()`:

```js
const visualCategory = cleanText(scene.visual_category || scene.visualCategory || "");
const rawPrompt = withCharacterProfile(imagePrompt, characterProfile);
const flowPromptSafety = sanitizeFlowPrompt(rawPrompt, {
  title,
  sceneOrder: Number(scene.order || index + 1),
  visualCategory,
});
```

Return:

```js
visual_category: visualCategory,
image_prompt: flowPromptSafety.prompt,
flow_prompt_safety: flowPromptSafety,
```

- [ ] **Step 4: Tighten Gemini instructions**

In `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`, add rules:

```js
"- For Google Flow image_prompt fields, never include names of celebrities, politicians, athletes, influencers, CEOs, founders, journalists, or other identifiable real people.",
"- If the source article names a real person, keep the name only in Korean narration when factually needed, but describe Flow visuals with generic roles such as a tech executive, a politician, an athlete, an anonymous official, or symbolic B-roll.",
"- Do not ask Flow to depict, imitate, or resemble any real person's face, body, likeness, or voice.",
```

- [ ] **Step 5: Run draft quality check**

Run:

```powershell
node scripts/check-youtube-draft-quality.mjs
```

Expected: PASS.

---

## Task 4: Detect Flow Policy Warning And Retry With Safe Fallback

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-flow-policy-warning-retry.mjs`

- [ ] **Step 1: Write static retry check**

Create `C:\Users\amd\hermes\scripts\check-flow-policy-warning-retry.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");

assert.match(flow, /isFlowPolicyWarningText/, "Flow automation should detect policy warning text");
assert.match(flow, /policy-warning/, "Flow automation should persist policy warning diagnostics");
assert.match(flow, /safeFallbackPrompt/, "Flow automation should retry with safe fallback prompt");
assert.match(stages, /flow_prompt_safety/, "workflow should emit prompt safety metadata");

console.log(JSON.stringify({ ok: true, checked: "flow-policy-warning-retry" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-flow-policy-warning-retry.mjs
```

Expected: FAIL until Flow automation is updated.

- [ ] **Step 3: Add optional safe fallback prompt argument**

In `generateGoogleFlowVideoFromPrompt({ ... })`, add parameter:

```js
safeFallbackPrompt,
```

Before throwing after submission failure or no video URL, inspect page text:

```js
const warningState = await collectMediaUrls(page);
if (isFlowPolicyWarningText(warningState.text)) {
  await writeFile(join(jobDir, `scene_${sceneOrder}_policy-warning.json`), JSON.stringify({
    sceneOrder,
    text: warningState.text.slice(0, 2000),
    originalPrompt: prompt,
    safeFallbackPrompt,
    at: new Date().toISOString(),
  }, null, 2), "utf8");
  if (safeFallbackPrompt && safeFallbackPrompt !== prompt) {
    onProgress?.({ message: `장면 ${sceneOrder} Flow 정책 경고 감지: 안전 프롬프트로 1회 재시도합니다.`, details: { sceneOrder, warning: "policy-warning" } });
    prompt = safeFallbackPrompt;
    await submitPromptToFlowAgain(page, prompt);
    await verifyFlowSubmissionStarted(page, jobDir, sceneOrder);
  } else {
    throw new Error(`Google Flow policy warning for scene ${sceneOrder}. Use safer prompt. Screenshot: ${screenshotPath}`);
  }
}
```

If refactoring is needed, extract the existing prompt submission click path into:

```js
async function submitPromptToFlowAgain(page, prompt) {
  const positions = await findPromptAndCreate(page);
  await page.mouse.click(positions.textbox.x, positions.textbox.y);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(prompt);
  await page.mouse.click(positions.create.x, positions.create.y);
}
```

- [ ] **Step 4: Pass fallback from stage**

In `C:\Users\amd\hermes\youtube-workflow-stages.mjs`, import:

```js
import { buildFlowSafeFallbackPrompt } from "./electron/services/flow-prompt-safety.mjs";
```

Before calling `generateGoogleFlowVideoFromPrompt()`, compute:

```js
const fallback = buildFlowSafeFallbackPrompt({
  title: draft?.title || "",
  narration: scene.narration,
  visualCategory: scene.visual_category,
  sceneOrder: scene.order,
});
```

Pass:

```js
safeFallbackPrompt: fallback.prompt,
```

Emit:

```js
context.emit?.({
  type: "workflow-progress",
  jobId: job?.id || context.job?.id || "",
  phase: "flow-prompt-safety",
  message: scene.flow_prompt_safety?.changed
    ? `장면 ${scene.order} Flow 프롬프트를 정책 안전형으로 정리했습니다.`
    : `장면 ${scene.order} Flow 프롬프트 안전 검사를 통과했습니다.`,
  details: { flow_prompt_safety: scene.flow_prompt_safety || fallback },
});
```

- [ ] **Step 5: Run retry check**

Run:

```powershell
node scripts/check-flow-policy-warning-retry.mjs
```

Expected: PASS.

---

## Task 5: UI And Diagnostics

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`
- Modify: `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Extend progress feedback check**

In `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`, add:

```js
assert.match(renderer, /flow-prompt-safety|Flow 프롬프트/, "desktop UI should expose Flow prompt safety progress");
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
```

Expected: FAIL until renderer displays safety phase.

- [ ] **Step 3: Show policy-safe prompt status in UI**

In `C:\Users\amd\hermes\electron\renderer\app.js`, when handling job progress events:

```js
if (event.phase === "flow-prompt-safety") {
  appendConsole("Flow Prompt Safety", {
    message: event.message,
    flags: event.details?.flow_prompt_safety?.flags || [],
    replacements: event.details?.flow_prompt_safety?.replacements || [],
  });
}
```

If the existing renderer uses a different console helper, use the existing function but keep the visible label `Flow Prompt Safety`.

- [ ] **Step 4: Run desktop progress check**

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
```

Expected: PASS.

---

## Task 6: Package Verification

**Files:**
- Modify: `C:\Users\amd\hermes\package.json`
- Modify: `C:\Users\amd\hermes\scripts\check-packaged-runtime-contract.mjs`

- [ ] **Step 1: Add checks to package script**

In `package.json`, add `node ./scripts/check-flow-prompt-safety.mjs` and `node ./scripts/check-flow-policy-warning-retry.mjs` to the `check` script after `check:final-output-qa`.

- [ ] **Step 2: Update packaged contract**

In `scripts/check-packaged-runtime-contract.mjs`, assert packaged app contains:

```js
assert.match(packagedPlanner, /flow-prompt-safety/, "packaged planner should sanitize Flow prompts");
assert.match(packagedFlowAutomation, /isFlowPolicyWarningText/, "packaged Flow automation should detect policy warnings");
```

- [ ] **Step 3: Run all checks**

Run:

```powershell
npm run check
npm run electron:pack
node scripts/check-packaged-runtime-contract.mjs
```

Expected: all PASS. The packaged `app.asar` must include prompt safety code before the user tests again.

---

## Acceptance Criteria

- Flow prompts never include known celebrity/public-figure names from the configured replacement list.
- Flow prompts include a policy-safe instruction to use anonymous fictional people or symbolic B-roll.
- Scene metadata records `flow_prompt_safety.changed`, `flags`, and `replacements`.
- Electron progress tells the user when a prompt was sanitized or retried after a Flow policy warning.
- If Google Flow shows a celebrity/public-figure warning, Hermes saves `scene_N_policy-warning.json` and retries once with a safer fallback prompt.
- `npm run check` includes the new Flow safety checks.
- `node scripts/check-packaged-runtime-contract.mjs` verifies the packaged app, not only source files.

---

## 2026-05-25 Review Addendum: Google Flow Policy Safe Review Validation

### Reviewed Document

Review document: `C:\Users\amd\hermes\HERMES_GOOGLE_FLOW_POLICY_SAFE_REVIEW.md`

The review mostly aligns with the implementation direction. I verified each suggestion against the current codebase before adding it to the plan.

### Accepted Items

1. **Portable test/runtime path handling**
   - The review is correct that executable test code should not depend on `C:\Users\amd\hermes`.
   - Keep exact absolute file paths in this plan for human readability, but implementation snippets in `scripts/check-*.mjs` must resolve the repository root from `import.meta.url` / `import.meta.dirname`.
   - Add package verification that reads the actual packaged `app.asar`, because this previously caught the stale-runtime problem.

2. **Two-layer public-figure defense**
   - Static replacements alone cannot cover every current celebrity, politician, athlete, CEO, or local public figure.
   - Keep deterministic replacements for common names, then add a dynamic extractor for likely person names from `title`, `script`, `narration`, and `character_profile`.
   - Dynamic extraction should not claim to perfectly identify every person. It should conservatively rewrite suspicious proper-name spans in Flow prompts into generic roles when they appear near risky terms like `CEO`, `president`, `singer`, `actor`, `athlete`, `politician`, `founder`, `candidate`, `minister`, `idol`, or Korean equivalents.

3. **SQLite observability**
   - The current code already has `workflow-db-events.mjs`, `task_events`, `task_failures`, and `bot_db_helper.py log-event/log-failure/mark-recovered`.
   - Policy-warning retries should not live only in local `scene_N_policy-warning.json`.
   - The workflow should emit structured `flow-prompt-safety` and `flow-policy-warning` events so existing DB mirroring stores the original prompt hash, sanitized prompt hash, replacement list, warning text excerpt, scene order, retry count, and recovery status.
   - If the safe fallback succeeds after a policy warning, emit a recovery event instead of leaving the run diagnosable only as a failure.

4. **Retry deadline extension**
   - `automation/google-flow-media.mjs` currently computes one fixed `deadline = Date.now() + timeoutMs`.
   - If a policy warning is detected after several minutes, retrying with the fallback prompt inside the same old deadline can cause a false timeout.
   - The retry branch should reset or extend the deadline once, bounded by `timeoutMs`, and emit the new remaining time.

### Partially Accepted Items

1. **Browser profile/session lock collision**
   - The review's concern is valid generally, but current code already separates `flowProfileDir` and `geminiProfileDir` in `electron/services/path-resolver.mjs`.
   - Keep the existing separation. Add diagnostics for profile lock cleanup failures and active profile PID, but do not redesign profile paths in this plan.

2. **Marking `task_failures` recovered**
   - `bot_db_helper.py mark-recovered` exists, but desktop jobs use `chatId = "desktop"` and `messageId = "0"` unless caller context supplies richer identifiers.
   - For now, emit `workflow-progress`/`workflow-warning` events with `details.recovered = true/false`. A later DB-specific task can call `mark-recovered` only when a matching failure row key is reliable.

### Deferred Items

- Do not add a large external celebrity database in this iteration. It would create maintenance and false-positive problems. Use deterministic replacements plus conservative dynamic extraction first.
- Do not merge Gemini and Flow browser profiles. The current separated profile design is safer.

---

## Task 7: Portable Flow Safety Check Paths

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\check-flow-prompt-safety.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-policy-warning-retry.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-packaged-runtime-contract.mjs`

- [ ] **Step 1: Add portability assertions**

In both new check scripts, compute root from the script location:

```js
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
```

Do not use `C:/Users/amd/hermes` in executable check code.

- [ ] **Step 2: Extend packaged runtime contract**

In `C:\Users\amd\hermes\scripts\check-packaged-runtime-contract.mjs`, assert the packaged `app.asar` contains the Flow safety code:

```js
const packagedPlanner = asar.extractFile(unpacked, "electron/services/script-planner.mjs").toString("utf8");
const packagedFlowAutomation = asar.extractFile(unpacked, "automation/google-flow-media.mjs").toString("utf8");
const packagedSafety = asar.extractFile(unpacked, "electron/services/flow-prompt-safety.mjs").toString("utf8");

assert.match(packagedPlanner, /flow-prompt-safety/, "packaged planner should sanitize Flow prompts");
assert.match(packagedFlowAutomation, /isFlowPolicyWarningText/, "packaged Flow automation should detect policy warnings");
assert.match(packagedSafety, /sanitizeFlowPrompt/, "packaged app should include Flow prompt safety module");
```

- [ ] **Step 3: Run path checks**

Run:

```powershell
node scripts/check-flow-prompt-safety.mjs
node scripts/check-flow-policy-warning-retry.mjs
node scripts/check-packaged-runtime-contract.mjs
```

Expected: PASS without relying on a user-specific repository path.

---

## Task 8: Dynamic Public Figure Candidate Extraction

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\flow-prompt-safety.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-prompt-safety.mjs`

- [ ] **Step 1: Add failing dynamic extraction assertions**

Extend `C:\Users\amd\hermes\scripts\check-flow-prompt-safety.mjs`:

```js
const dynamic = sanitizeFlowPrompt(
  "9:16 cinematic scene of Sam Altman walking into a conference hall while reporters gather.",
  {
    title: "OpenAI CEO Sam Altman news",
    sceneOrder: 2,
    visualCategory: "news-context",
  },
);

assert.doesNotMatch(dynamic.prompt, /Sam Altman/i);
assert.match(dynamic.prompt, /tech executive|anonymous|symbolic|public figure/i);
assert.ok(dynamic.flags.includes("DYNAMIC_PUBLIC_FIGURE_CANDIDATE"));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-flow-prompt-safety.mjs
```

Expected: FAIL until dynamic extraction is implemented.

- [ ] **Step 3: Implement conservative dynamic replacement**

In `C:\Users\amd\hermes\electron\services\flow-prompt-safety.mjs`, add:

```js
const ROLE_HINTS = [
  "ceo", "founder", "president", "minister", "candidate", "politician", "actor", "singer",
  "athlete", "football player", "influencer", "journalist", "executive", "idol",
  "대표", "회장", "대통령", "장관", "후보", "정치인", "배우", "가수", "선수", "기자",
];

function inferGenericRole(text = "") {
  const lower = String(text || "").toLowerCase();
  if (/ceo|founder|executive|대표|회장/.test(lower)) return "a technology company executive";
  if (/president|minister|candidate|politician|대통령|장관|후보|정치인/.test(lower)) return "a public official";
  if (/singer|actor|idol|가수|배우|아이돌/.test(lower)) return "an entertainment industry figure";
  if (/athlete|football player|선수/.test(lower)) return "a professional athlete";
  if (/journalist|기자/.test(lower)) return "a journalist";
  return "a public figure";
}

function dynamicPublicFigureCandidates(contextText = "") {
  const text = String(contextText || "");
  const candidates = new Set();
  const latinNames = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) || [];
  for (const name of latinNames) {
    const windowText = text.slice(Math.max(0, text.indexOf(name) - 80), text.indexOf(name) + name.length + 80);
    if (ROLE_HINTS.some((hint) => windowText.toLowerCase().includes(hint))) candidates.add(name);
  }
  return Array.from(candidates);
}
```

Inside `sanitizeFlowPrompt()`:

```js
const contextText = [context.title, context.script, context.narration, output].filter(Boolean).join(" ");
for (const name of dynamicPublicFigureCandidates(contextText)) {
  const role = inferGenericRole(contextText);
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  output = output.replace(re, () => {
    flags.push("DYNAMIC_PUBLIC_FIGURE_CANDIDATE");
    replacements.push({ from: name, to: role });
    return role;
  });
}
```

Add:

```js
function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run safety check**

Run:

```powershell
node scripts/check-flow-prompt-safety.mjs
```

Expected: PASS.

---

## Task 9: Policy Warning Observability And Recovery Events

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-policy-warning-retry.mjs`

- [ ] **Step 1: Extend retry check for observability**

Add to `C:\Users\amd\hermes\scripts\check-flow-policy-warning-retry.mjs`:

```js
assert.match(flow, /flow-policy-warning/, "Flow automation should emit policy warning event details");
assert.match(flow + stages, /recovered/, "Flow policy retry should expose recovery status");
assert.match(flow + stages, /originalPromptHash|sanitizedPromptHash/, "policy events should use prompt hashes for diagnostics");
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-flow-policy-warning-retry.mjs
```

Expected: FAIL until event details include recovery metadata.

- [ ] **Step 3: Add prompt hashing helper**

In `C:\Users\amd\hermes\automation\google-flow-media.mjs`, import:

```js
import { createHash } from "node:crypto";
```

Add:

```js
function promptHash(prompt = "") {
  return createHash("sha256").update(String(prompt || ""), "utf8").digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: Emit policy warning and recovery details**

When policy warning text is detected, call `onProgress` with:

```js
onProgress?.({
  message: `장면 ${sceneOrder} Flow 정책 경고 감지: 안전 프롬프트로 재시도합니다.`,
  details: {
    eventType: "flow-policy-warning",
    warning: "policy-warning",
    sceneOrder,
    warningText: warningState.text.slice(0, 1000),
    originalPromptHash: promptHash(prompt),
    sanitizedPromptHash: promptHash(safeFallbackPrompt),
    retryCount: 1,
    recovered: false,
  },
});
```

After fallback generation starts successfully, emit:

```js
onProgress?.({
  message: `장면 ${sceneOrder} Flow 정책 경고를 안전 프롬프트로 복구했습니다.`,
  details: {
    eventType: "flow-policy-warning",
    warning: "policy-warning",
    sceneOrder,
    retryCount: 1,
    recovered: true,
  },
});
```

- [ ] **Step 5: Mirror through workflow events**

In `C:\Users\amd\hermes\youtube-workflow-stages.mjs`, keep forwarding `onFlowProgress` details through existing progress events. Ensure no raw full prompt is emitted to the UI/DB. Use hashes and replacement metadata instead.

- [ ] **Step 6: Run retry check**

Run:

```powershell
node scripts/check-flow-policy-warning-retry.mjs
```

Expected: PASS.

---

## Task 10: Retry Deadline Extension

**Files:**
- Modify: `C:\Users\amd\hermes\automation\google-flow-media.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-policy-warning-retry.mjs`

- [ ] **Step 1: Add static deadline check**

Add to `C:\Users\amd\hermes\scripts\check-flow-policy-warning-retry.mjs`:

```js
assert.match(flow, /extendFlowDeadlineForPolicyRetry/, "Flow policy retry should extend generation deadline once");
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-flow-policy-warning-retry.mjs
```

Expected: FAIL until retry deadline extension exists.

- [ ] **Step 3: Implement bounded deadline extension**

In `C:\Users\amd\hermes\automation\google-flow-media.mjs`, replace immutable deadline with:

```js
let deadline = Date.now() + timeoutMs;
let policyRetryUsed = false;
```

Add:

```js
function extendFlowDeadlineForPolicyRetry({ timeoutMs }) {
  const extensionMs = Math.max(5 * 60 * 1000, Number(timeoutMs || 0));
  return Date.now() + extensionMs;
}
```

When fallback retry starts:

```js
if (!policyRetryUsed) {
  policyRetryUsed = true;
  deadline = extendFlowDeadlineForPolicyRetry({ timeoutMs });
}
```

- [ ] **Step 4: Run retry check**

Run:

```powershell
node scripts/check-flow-policy-warning-retry.mjs
```

Expected: PASS.

---

## Updated Acceptance Criteria From Review

- New check scripts resolve repo root dynamically and executable code does not hardcode `C:\Users\amd\hermes`.
- Flow safety uses deterministic replacements plus conservative dynamic public-figure candidate extraction.
- Policy warnings are written to local JSON and also emitted as structured workflow events with prompt hashes, warning excerpt, scene order, retry count, and recovery status.
- A successful safe fallback emits `recovered: true` so DB/event diagnostics can distinguish recovered policy warnings from terminal failures.
- Policy retry extends the generation deadline once so a late warning does not cause an immediate false timeout.
- Existing `flowProfileDir` and `geminiProfileDir` separation is preserved.
