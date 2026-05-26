# Final Output QA, Script Quality, and Freeze Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:systematic-debugging` before editing and `superpowers:test-driven-development` for each fix. This plan is based on the actual final output in `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583`.

**Goal:** 최종 산출물이 사용자가 바로 올릴 수 있는 수준인지 자동 검수하고, 대본 반복, 영상 멈춤, 장면 맥락 부족, Flow 프롬프트 품질 저하를 렌더 전후 단계에서 막는다.

**Inspected Final Output:**
- Final video: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583\desktop-flow-recovered-node-render-1779693399583.mp4`
- Render report: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583\render-report-v2.json`
- Draft: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583\draft.json`
- Subtitles: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583\subtitles-ko-v2.srt`
- Contact sheet: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583\qa-contact-sheet.jpg`
- Freeze log: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583\qa-scene5-freezedetect.log`

---

## Actual QA Findings

### 1. 영상 멈춤은 실제로 발생한다

`render-report-v2.json` 기준 최종 영상은 67.04초이고 자막 종료는 66.98초라 전체 길이 싱크는 맞는다. 그러나 장면별 영상과 음성 길이 싱크 방식이 문제다.

| Scene | Flow video | TTS audio | Ratio | Strategy | Extra held frame |
| --- | ---: | ---: | ---: | --- | ---: |
| 1 | 8.00s | 6.55s | 0.82 | trim | 0.00s |
| 2 | 8.00s | 10.17s | 1.27 | tpad | 2.17s |
| 3 | 8.00s | 12.05s | 1.51 | tpad | 4.05s |
| 4 | 8.00s | 5.29s | 0.66 | trim | 0.00s |
| 5 | 8.00s | 32.92s | 4.12 | tpad | 24.92s |

Scene 5는 8초 영상에 32.92초 음성을 붙이면서 약 24.92초 동안 마지막 프레임을 잡아둔다. `freezedetect`도 `scene_5_synced.mp4`에서 7.96초 이후 정지 구간을 감지했다. 사용자가 말한 “중간에 영상이 멈춘 것 같다”는 체감이 맞다.

### 2. 대본과 장면 분배가 깨져서 마지막 장면이 전체 대본을 반복한다

`draft.json`의 전체 대본은 약 230자다. 장면 1-4는 문장별로 나뉘었지만 장면 5가 전체 대본을 그대로 다시 담고 있다.

문제 장면:

```text
Scene 5 narration:
안녕하세요! 오늘은 앤스로픽 미토스에 대한 긴급한 소식을 전해드릴게요. 유럽 중앙은행, 즉 ECB가 은행들을 긴급 소집했습니다. ... 우리 모두 주목해야 할 것 같습니다!
```

그래서 자막도 34초 이후부터 이미 나온 내용을 다시 반복한다. 이 문제는 렌더 문제가 아니라 `planScenesFromScript()` 계열의 장면 할당 또는 fallback draft 생성 단계에서 생긴 데이터 품질 오류다. 렌더는 잘못된 입력을 그대로 영상화했다.

### 3. Gemini 응답은 실제 기사 분석이 아니라 스키마 예시였다

`gemini-response.txt` 내용은 실제 기획 결과가 아니라 다음과 같은 placeholder JSON이다.

```json
{"title":"string","character_profile":"English stable character profile or empty string","duration_seconds":90,"script":"Korean narration",...}
```

이 응답은 반드시 실패로 처리되어야 한다. 현재는 fallback 경로로 넘어가며 영상은 만들지만, fallback이 기사 사실관계와 장면 품질을 충분히 보강하지 못해 최종물이 낮은 품질로 완성된다.

### 4. 대본 퀄리티가 부족하다

현재 대본은 “앤스로픽 미토스 대응 서둘러야”라는 제목과 ECB 긴급 소집이라는 소재를 다루지만, 다음이 부족하다.

