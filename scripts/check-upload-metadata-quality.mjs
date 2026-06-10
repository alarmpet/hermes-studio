#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildDefaultUploadMetadata, validateUploadMetadata } from "../electron/services/youtube-upload-metadata.mjs";

const metadata = buildDefaultUploadMetadata(
  {
    id: "youtube-history",
    sourceValue: [
      "우리는 이렇게 배웠죠. 1492년 콜럼버스가 지구가 둥글다는 것을 증명했다고요.",
      "하지만 진짜 핵심은 지구 모양이 아니라 거리 계산 착오와 항해 리스크였습니다.",
    ].join(" "),
    finalPath: "C:/video.mp4",
    upload: { privacyStatus: "private" },
  },
  {
    draft: {
      title: "우리는 이렇게 배웠죠",
      script: "콜럼버스 이야기의 진짜 반전은 지구가 둥글다는 증명이 아니라 거리 계산 착오입니다.",
      summary: "콜럼버스 신화 뒤에 숨은 거리 계산 착오를 설명합니다.",
      scenes: [
        { order: 1, narration: "콜럼버스 신화의 도입", duration_seconds: 12 },
        { order: 2, narration: "거리 계산 착오", duration_seconds: 36 },
        { order: 3, narration: "오늘의 결론", duration_seconds: 24 },
      ],
    },
    thumbnailPath: "C:/thumb.png",
  },
);

assert.notEqual(metadata.title, "우리는 이렇게 배웠죠", "generic titles should be upgraded");
assert.match(metadata.title, /콜럼버스|계산|착오|반전|항해/, "title should contain discoverable topic words");
assert.ok(metadata.title.length <= 60, "default title should stay concise before user edits");
assert.ok(metadata.description.includes("핵심:"), "description should include a structured core-summary section");
assert.ok(metadata.description.includes("AI 생성"), "description should disclose synthetic media in Korean");
assert.ok(metadata.description.includes("0:00"), "description should include chapters when scene timing is available");
assert.ok(metadata.tags.includes("콜럼버스"), "tags should include topic keyword");
assert.ok(metadata.tags.includes("역사"), "tags should include category keyword");
assert.equal(metadata.categoryId, "27", "history/education content should default to Education");
assert.equal(validateUploadMetadata(metadata).ok, true);

const aiMetadata = buildDefaultUploadMetadata(
  { id: "youtube-ai", sourceValue: "AI 반도체 시장은 GPU 생태계와 CUDA 전환 비용이 핵심입니다.", finalPath: "C:/video.mp4" },
  {
    draft: {
      title: "요즘 이게 난리입니다",
      script: "AI 반도체 시장은 GPU 성능보다 생태계 전환 비용과 CUDA 락인이 더 큰 장벽입니다.",
    },
  },
);
assert.match(aiMetadata.title, /AI|반도체|GPU|생태계|CUDA/);
assert.ok(aiMetadata.tags.some((tag) => /AI|반도체|기술/.test(tag)));
assert.equal(aiMetadata.categoryId, "28", "AI/technology content should default to Science & Technology");

const poor = validateUploadMetadata({
  jobId: "youtube-poor",
  videoPath: "C:/video.mp4",
  title: "Hermes video",
  description: "",
  tags: [],
});
assert.equal(poor.ok, false, "placeholder metadata should fail the upload quality gate");
assert.ok(poor.errors.some((error) => error.field === "description"));
assert.ok(poor.errors.some((error) => error.field === "tags"));

console.log(JSON.stringify({ ok: true, checked: "upload-metadata-quality", metadata }, null, 2));
