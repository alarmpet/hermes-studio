import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createYouTubeJob } from "../electron/services/youtube-job-service.mjs";
import { findChromeExecutable } from "../electron/services/browser-profile-service.mjs";

const root = "C:/Users/amd/hermes";
const jobRoot = "C:/Users/amd/AppData/Roaming/hermes/outputs/desktop";
const flowProfileDir = "C:/Users/amd/AppData/Roaming/hermes/browser-profiles/flow-profile";

console.log("Starting live Stickman Explainer generation test...");

const result = await createYouTubeJob({
  sourceType: "script",
  sourceValue: [
    "스틱맨 설명 테스트.",
    "인공지능 에이전트는 큰 작업을 작게 쪼개어 단계별로 실행합니다.",
    "첫 번째 단계는 사용자 요구사항을 명확히 이해하는 연구입니다.",
    "두 번째 단계는 구체적인 실행 계획을 작성하는 설계 단계입니다.",
    "세 번째 단계는 코드를 직접 작성하고 기능을 추가하는 개발입니다.",
    "마지막 단계는 실행 결과를 꼼꼼히 확인하고 검증하는 완료 단계입니다.",
  ].join(" "),
  scriptLengthMode: "custom",
  customDurationSeconds: 20,
  voiceId: "male_30_announcer",
  subtitleStyleId: "bold-shorts",
  titleOverlayMode: "auto",
  titleOverlayText: "",
  stylePresetId: "stickman-explainer",
  flowOutputMode: "image",
  mockMediaMode: false,
}, {
  outputDir: jobRoot,
  ffmpegBin: ffmpegPath,
  chromePath: findChromeExecutable(),
  emit: (event) => {
    if (event.phase) {
      console.log(`[Progress] Phase: ${event.phase}, Message: ${event.message}`);
      if (event.details?.sceneOutputModes) {
        console.log("Scene output modes:", event.details.sceneOutputModes);
      }
    } else {
      console.log("[Event]", event.type, event.message || "");
    }
  },
  paths: {
    appRoot: root,
    runtimeRoot: root,
    outputDir: jobRoot,
    flowProfileDir,
    geminiProfileDir: "C:/Users/amd/AppData/Roaming/hermes/browser-profiles/gemini-profile",
    renderScriptPath: join(root, "scripts/render-youtube-with-tts.mjs"),
  },
  allowOpenRouterFallback: false,
});

console.log("Job execution completed.");
console.log("Result:", JSON.stringify(result, null, 2));

const jobDir = result.assets.jobDir;
const scene1FlowPath = join(jobDir, "scene_1_flow.jpg");
if (existsSync(scene1FlowPath)) {
  console.log(`SUCCESS: Generated stickman image at ${scene1FlowPath}`);
} else {
  console.log(`FAILURE: Generated image not found at ${scene1FlowPath}`);
}