- 첫 3초 훅이 약하다. 왜 지금 봐야 하는지 즉시 드러나지 않는다.
- 기사 핵심 사실의 출처 맥락이 부족하다.
- “앤스로픽 미토스”가 무엇인지 설명하지 않아 일반 시청자가 이해하기 어렵다.
- 같은 내용이 마지막에 반복되어 완성도가 크게 떨어진다.
- 쇼츠용 리듬이 아니라 설명문에 가깝다.

대본 생성 단계에서 `hook -> 핵심 사실 -> 왜 중요한가 -> 시청자에게 쉬운 비유 -> 결론` 구조를 강제해야 한다.

### 5. 영상 프롬프트가 너무 추상적이고, Flow 결과도 의도와 어긋난다

프롬프트에는 `Main subject: the core object or situation from the narration` 같은 일반 문구가 남아 있다. 그 결과 Flow가 구체적인 B-roll 대신 남성 presenter가 화면에 나와 설명하는 장면을 많이 만들었다.

Contact sheet 확인 결과:

- 사람이 카메라 앞에서 말하는 듯한 장면이 반복된다.
- 화면 안에 영어 텍스트, UI 텍스트, 워터마크성 요소가 보인다.
- 금융 시스템, ECB, 은행 소집, AI 리스크라는 핵심을 시각적으로 쉽게 설명하지 못한다.
- 장면별 시각 언어가 비슷해 영상이 단조롭다.

“그냥 사람이 나와서 대본 읽는 영상”을 피하려면 프롬프트 생성기가 분야별 visual grammar를 가져야 한다. 예를 들어 이번 소재는 중앙은행 회의실, 은행 네트워크, 리스크 경보 대시보드, AI 모델 영향도 지도, 금융 방화벽 같은 구체적 장면으로 풀어야 한다.

### 6. 현재 렌더 스크립트는 긴 정지 화면을 정상 결과로 통과시킨다

`C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs` 기준으로 `audioDuration > videoDuration`이면 `tpad=stop_mode=clone`을 사용한다. Scene 5처럼 ratio가 4.12여도 실패하지 않는다. 이 정책은 쇼츠 품질 기준에 맞지 않는다.

---

## Fix Strategy

## Review Validation Update

`C:\Users\amd\hermes\HERMES_QA_AND_FREEZE_FIX_REVIEW.md`의 제안 중 실제 코드 구조와 맞는 항목만 반영한다.

### Accepted Review Items

- The render subprocess must not call Google Flow or Playwright again. `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs` runs as a separate Node subprocess after Flow scene generation has already completed, so it should only render, validate, and return structured failure data. Scene splitting and new Flow media generation belong in `C:\Users\amd\hermes\youtube-workflow-stages.mjs` or `C:\Users\amd\hermes\youtube-job-runner.mjs`.
- Draft QA must be a runtime workflow gate, not only an `npm run check` static assertion. `check-youtube-draft-quality.mjs` should export a reusable `validateDraftQuality()` function and the workflow should call it immediately after Gemini draft generation, after OpenRouter fallback generation, and after sentence-proportional scene planning.
- Render QA should return structured JSON fields such as `qualityWarnings`, `freezeRisk`, `requiresRegeneration`, `failedSceneOrder`, and `failureCode`, then exit non-zero when regeneration is required. The orchestrator should catch this and decide whether to split a scene, regenerate media, or stop with a useful UI message.
- A small amount of audio/video mismatch should not always fail the entire pipeline. For Flow's common 8s clips, `1.10 < ratio <= 1.30` can use controlled slowdown, ping-pong loop, or short cutaway reuse. Hard failure should apply when clone-hold would become visible, for example `ratio > 1.30`, `audioDuration - videoDuration > 2.0s`, or freeze detection finds a freeze longer than 2s.
- QA failures and warnings should be mirrored into SQLite through `C:\Users\amd\hermes\workflow-db-events.mjs` and `bot_db_helper.py log-failure`, because `task_failures` and Telegram `/diagnose` already exist. The logged payload must include the scene order, ratio, extra hold seconds, duplicate-script similarity, and suggested recovery.

### Rejected Or Deferred Review Items

