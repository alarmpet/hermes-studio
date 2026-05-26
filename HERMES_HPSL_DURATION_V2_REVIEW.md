# Hermes Studio HPSL 대본 구조 및 재생 시간 V2 계획서 검토 의견서

본 검토서는 `2026-05-25-hermes-studio-hpsl-duration-v2-plan.md` 구현 계획서와 Hermes 프로젝트의 HPSL(후킹, 포인트, 스토리, 교훈) 대본 프롬프트 구성, 장면 플래너, 그리고 SQLite 데이터베이스 및 관련 스크립트들을 종합 분석한 결과입니다.

---

## 1. 계획서 내 잠재적 결함 및 개선 필요 사항

제안된 계획서는 60초 프리셋 선택 시 수동 길이값(120초)이 개입되어 대본이 강제로 늘어지거나 중복 렌더링을 유발하는 구조적 결함을 효과적으로 지적하고 해결책을 제시하고 있습니다. 또한 shorts 콘텐츠에 적합한 HPSL 구조를 정의하고 있습니다. 단, 실제 제품으로 출시되기 위해 다음과 같은 세부 설계 보완이 추가되어야 합니다.

### 1.1 HPSL 섹션별 타겟 시간 비례 스케일링 누락 (치명적 논리 결함)
* **현황**: Task 3과 Task 4에서 Gemini/OpenRouter가 출력하는 HPSL 섹션 각각의 `target_seconds` 합산값(예: Hook 7초, Point 13초, Story 30초, Lesson 10초 = 총 60초)을 토대로 장면 분할 및 비디오 시간을 설계하고 있습니다.
* **문제점**: 대형 언어 모델(LLM)은 정밀한 산술 연산에 약하므로, 작업자가 지정한 전체 길이(`targetSeconds`, 예: 90초)와 생성된 HPSL 개별 섹션의 `target_seconds` 합산값(예: 7+12+28+10 = 57초)이 일치하지 않는 경우가 빈번히 발생합니다.
  * 만약 이 오차를 보정하지 않고 바로 렌더링에 사용할 경우, 전체 영상 시간이 지정한 시간보다 훨씬 짧거나 길게 완료되어 오디오 잘림 또는 블랙 프레임 대기 등의 문제를 야기합니다.
* **개선책**: `planScenesFromHpsl()` 함수 내부에 **섹션 시간 비례 배분(Proportional Scaling) 가드 로직**을 무조건 추가해야 합니다.
  ```javascript
  const sumTargetSeconds = Object.values(hpsl).reduce((sum, sec) => sum + (sec.target_seconds || 0), 0) || 60;
  const scale = targetSeconds / sumTargetSeconds; // 실제 설정한 총 시간 대비 LLM 출력값 비율 계산

  // 각 섹션의 목표 시간을 전체 목표 길이에 맞게 선형 비례 스케일링
  const scaledHookTime = Math.round(hpsl.hook.target_seconds * scale);
  const scaledPointTime = Math.round(hpsl.point.target_seconds * scale);
  const scaledStoryTime = Math.round(hpsl.story.target_seconds * scale);
  const scaledLessonTime = targetSeconds - (scaledHookTime + scaledPointTime + scaledStoryTime); // 마지막 단수 오차 보정
  ```

### 1.2 Story 섹션 문장 분할 시 음절(Syllable) 비례 배분 필요
* **현황**: 계획서에서는 Story 섹션(약 30초 할당)을 문장 단위로 나누어 2~5개의 장면으로 변환하도록 정의하고 있습니다.
* **문제점**: 30초의 Story 섹션 내에 3개의 문장이 존재할 때 단순히 10초씩 균등 배분하게 되면, 10음절짜리 짧은 문장과 40음절짜리 긴 문장이 둘 다 10초씩의 비디오 슬롯을 가져가게 됩니다. 이는 특정 장면에서 **극심한 오디오/비디오 불일치(정지 화면 또는 잘림)**를 유발해 앞선 QA 게이트에서 높은 확률로 차단됩니다.
* **개선책**: Story 섹션을 여러 문장의 장면으로 나눌 때에도, 해당 문장들의 **한글 글자 수(음절 수) 비율에 비례하여 할당 시간**을 쪼개주어야 합니다.
  ```javascript
  const storySentences = splitKoreanSentences(hpsl.story.narration);
  const totalSyllables = storySentences.reduce((sum, s) => sum + s.replace(/\s+/g, "").length, 0) || 1;
  
  const storyScenes = storySentences.map((sentence) => {
    const syllables = sentence.replace(/\s+/g, "").length;
    let duration = Math.round((syllables / totalSyllables) * scaledStoryTime);
    duration = Math.max(4, duration); // 각 장면 최소 길이를 4초로 보장
    return { narration: sentence, duration_seconds: duration };
  });
  ```

