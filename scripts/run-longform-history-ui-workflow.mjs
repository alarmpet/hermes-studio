#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
import electronPath from "electron";

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(process.env.HERMES_OUTPUT_DIR || "C:/Users/amd/AppData/Roaming/hermes/outputs");
const reportDir = join(outputRoot, "manual-runs");
const reportPath = join(reportDir, `longform-history-ui-workflow-${Date.now()}.json`);

const topic = "1814년 런던 맥주 홍수";
const script = [
  "1814년 런던의 맥주 홍수는 이름만 들으면 우스운 농담처럼 보이지만, 실제로는 산업화 초기 도시가 얼마나 위험한 실험실이었는지 보여주는 사건입니다.",
  "그날 오후, 런던 세인트 자일스 근처의 말굽 양조장에서는 거대한 포터 맥주 저장 통을 감싸고 있던 쇠테 하나가 먼저 튕겨 나갔습니다.",
  "작업자들은 이런 일이 이전에도 있었다고 생각했고, 당장 도시 전체를 흔들 사고가 될 거라고는 상상하지 못했습니다.",
  "하지만 몇 시간 뒤, 높이가 건물만 한 나무 저장 통이 버티지 못하고 터지면서 엄청난 양의 맥주가 벽을 뚫고 골목으로 쏟아졌습니다.",
  "맥주는 잔에 담긴 음료가 아니라, 갑자기 좁은 주거지로 밀려든 갈색 파도였습니다.",
  "당시 이 지역에는 지하나 반지하에 사는 가난한 사람들이 많았고, 좁은 방과 낮은 천장은 피할 시간을 거의 주지 않았습니다.",
  "사람들은 처음에 무슨 일이 벌어졌는지 이해하지 못했습니다.",
  "술 냄새가 먼저 밀려오고, 이어서 문과 창문이 부서지고, 가구와 벽돌과 사람들이 한꺼번에 휩쓸렸습니다.",
  "이 사건이 더 씁쓸한 이유는, 피해가 단순히 이상한 사고였기 때문만은 아닙니다.",
  "거대한 저장 통을 더 크게 만들수록 양조장은 더 많은 돈을 벌 수 있었지만, 그 구조물이 무너지면 누가 책임질지에 대한 기준은 느슨했습니다.",
  "당시 런던은 빠르게 커지고 있었고, 공장과 창고와 주거지가 너무 가까이 붙어 있었습니다.",
  "오늘날이라면 위험물 저장, 압력, 구조 안전, 배수 계획, 노동자 보고 체계가 모두 따로 점검됐을 가능성이 큽니다.",
  "하지만 1814년의 도시는 거대한 산업 장치와 취약한 주거지가 서로 등을 맞댄 채 살아가던 공간이었습니다.",
  "그 배경에는 포터 맥주 산업의 성장도 있었습니다.",
  "18세기 말과 19세기 초 런던에서는 포터가 대중적인 술이었고, 양조장들은 더 큰 통을 만들수록 자신들의 규모와 기술력을 과시할 수 있었습니다.",
  "거대한 통은 단순한 저장 용기가 아니라, 사업의 자랑거리이자 투자자에게 보여주는 상징물이었습니다.",
  "문제는 자랑거리가 커질수록 그 안에 갇힌 에너지와 위험도 함께 커진다는 점이었습니다.",
  "나무 판자를 쇠테로 묶어 만든 통은 겉으로는 단단해 보여도, 압력과 습도와 오래된 재료가 겹치면 약한 지점이 생길 수밖에 없습니다.",
  "한 부분이 먼저 흔들리고, 이어서 균형이 깨지고, 마지막에는 전체 구조가 한꺼번에 무너집니다.",
  "이런 사고는 마치 작은 균열 하나가 거대한 댐을 무너뜨리는 과정과 비슷합니다.",
  "사람이 위험을 알아차리는 순간과 시스템이 실제로 무너지는 순간 사이에는 아주 짧은 시간이 있을 뿐입니다.",
  "당시 노동자가 쇠테가 빠진 것을 보고했을 때, 그것을 즉시 대피 명령으로 연결하는 문화와 절차는 충분하지 않았습니다.",
  "이 지점이 이 사건을 단순한 우연이 아니라 관리 실패의 이야기로 바꿉니다.",
  "도시의 골목 구조도 피해를 키웠습니다.",
  "좁은 길, 낮은 주거 공간, 빽빽한 건물은 맥주가 빠르게 흘러나갈 통로를 만들면서도 사람에게는 도망갈 공간을 주지 않았습니다.",
  "물이 아니라 맥주였다는 점만 특이할 뿐, 본질은 오늘날의 도시 침수나 공장 폭발과 크게 다르지 않았습니다.",
  "무언가가 대량으로 저장되고, 그 저장물이 예상 밖의 방향으로 풀려나고, 취약한 사람들이 가장 먼저 피해를 입는 구조였기 때문입니다.",
  "더 흥미로운 점은 이 사건이 법정에서 어떻게 다뤄졌는가입니다.",
  "당시 배심은 이 일을 불가항력에 가까운 사고로 보았고, 현대적 의미의 기업 책임을 강하게 묻지는 않았습니다.",
  "그 판단 자체가 그 시대의 안전 감각을 보여줍니다.",
  "위험은 있었지만, 아직 사회는 그 위험을 규칙으로 번역하는 법을 충분히 배우지 못했습니다.",
  "그래서 런던 맥주 홍수는 산업 안전법이 왜 필요한지를 거꾸로 설명하는 좋은 사례가 됩니다.",
  "사고가 일어나기 전에는 비용처럼 보이는 점검과 규제가, 사고가 난 뒤에는 가장 싼 보험이었다는 사실이 드러납니다.",
  "사고 뒤에는 더 기묘한 장면도 전해집니다.",
  "일부 사람들은 거리와 지하에 고인 맥주를 떠마셨다는 이야기가 돌았고, 그 이야기 때문에 사건은 희극처럼 소비되기도 했습니다.",
  "하지만 핵심은 술이 공짜로 흘렀다는 장난이 아니라, 평범한 노동자와 가족들이 예고 없이 산업 사고의 희생자가 됐다는 점입니다.",
  "사망자는 여덟 명으로 기록됐고, 많은 집과 생계가 무너졌습니다.",
  "양조장 내부 노동자보다 주변 주민이 더 크게 다친 사실은 도시 안전의 불평등을 보여줍니다.",
  "돈을 버는 시설은 따로 있고, 위험을 먼저 맞는 사람은 따로 있었던 셈입니다.",
  "이 이야기는 지금의 우리에게도 낯설지 않습니다.",
  "데이터 센터, 배터리 공장, 화학 창고, 물류 시설처럼 현대의 거대한 시스템도 편리함 뒤에 위험을 품고 있습니다.",
  "기술이 커질수록 사고도 커질 수 있고, 안전 기준은 사고가 난 뒤에야 뒤늦게 따라오는 경우가 많습니다.",
  "런던 맥주 홍수의 교훈은 단순합니다.",
  "이상하게 들리는 역사 속 사건일수록, 그 안에는 시대의 진짜 약점이 숨어 있습니다.",
  "맥주가 골목을 덮친 하루는 웃긴 도시 전설이 아니라, 산업화가 사람들의 집 앞까지 밀려왔던 순간입니다.",
  "그리고 안전은 기술의 장식품이 아니라, 기술이 사회와 함께 살기 위한 최소 조건입니다.",
  "우리가 오늘 어떤 시스템을 빠르게 키우고 있다면, 질문은 하나입니다.",
  "그 시스템이 무너졌을 때 가장 먼저 물에 잠기는 사람은 누구인가.",
  "1814년 런던의 답은 가난한 골목의 주민들이었습니다.",
  "2026년의 답은 우리가 지금 만드는 규칙에 달려 있습니다.",
  "그래서 이 사건은 이상한 맥주 이야기로 끝나지 않습니다.",
  "그것은 거대한 기술과 작은 생활 공간이 충돌할 때, 사회가 누구를 보호해야 하는지 묻는 오래된 경고입니다.",
  "역사를 재밌게 보는 가장 좋은 방법은 낯선 사건을 웃고 넘기는 것이 아니라, 그 사건이 오늘의 우리를 어디서 찌르는지 찾아보는 것입니다.",
  "런던 맥주 홍수는 바로 그런 이야기입니다.",
  "우리가 이 사건을 영상으로 본다면 첫 장면은 거대한 나무 통의 표면을 천천히 훑는 카메라가 좋습니다.",
  "그다음에는 쇠테 하나가 미세하게 벌어지고, 작업자가 고개를 갸웃하는 순간을 보여줄 수 있습니다.",
  "이어지는 장면은 지도처럼 좁은 골목을 위에서 내려다보며, 양조장과 주거지가 얼마나 가까웠는지 보여주는 방식이 어울립니다.",
  "피해 장면은 선정적으로 과장하기보다, 무너진 문, 뒤집힌 의자, 어두운 지하방의 물자국 같은 디테일로 충분히 전달할 수 있습니다.",
  "중반부에는 거대한 저장 통을 현대의 배터리 창고나 데이터 센터 냉각 시설과 비교하는 시각적 은유를 쓰면 좋습니다.",
  "후반부에는 안전 점검표, 균열 확대 이미지, 대피 경로를 상징하는 빛줄기처럼 읽을 수 없는 그래픽을 활용할 수 있습니다.",
  "마지막 장에는 오늘의 시청자가 자기 주변을 떠올리게 해야 합니다.",
  "우리가 매일 쓰는 전기, 물류, 통신, 인공지능 서비스도 대부분 보이지 않는 거대한 설비 위에서 움직입니다.",
  "평소에는 조용하고 편리하지만, 설계와 점검과 책임이 느슨해지는 순간 작은 결함이 커다란 피해로 바뀔 수 있습니다.",
  "그래서 이 역사적 사건은 낡은 도시의 우스운 소동이 아니라, 현대 시스템을 설계하는 사람에게도 유효한 질문입니다.",
  "편리함을 키우는 속도만큼, 그 편리함이 실패했을 때 보호받아야 할 사람을 먼저 생각하고 있는가.",
  "이 질문이 남아야 영상의 끝이 단순한 잡학이 아니라 오래가는 교훈이 됩니다.",
  "짧은 사건 하나를 오래 들여다보면, 기술의 성공담보다 실패담이 훨씬 정직한 스승이 될 때가 많습니다.",
  "성공은 종종 화려한 광고로 남지만, 실패는 어디를 보강해야 하는지 정확한 지도를 남깁니다.",
  "런던 맥주 홍수도 그렇습니다.",
  "거대한 통, 좁은 골목, 가난한 주거지, 느슨한 책임이라는 네 가지 조건이 겹치자, 평범한 오후가 재난으로 변했습니다.",
  "그 조합을 이해하면 우리는 오늘의 도시와 기술도 조금 더 날카롭게 볼 수 있습니다.",
  "사건의 규모보다 중요한 것은 그 조건들이 지금도 다른 모습으로 반복될 수 있다는 사실입니다.",
  "이런 방식이면 영상은 단순히 사람이 대본을 읽는 장면이 아니라, 사건의 원인과 교훈을 눈으로 따라가는 작은 다큐멘터리가 됩니다.",
  "재밌는 역사 이야기는 결국 관객이 한 번 웃은 뒤, 잠깐 조용해지게 만드는 힘을 가질 때 오래 기억됩니다.",
  "한 통의 맥주가 터졌고, 도시는 자신이 만든 위험을 처음으로 냄새 맡았습니다.",
  "그리고 우리는 그 냄새를 단순한 술 냄새가 아니라, 안전 기준이 늦게 도착했을 때 나는 경고음으로 기억해야 합니다.",
].join(" ");