- Do not implement direct Flow regeneration inside `render-youtube-with-tts.mjs`. That process has no authenticated browser context ownership and should not become a browser automation orchestrator.
- Do not write QA only as static test scripts. Static scripts are still useful for CI and regression checks, but they cannot protect real user jobs unless the same validator is called during the runtime workflow.
- Do not store every non-fatal warning as a `task_failures` row. Warnings should be logged as workflow events; only blocked renders, failed regeneration, or user-visible final QA failures should be mirrored to `task_failures`.

### Phase 1: 입력 데이터 QA 게이트

- [ ] `scripts/check-youtube-draft-quality.mjs`를 추가한다.
- [ ] The file must export `validateDraftQuality({ draft, job, stage })` so runtime code can import it; CLI mode should call the same function for local diagnosis.
- [ ] Call `validateDraftQuality()` inside `C:\Users\amd\hermes\youtube-workflow-stages.mjs` immediately after `buildGeminiResearchDraft()`.
- [ ] If Gemini fails draft QA, emit a structured `workflow-warning` and try OpenRouter fallback once.
- [ ] Call `validateDraftQuality()` again after OpenRouter fallback. If fallback also fails, stop the job before Flow generation starts.
- [ ] Call `validateDraftQuality()` one more time after `planScenesFromScript()` because the duplicated full-script scene can be introduced during scene proportional planning, even if the original draft was acceptable.
- [ ] `draft.json`에서 scene narration이 전체 script와 80% 이상 유사하면 실패시킨다.
- [ ] 인접 장면 간 narration 유사도가 높거나 동일 문장이 반복되면 실패시킨다.
- [ ] scene narration이 Flow 8초 영상 기준 80자 이상이면 split 필요 상태로 표시한다.
- [ ] Gemini 응답에 `title: "string"`, `script: "Korean narration"`, `main_subject: "topic-specific object/person/place"` 같은 placeholder가 있으면 fallback이 아니라 재요청 또는 명시 실패로 처리한다.
- [ ] `npm run check`에 draft QA 검사를 연결한다.

### Phase 2: 장면 분배 로직 수정

- [ ] `C:\Users\amd\hermes\electron\services\script-planner.mjs`의 `planScenesFromScript()`를 수정한다.
- [ ] 문장 수보다 많은 scene을 만들 때 전체 script를 fallback narration으로 넣지 않는다.
- [ ] 긴 문장은 쉼표, 접속어, 의미 단위로 split한다.
- [ ] 한 scene의 목표 음성 길이는 5-8초, 최대 10초로 제한한다.
- [ ] 60초 영상이면 scene 수를 고정하지 않고 실제 문장/음절/TTS 예상 길이 기준으로 7-10개까지 늘린다.
- [ ] scene duration 합계를 맞추려고 마지막 장면에 남은 시간을 몰아주지 않는다. 부족한 시간은 별도 recap scene 또는 B-roll bridge scene으로 만든다.

### Phase 3: 렌더 정책 수정

- [ ] `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`에서 `tpad` 허용치를 제한한다.
- [ ] Keep render subprocess responsibilities narrow: it may slow, trim, loop, validate, and report; it must not call Google Flow, Playwright, Gemini, ChatGPT, or any browser automation.
- [ ] Use this ratio policy:
  - `0.85 <= ratio <= 1.20`: use `setpts`/trim as the normal path.
  - `1.20 < ratio <= 1.30` and `audioDuration - videoDuration <= 2.0s`: use controlled slowdown or a short ping-pong loop, add a non-fatal `qualityWarnings` entry, and avoid `tpad=clone`.
  - `ratio > 1.30` or `audioDuration - videoDuration > 2.0s`: fail render QA with `requiresRegeneration: true` and the specific `sceneOrder`.
  - Any `freezedetect` result over 2.0s: fail final QA even if the duration ratio looked acceptable.
- [ ] When render QA fails, output JSON with `ok:false`, `failureCode:"SCENE_DURATION_MISMATCH"` or `failureCode:"FREEZE_DETECTED"`, `failedSceneOrder`, `ratio`, `extraHoldSeconds`, and `requiresRegeneration:true`, then exit non-zero.
- [ ] The upper workflow, not the render script, should respond to `requiresRegeneration:true` by choosing one recovery:
  - split the narration into two or more scenes and generate additional Flow clips.
  - generate a related support B-roll clip for the same narration.
  - reuse a safe cutaway from a related scene only if no visible repeated freeze is introduced.