### 1.3 Node.js 구버전 및 환경 호환성을 고려한 `import.meta.dirname` 수정
* **현황**: Task 1 Step 1 및 Task 3 Step 1 등의 테스트 파일 경로 해석부에 `import.meta.dirname` 상수가 쓰이고 있습니다:
  ```javascript
  const root = resolve(import.meta.dirname, "..");
  ```
* **문제점**: `import.meta.dirname`은 Node.js 20.11.0 또는 21.2.0 버전 이상에서만 네이티브로 지원됩니다. 그 이하의 안정화 버전(Node 18 LTS 등)이나 특정 Electron 내장 노드 환경에서는 `undefined`로 평가되어 테스트 스크립트 실행이 즉시 다운됩니다.
* **개선책**: 더 넓은 호환성을 위해 `fileURLToPath` 방식을 권장합니다.
  ```javascript
  import { fileURLToPath } from "node:url";
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  ```

---

## 2. 데이터베이스(SQLite) 및 모니터링 관점의 보완 제안

### 2.1 HPSL 구조 여부 및 세부 목표 시간의 SQLite DB 적재화
* **현황**: 현재 계획서는 Electron UI와 렌더러 파이프라인의 HPSL 적합성에만 집중하고 있어, SQLite 로깅 파트가 빠져 있습니다.
* **개선사항**: 작업이 제출될 때 `bot_data.db`에 등록되는 `jobs` 테이블의 `workflow_json`에 **`scriptStructure: "hpsl"` 정보**와 함께 **Hook/Point/Story/Lesson 세부 타겟 초(seconds) 지표**를 구조화하여 업데이트해야 합니다.
  * 데이터베이스 기록 예시:
    ```json
    {
      "scriptStructure": "hpsl",
      "hpsl_offsets": { "hook": 7, "point": 13, "story": 30, "lesson": 10 }
    }
    ```
  * 이렇게 누적해 두면 텔레그램 `/jobs` 목록을 확인하거나 DB 분석 스크립트를 통해 생성된 비디오 중 HPSL 포맷 준수율 및 채널별 평균 오차율을 분석 통계로 집계할 수 있습니다.

---

## 3. 의견 요약 및 구현 제안 리팩토링 예시

### 보완된 `planScenesFromHpsl` 플래너 코드 예시 (`script-planner.mjs`)
계획서의 Task 4를 구체화하고 위에서 지적한 비례 스케일링 및 음절 비례 분할 가드를 포함하여 리팩토링한 예제입니다.