function latestJobDirFromButtonText(text = "") {
  const match = String(text).match(/[A-Z]:\\[^\n\r]+youtube-\d+/i);
  return match?.[0] || "";
}

await mkdir(reportDir, { recursive: true });

const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  cwd: root,
  env: {
    ...process.env,
    HERMES_OUTPUT_DIR: outputRoot,
  },
  timeout: 120_000,
});

const events = [];
let finalState = "unknown";
let latestOutput = "";
let appWindowBounds = null;
let appViewport = null;

try {
  const page = await app.firstWindow({ timeout: 60_000 });
  appWindowBounds = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.maximize();
    return window?.getBounds();
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  appViewport = page.viewportSize();
  if (!appViewport || appViewport.width < 1600 || appViewport.height < 1000) {
    throw new Error(`Hermes Studio test viewport is too small: ${JSON.stringify(appViewport)}`);
  }
  await page.waitForSelector("#jobForm", { timeout: 60_000 });
  page.on("console", (message) => {
    events.push({ type: "browser-console", level: message.type(), text: message.text(), at: new Date().toISOString() });
  });

  await page.locator("input[name='sourceType'][value='script']").check();
  await page.evaluate((value) => {
    const input = document.querySelector("#sourceValue");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, script);
  await page.locator("#scriptLengthMode").selectOption("custom");
  await page.locator("#customDurationSeconds").fill("600");
  await page.locator("#researchProvider").selectOption("notebooklm-mcp");
  await page.locator("#archiveProvider").selectOption("local-files");
  await page.locator("#subtitleStyleId").selectOption("clean-news");
  await page.locator("#subtitleFontSize").fill("10");
  await page.locator("#subtitleOutline").fill("2");
  await page.locator("#subtitleShadow").fill("1");
  await page.locator("#speechSpeed").evaluate((input) => {
    input.value = "0.9";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#renderEffectPreset").selectOption("cinematic");
  await page.locator("#motionIntensity").selectOption("light");
  await page.locator("#transitionPreset").selectOption("scene-fade");
  await page.locator("input[name='flowOutputMode'][value='hybrid']").check();
  await page.locator("#hybridIntroVideoSceneCount").fill("10");
  await page.evaluate(() => {
    const mock = document.querySelector("#mockMediaMode");
    if (mock) {
      mock.checked = true;
      mock.dispatchEvent(new Event("change", { bubbles: true }));
      mock.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const thumbnail = document.querySelector("#chatgptThumbnail");
    if (thumbnail) {
      thumbnail.checked = false;
      thumbnail.dispatchEvent(new Event("change", { bubbles: true }));
      thumbnail.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  events.push({
    type: "ui-submit",
    topic,
    targetSeconds: 600,
    requestedResearchProvider: "notebooklm-mcp",
    note: "Developer UI run uses Mock Media Mode because current packaged/live Flow longform is not implemented beyond the Shorts pipeline.",
    at: new Date().toISOString(),
    appWindowBounds,
    appViewport,
  });

  await page.locator("#generateBtn").click();
  await page.waitForFunction(() => {
    const state = document.querySelector("#jobState")?.textContent || "";
    return /Preview Complete|Failed|Config Error/i.test(state);
  }, null, { timeout: 25 * 60 * 1000 });

  finalState = (await page.locator("#jobState").innerText()).trim();
  latestOutput = (await page.locator("#latestOutput").innerText()).trim();
  const currentMessage = (await page.locator("#currentProgressMessage").innerText()).trim();
  const progress = (await page.locator("#jobProgressPercent").innerText()).trim();
  events.push({ type: "ui-finished", finalState, latestOutput, currentMessage, progress, at: new Date().toISOString() });
} finally {
  await app.close().catch(() => {});
}

const jobDir = latestJobDirFromButtonText(latestOutput) || latestOutput;
const renderReportPath = jobDir ? join(jobDir, "render-report-v2.json") : "";
const desktopResultPath = jobDir ? join(jobDir, "desktop-result.json") : "";
const renderReport = renderReportPath && existsSync(renderReportPath)
  ? JSON.parse(readFileSync(renderReportPath, "utf8"))
  : null;
const desktopResult = desktopResultPath && existsSync(desktopResultPath)
  ? JSON.parse(readFileSync(desktopResultPath, "utf8"))
  : null;

const report = {
  ok: /Preview Complete/i.test(finalState),
  topic,
  finalState,
  latestOutput,
  jobDir,
  finalPath: renderReport?.finalPath || desktopResult?.finalVideo?.finalPath || "",
  finalDuration: renderReport?.finalDuration || desktopResult?.finalVideo?.finalDuration || null,
  requested: {
    sourceType: "script",
    targetSeconds: 600,
    researchProvider: "notebooklm-mcp",
    flowOutputMode: "hybrid",
    hybridIntroVideoSceneCount: 10,
    mockMediaMode: true,
  },
  appWindowBounds,
  appViewport,
  limitationsObserved: [
    "Current UI/schema now allows custom duration up to 1200 seconds, but this test intentionally targets 600 seconds for a 10 minute smoke run.",
    "Live Google Flow longform remains limited by the current Shorts-oriented media generation pipeline and should be promoted to a dedicated longform chapter pipeline.",
    "Direct script mode bypasses NotebookLM research; NotebookLM MCP is relevant for keyword/URL longform research, but live MCP is not wired into the desktop create job context yet.",
    "This run validates the Hermes Studio UI/job/render path with local mock media, not live Google Flow longform media generation.",
  ],
  events,
  reportPath,
  updatedAt: new Date().toISOString(),
};

writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