- [ ] `ratio > 1.30`이면 최종 렌더를 실패 처리하고 UI에 “장면 재생성 필요”를 표시한다.
- [ ] `render-report-v2.json`에 `qualityWarnings`, `freezeRisk`, `requiresRegeneration` 필드를 추가한다.
- [ ] `ffmpeg freezedetect`를 post-render QA로 실행하고 2초 이상 freeze가 있으면 실패 처리한다.

### Phase 3.5: Orchestrator Recovery and DB Logging

- [ ] Modify `C:\Users\amd\hermes\youtube-workflow-stages.mjs` or `C:\Users\amd\hermes\youtube-job-runner.mjs` to catch structured render QA failures.
- [ ] On `SCENE_DURATION_MISMATCH`, inspect `failedSceneOrder` and split only that scene's narration; do not regenerate all completed scenes unless the scene split changes global continuity.
- [ ] Emit `workflow-warning` before retry with details `{ failureCode, failedSceneOrder, ratio, extraHoldSeconds, retryAction }`.
- [ ] Allow at most one automatic scene-duration recovery retry per job to avoid an infinite Flow regeneration loop.
- [ ] If retry fails, emit a failed progress event with the same structured details so the UI can show the concrete scene and reason.
- [ ] Extend `C:\Users\amd\hermes\workflow-db-events.mjs` so final QA failures call `bot_db_helper.py log-failure` with structured JSON that includes `qualityWarnings`, `freezeRisk`, `requiresRegeneration`, `failedSceneOrder`, and `suggestedRecovery`.
- [ ] Keep non-blocking warnings as `log-event` rows. Mirror to `task_failures` only when the job is blocked, final render is rejected, or regeneration fails.

### Phase 4: 대본 품질 개선

- [ ] URL 입력 시 기사 본문 추출 결과를 `source-summary.json`으로 저장한다.
- [ ] Gemini/OpenRouter 프롬프트를 `hook`, `context`, `why_it_matters`, `easy_metaphor`, `closing` 구조로 강제한다.
- [ ] “용어 설명 1문장”을 필수로 넣어 초보자가 소재를 이해하게 한다.
- [ ] 기사 각색 시 원문 사실과 추론을 분리한다.
- [ ] 중복 문장, 빈 수식어, 일반론 문장을 제거하는 `reviseScriptForShorts()` 단계를 추가한다.
- [ ] 최종 대본에는 “전체 반복 recap”을 금지한다. recap은 1문장 이하만 허용한다.

### Phase 5: 영상 프롬프트 품질 개선

- [ ] `inferVisualKeywords()`의 깨진 mojibake 정규식과 일반 fallback을 정리한다.
- [ ] topic classifier를 추가한다: AI, 금융, 중앙은행, 규제, 제품, 의료, 정치, 과학, 소비자 기술.
- [ ] 금융/중앙은행/AI 리스크 소재용 visual grammar를 추가한다.
- [ ] 각 scene prompt에 다음 필드를 반드시 넣는다.
  - `visual_intent`: 시청자가 이해해야 할 한 줄 의미
  - `main_subject`: 구체적 피사체
  - `action`: 화면에서 실제로 벌어지는 행동
  - `setting`: 장소
  - `camera_motion`: 촬영 방식
  - `avoid`: 말하는 presenter, 읽을 수 있는 글자, 로고, 워터마크
- [ ] “consistent presenter” 모드라도 presenter가 설명만 하는 화면을 기본값으로 만들지 않는다. presenter는 손, 뒷모습, 실사용 장면, 리액션 컷 정도로 제한한다.
- [ ] Flow 결과 프레임 샘플을 OCR/이미지 QA로 검사해 읽을 수 있는 텍스트가 과도하면 재생성 대상으로 표시한다.

### Phase 6: UI와 운영 피드백

