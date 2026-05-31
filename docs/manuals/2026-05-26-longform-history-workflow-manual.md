# Hermes Studio 10 Minute History Workflow Manual

Date: 2026-05-26 KST

## Test Topic

- Topic: 1814 London Beer Flood
- Korean title used in Studio: `1814년 런던 맥주 홍수`
- Format: long direct-script smoke run
- Goal: verify that Hermes Studio can submit a 10 minute plus video job through the app UI workflow and render a final video.

## Research Notes

For this run, the historical topic was selected as a stable and visually interesting fact. The script was written as an original Korean explanation rather than copied from an article.

Reference sources used for grounding:

- History.com: London Beer Flood background and casualty context.
- Smithsonian Magazine / historical summaries: industrial-era brewery and urban safety context.

NotebookLM MCP was selected in the UI to match the planned research-provider workflow, but direct script mode currently bypasses provider research. For keyword/URL longform, NotebookLM should run before Gemini Gems/Gemini and produce `research_brief.json`. In this run, the local direct script was the canonical input.

## UI Workflow Performed

Automation script:

`C:\Users\amd\hermes\scripts\run-longform-history-ui-workflow.mjs`

The script launched Hermes Studio with Playwright Electron and followed the same UI path a user would use:

1. Open Hermes Studio.
2. Select `Script` input mode.
3. Insert the Korean narration script for `1814년 런던 맥주 홍수`.
4. Set script length mode to `custom`.
5. Set target duration to `600` seconds.
6. Select research provider `NotebookLM MCP`.
7. Select `Hybrid` Google Flow mode.
8. Set opening video scenes to `10`.
9. Select subtitle style `Clean News`.
10. Set speech speed to `0.9`.
11. Enable `Mock Media Mode` for a local 10 minute render smoke test.
12. Click `Generate Final Video`.

## Result

- Job directory: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779804102903`
- Final video: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779804102903\desktop-mock-1779804103124.mp4`
- Final duration: `681.74` seconds
- Subtitle end: `681.66` seconds
- Scene count: `18`
- Opening video scenes: `10`
- Remaining image-mode scenes rendered as video clips: `8`
- Final QA: passed after longform QA policy adjustment
- Freeze risk: `low`

## Important Limitations

This was a UI/job/render workflow verification run using local mock media. It did not spend Google Flow quota and did not generate real Flow assets.

Live Google Flow longform generation still needs a dedicated chapter pipeline before it should be used for production:

- First 10 scenes should become short Flow video hooks.
- Body scenes should use Flow image generation and local motion rendering.
- The media planner should decouple narration/TTS segments from visual assets.
- NotebookLM MCP should be wired as a live keyword/URL research provider with strict timeout and Gemini fallback.

## QA Commands

```powershell
node scripts/run-longform-history-ui-workflow.mjs
node scripts/analyze-youtube-output.mjs "C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779804102903"
node scripts/check-longform-ui-workflow-guards.mjs
node scripts/check-render-soft-ratio-policy.mjs
```