```javascript
import { splitKoreanSentences } from "./script-planner.mjs";

export function planScenesFromHpsl({ title, hpsl, targetSeconds, characterProfile }) {
  // 1. 개별 섹션 시간의 비례 스케일링 계산
  const hookRaw = hpsl?.hook?.target_seconds || 8;
  const pointRaw = hpsl?.point?.target_seconds || 15;
  const storyRaw = hpsl?.story?.target_seconds || 27;
  const lessonRaw = hpsl?.lesson?.target_seconds || 10;
  const sumRaw = hookRaw + pointRaw + storyRaw + lessonRaw;
  const scale = targetSeconds / sumRaw;

  const hookTime = Math.round(hookRaw * scale);
  const pointTime = Math.round(pointRaw * scale);
  const storyTime = Math.round(storyRaw * scale);
  const lessonTime = targetSeconds - (hookTime + pointTime + storyTime); // 단수 차이 보정

  const scenes = [];
  let order = 1;

  // 1. Hook (후킹) - 1장면
  scenes.push({
    order: order++,
    section: "hook",
    narration: hpsl.hook.narration,
    duration_seconds: hookTime,
    image_prompt: buildVisualPrompt(title, hpsl.hook.narration, "hook", characterProfile)
  });

  // 2. Point (핵심) - 1장면
  scenes.push({
    order: order++,
    section: "point",
    narration: hpsl.point.narration,
    duration_seconds: pointTime,
    image_prompt: buildVisualPrompt(title, hpsl.point.narration, "point", characterProfile)
  });

  // 3. Story (스토리) - 문장 단위 음절 비례 분할
  const storySentences = splitKoreanSentences(hpsl.story.narration);
  if (!storySentences.length) storySentences.push(hpsl.story.narration);
  
  const totalStorySyllables = storySentences.reduce((sum, s) => sum + s.replace(/\s+/g, "").length, 0) || 1;
  let allocatedStoryTime = 0;

  const storySubScenes = storySentences.map((sentence, idx) => {
    const syllables = sentence.replace(/\s+/g, "").length;
    let duration = Math.round((syllables / totalStorySyllables) * storyTime);
    duration = Math.max(4, duration); // 최소 4초
    allocatedStoryTime += duration;
    return {
      section: "story",
      narration: sentence,
      duration_seconds: duration
    };
  });

  // Story 섹션 내 시간 오차 정밀 보정
  const storyDiff = storyTime - allocatedStoryTime;
  if (storyDiff !== 0 && storySubScenes.length > 0) {
    const lastSub = storySubScenes[storySubScenes.length - 1];
    lastSub.duration_seconds = Math.max(4, lastSub.duration_seconds + storyDiff);
  }

  for (const sub of storySubScenes) {
    scenes.push({
      order: order++,
      ...sub,
      image_prompt: buildVisualPrompt(title, sub.narration, "story", characterProfile)
    });
  }

  // 4. Lesson (교훈) - 1장면
  scenes.push({
    order: order++,
    section: "lesson",
    narration: hpsl.lesson.narration,
    duration_seconds: lessonTime,
    image_prompt: buildVisualPrompt(title, hpsl.lesson.narration, "lesson", characterProfile)
  });

  return scenes;
}

function buildVisualPrompt(title, narration, section, characterProfile) {
  // 섹션별 B-roll 시각적 목적 가이드 정의
  const goalMap = {
    hook: "첫 3초 눈길 끌기 및 궁금증 극대화",
    point: "가장 중요한 핵심 사실 요약 및 결론 제시",
    story: "대본 비유 및 상황 구체적 묘사 시연",
    lesson: "마무리 요약 또는 시청자 액션 환기"
  };

  return [
    "9:16 cinematic YouTube shorts B-roll scene.",
    `Section: ${section} (${goalMap[section]}).`,
    `Visual goal: make this narration instantly understandable: ${narration}`,
    characterProfile ? `Consistent character rule: ${characterProfile}.` : "",
    "No talking head, avoid a person simply speaking, no presenter reading the script.",
    "No subtitles, no readable text, no logos, no watermarks."
  ].filter(Boolean).join(" ");
}
```

---

## 4. 결론

1. **시간 비례 스케일링 탑재**: HPSL 섹션별 시간 합이 실제 타겟 시간과 어긋날 경우를 대비해 **선형 비례 계산 가드**를 반드시 내장해야 전체 렌더 안정성이 확보됩니다.
2. **Story 섹션 음절 비례 분배**: 스토리를 2~5개로 나눌 때 단순히 나누는 것이 아니라 **한글 글자 수 비례 배분**을 실행하여 오디오 멈춤(Freeze)을 차단합니다.
3. **노드 환경 호환성 정비**: 테스트 파일의 이식성을 위해 Node 20 미만에서도 동작하는 **`fileURLToPath` 기반 경로 획득 방식**을 채택해야 합니다.
4. **SQLite DB 구조화 축적**: `scriptStructure` 설정을 SQLite DB에 동기화하여 향후 진단 및 워크플로우 통계 정보로 유용하게 확보할 것을 권장합니다.