- [ ] Electron Progress 패널에 “대본 QA”, “장면 길이 QA”, “Freeze QA”, “프롬프트 QA” 단계를 추가한다.
- [ ] 실패 시 “최종 렌더 실패”가 아니라 구체적인 원인을 보여준다.
  - 예: “5번 장면 음성이 영상보다 24.9초 길어 정지 화면이 발생했습니다. 장면을 4개로 분할해 재생성합니다.”
- [ ] 최종 산출물 옆에 QA 요약을 표시한다.
- [ ] 사용자가 볼 수 있는 `Open Output Folder`, `Open QA Contact Sheet`, `Regenerate Failed Scenes` 버튼을 추가한다.

---

## Tests and Verification

- [ ] Add `scripts/check-scene-planner-no-duplicate-script.mjs`.
  - 4문장 60초 입력에서 마지막 scene이 전체 script를 반복하지 않는지 확인한다.
- [ ] Add `scripts/check-render-no-long-tpad.mjs`.
  - 8초 영상과 30초 음성 조합이 성공으로 통과하지 않는지 확인한다.
- [ ] Add `scripts/check-render-soft-ratio-policy.mjs`.
  - 8초 영상과 9.8초 음성은 slowdown/loop warning path로 통과하고, `tpad=clone`을 사용하지 않는지 확인한다.
  - 8초 영상과 11초 이상 음성은 `requiresRegeneration:true`로 실패하는지 확인한다.
- [ ] Add `scripts/check-youtube-draft-quality.mjs`.
  - placeholder Gemini response, repeated full-script scene, overly long scene narration을 실패 처리한다.
- [ ] Add `scripts/check-runtime-draft-qa-gate.mjs`.
  - `youtube-workflow-stages.mjs`가 Gemini draft, fallback draft, scene-planned draft에 모두 `validateDraftQuality()`를 호출하는지 확인한다.
- [ ] Add `scripts/check-render-qa-db-logging.mjs`.
  - final QA failure details are passed through `workflow-db-events.mjs` to `log-failure`, while non-blocking warnings remain event logs.
- [ ] Add `scripts/check-visual-prompt-specificity.mjs`.
  - `the core object or situation` 같은 generic placeholder가 최종 prompt에 남지 않는지 확인한다.
- [ ] Run exact job folder QA:
  - `node scripts/check-youtube-draft-quality.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779693399583`
  - Expected: current output fails because scene 5 repeats full script and tpad risk is severe.
- [ ] Generate one new URL-based final video after fixes.
  - Expected: no scene ratio above 1.20, no freeze above 2s, no repeated script block, subtitles remain lower-third and readable.

---

## Acceptance Criteria

- 최종 영상에서 2초 이상 정지 화면이 없어야 한다.
- 어떤 scene도 전체 script를 반복 narration으로 가져서는 안 된다.
- `audioDuration / videoDuration`은 일반적으로 0.85-1.20 범위여야 하며, 1.20-1.30 구간은 slowdown/loop warning으로만 제한적으로 허용한다.
- 1.30을 넘거나 영상보다 음성이 2초 이상 긴 scene은 자동 split 또는 재생성되어야 한다.
- 렌더 서브프로세스는 Flow/브라우저 자동화를 직접 실행하지 않고, 구조화된 QA 실패 결과만 상위 workflow에 전달해야 한다.
- Gemini/OpenRouter/scene planning 결과는 런타임 QA 게이트를 통과해야만 Flow 생성 단계로 넘어갈 수 있다.
- 최종 QA 실패는 `/diagnose`에서 추적할 수 있도록 `task_failures`에 구조화된 JSON으로 남아야 한다.
- Gemini placeholder 응답은 정상 draft로 인정하지 않는다.
- 대본은 기사 핵심을 훅, 설명, 영향, 결론 구조로 전달해야 한다.
- Flow prompt는 대본 문장 맥락과 핵심 키워드를 구체적 시각 장면으로 변환해야 한다.
- 최종 산출물 생성 후 QA 리포트와 contact sheet가 자동 생성되어야 한다.
