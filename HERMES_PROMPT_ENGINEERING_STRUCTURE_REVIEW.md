# Hermes 대본 생성 프롬프트 구조 및 최적화 검토 의견서

본 검토서는 제시된 대본/장면 생성용 프롬프트와 `automation/gemini-research-draft.mjs` 소스 코드의 유기적 작동 방식을 분석하고, 프롬프트의 복잡성으로 인해 발생할 수 있는 잠재 리스크와 그에 대한 개선안을 정리한 결과입니다.

---

## 1. 사용자 질문에 대한 답변 및 현황 분석

사용자께서 지적하신 **"장황한 지시를 다 적기보다 핵심만 요약하고 다듬어서 전달해야 하는 것 아니냐"**라는 질문은 프롬프트 엔지니어링 관점에서 **매우 정확하고 날카로운 분석**입니다.

### 1.1 답변의 생성 여부
네, 현재 시스템 구조에서도 답변(JSON)이 오기는 합니다. 그 이유는 구글 제미나이(Gemini)에 미리 빌드해 둔 **"Gem(Gems)"**의 시스템 지침과 코드에서 주입하는 **엄격한 제약(Strict Rules)**들이 작동하고 있기 때문입니다.

### 1.2 그럼에도 장황하게 설계된 이유 (아키텍처적 배경)
1. **강력한 포맷 제어**: LLM은 자유롭게 텍스트를 출력하려는 성향이 있어, 조금만 제약을 늦추면 Markdown 백틱(```json)을 붙이거나 한글 키명(`"title"` 대신 `"제목"`)으로 변환해 버립니다. 이 경우 데스크톱 파서가 파싱 에러를 일으켜 전체 워크플로우가 멈추게 됩니다.
2. **복구 파이프라인 연계 (`REPAIR INSTRUCTION`)**: 1차 대본의 전체 재생 시간(duration)이 맞지 않아 검수(Duration QA)에서 실패했을 때, 소스 코드 엔진이 실패한 오차 데이터를 동적으로 주입하여 "늘리거나 줄여서 재출력하라"는 수리 명령어(`REPAIR INSTRUCTION`)를 2차로 이어 붙이는 과정에서 프롬프트가 인위적으로 누적 및 가중되어 길어진 것입니다.

---

## 2. 현재 장황한 프롬프트의 기술적 리스크

현재의 길고 중복된 프롬프트 전달 방식은 다음과 같은 치명적인 리스크를 유발합니다.

### 2.1 지시 혼선 (Instruction Drift) 및 모델 주의 분산
LLM은 프롬프트가 길어질수록 중간의 규칙을 누락(Attention Lost)할 가능성이 높습니다.
* 예컨대 "Hermes Studio와 완벽하게 일치해야 한다"는 모호한 표현과 " strict JSON만 반환하라"는 지시, "HPSL 형식을 따르라"는 명령어가 혼재되어 있으면, 모델은 `scenes` 배열 내부의 `image_prompt` 규칙(영어 출력, 텍스트 금지 등)을 무시하고 한글로 채우거나 엉뚱한 키를 뱉을 확률이 올라갑니다.

### 2.2 중복 및 모호한 서술에 의한 토큰 낭비
* `"Do not output any alternate schema keys from saved Gem examples"`
* `"Do not copy the schema example values. Never answer with literal placeholder..."`
위와 같은 유사한 제약(Constraint)들이 여러 번 중복 표현되고 있어 토큰 소모량이 증가하고 브라우저 대기 시간(latency)이 늘어납니다.

---

## 3. 개선안 및 프롬프트 리팩토링 제안

지시 강제력은 유지하되, 중복을 제거하고 명확하게 정돈한 프롬프트 리팩토링 스펙을 제안합니다.

### 3.1 리팩토링 방향성 (핵심 요약 및 구조화)
1. **부정형 제약의 최소화 및 긍정형 제약 단일화**: "A 하지 마라", "B 하지 마라"를 나열하기보다 **"반드시 X 구조만 반환하라"**로 일원화합니다.
2. **구조적 마크업 사용**: 텍스트를 나열하지 않고 `[Rule 1]`, `[Schema]` 등 구조화된 블록을 제공해 LLM의 주의(Attention) 분산을 막습니다.
3. **가장 최신 에러 지시(Repair Instruction)를 최상단에 배치**: 모델은 프롬프트의 가장 처음과 마지막 부분을 가장 강하게 인지합니다. 복구 명령어의 가중치를 최대화하도록 배치 구조를 바꿉니다.

---

## 4. 리팩토링 Before / After 데모

### Before (현재 장황한 프롬프트)
```text
https://n.news.naver.com/mnews/article/056/0012189623

Use your saved cinematic storytelling instructions, but output must match Hermes Studio exactly.
Return one strict JSON object only. No markdown. No alternate Korean schema keys.
Required keys: title, structure, hpsl, character_profile, duration_seconds, script, scenes.
HPSL means Hook, Point, Story, Lesson. Hook creates a 3-second curiosity gap, Point gives the core fact, Story builds cinematic context, Lesson leaves a useful takeaway.
Target duration: 60 seconds. Target scenes: 5.
Each scene must contain: order, narration, visual_intent, main_subject, action, setting, camera_motion, image_prompt, duration_seconds.
Each scene narration must be Korean spoken narration. Each scene image_prompt must be English cinematic Google Flow prompt reflecting that exact narration.
Use cinematic storytelling, tension, emotion, and curiosity, but keep narration length within the target duration.
For URL jobs, rewrite and transform the source. Do not copy article sentences.
Do not output any alternate schema keys from saved Gem examples; use only the required Hermes keys listed above.
Keep Flow prompts policy-safe: no real person likeness, no logos, no readable text, no subtitles, no watermarks.
Hybrid: first 2 scene(s) as Google Flow video, remaining scenes as Google Flow images with render motion.

REPAIR INSTRUCTION:
The previous draft failed duration QA. Target narration length is 60 seconds.
Expand the Korean HPSL narration naturally with more context, contrast, examples, and takeaway. Do not repeat sentences.
Return a fresh valid JSON object only. Do not repeat schema placeholder text. 
```

### After (리팩토링 제안 프롬프트 - 핵심 요약 및 튜닝)
```text
[REPAIR COMMAND]
The previous draft failed duration QA.
- Action: Expand the Korean HPSL narration naturally with more context and examples (Target: 60s).
- Constraint: Do not repeat sentences. Return a fresh valid JSON object only.

[SOURCE]
URL: https://n.news.naver.com/mnews/article/056/0012189623
(Instruction: Rewrite and transform the source idea completely. Do not copy sentences.)

[OUTPUT FORMAT]
Return ONE raw JSON object matching the schema below. No markdown (```), no alternate keys.
{
  "title": "string",
  "structure": "HPSL",
  "hpsl": {
    "hook": {"goal": "Hook", "narration": "Korean hook (3s curiosity gap)", "target_seconds": 7},
    "point": {"goal": "Point", "narration": "Korean core fact", "target_seconds": 13},
    "story": {"goal": "Story", "narration": "Korean context & example", "target_seconds": 30},
    "lesson": {"goal": "Lesson", "narration": "Korean takeaway", "target_seconds": 10}
  },
  "character_profile": "English stable character profile or empty string",
  "duration_seconds": 60,
  "script": "Korean full narration text (hook + point + story + lesson)",
  "scenes": [
    {
      "order": 1,
      "narration": "Korean spoken sentence",
      "visual_intent": "string",
      "main_subject": "string",
      "action": "string",
      "setting": "string",
      "camera_motion": "string",
      "image_prompt": "English cinematic Google Flow 9:16 prompt",
      "duration_seconds": 8
    }
  ]
}

[RULES]
1. Target: 60s total narration, 5 scenes.
2. Prompts: Must be English, policy-safe (no real person likeness, no logos, no text/subtitles/watermarks).
3. Hybrid Mode: First 2 scenes are video, remaining 3 scenes are still images.
