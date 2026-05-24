# Hermes YouTube 자동화 실행 계획서 (개선본)

작성일: 2026-05-23  
목표: 키워드/URL 입력으로 대본/이미지 프롬프트를 생성하고 Google Flow에서 미디어(비디오 또는 이미지)를 생성·다운로드까지 수행하는 Hermes 자동화 흐름을 구현한다.

---

## 1) 핵심 기능 범위 (MVP)
- `키워드` 또는 `기사 URL` 입력
- Google 검색/뉴스 수집 없이 기사 본문을 기반으로 한 **대본 생성**
- OpenRouter(OpenAI 계열 모델)로 다음 산출물 생성  
  - 제목  
  - 60~120초 기준 대본  
  - 장면별 이미지/비디오 프롬프트(9:16)
- Flow 자동 입력 방식(타이핑 시뮬레이션 및 설정 제어 기반)으로 이미지/비디오 생성 요청
- 생성된 이미지/비디오 저장 및 패키징
- 사용자 승인용 임시 저장 메시지(최종 발행 전 확인 단계)

---

## 2) 현재 코드 재사용 포인트
- `telegram-flow-news-bot.mjs`  
  - 메시지 라우팅/큐/재시도/로그 구조를 그대로 사용
  - OpenRouter 호출 패턴(`openRouterReply`, `buildStrategyPlan`, `fetch` 처리)
  - Flow 제어 함수 (`ensureChrome`, `flowTarget`)
  - 실패/워크플로우 이벤트 로깅
- `aistudio-ui-image.mjs`  
  - Flow 설정 제어 전략 및 미디어(이미지, 비디오, 캔버스) 다운로드 로직 (`flowConfigureSettingsExpression`, `extractImageExpression` 참고)

---

## 3) 목표 아키텍처 (v1)

1. **입력 분석**
   - `/yt 키워드 ...`
   - `/yturl https://...` 또는 일반 텍스트 내 URL 인식
   - 키워드/URL 모드 분기 및 파싱

2. **원천 데이터 준비**
   - **키워드 모드**: OpenRouter로 `검색 컨셉 + 대본 초안 + 시퀀스 프롬프트` 생성
   - **URL 모드**: URL 콘텐츠 추출 후 기사 요약 → 대본/이미지 프롬프트 변환 (저작권 회피를 위한 윤리적 재작성 및 구어체 변환 필수 적용)

3. **대본·이미지 프롬프트 생성**
   - OpenRouter JSON 응답 고정 스키마 사용 (구조화된 출력 지원을 위해 `response_format: { type: "json_object" }` 사용 고려)
   - 반환 형태:
     ```json
     {
       "title": "...",
       "duration_seconds": 90,
       "script": "....",
       "scenes": [
         {"order": 1, "narration": "...", "image_prompt": "...", "duration_seconds": 8},
         ...
       ]
     }
     ```
   - Markdown 코드 블록(```json ... ```) 제거 및 에러 방지를 위한 **견고한 JSON 파서** 장착

4. **Flow 자동 입력/생성 (순차적 파이프라인)**
   - 각 scene의 prompt를 순차 전송
   - 생성 방식(이미지 vs 비디오)에 따른 Flow 설정 자동 변경 (`ensureFlowSettings(mode)`)
   - 로그인/캡차 구간은 사용자 개입 필요 시 `sendMessage`로 안내
   - 결과 미디어 저장(우선순위: 비디오 > 이미지 > 스크린샷 백업)

5. **검수/저장 및 상태 리포팅**
   - 각 씬의 생성이 끝날 때마다 Telegram으로 진행 상태 전송 (예: `[1/4] 씬 비디오 생성 완료...`)
   - 생성된 대본/미디어 폴더 `outputs/youtube/<jobId>/`에 구조화하여 저장
   - 승인 키워드(“최종확정”) 수신 시에만 업로드 혹은 패키지 마무리

---

## 4) `telegram-flow-news-bot.mjs` 수정 항목

### 4-1. 라우팅 및 헬퍼 추가
- `isYoutubeRequest(text)`: `/yt` 접두사 검사
- `isYouTubeUrlRequest(text)`: `/yturl` 접두사 또는 URL 포함 검사
- `routeMetadataForText`에 다음 추가:
  - `name: "youtube-workflow"`
  - `handler: handleYouTubeWorkflowMessage`

### 4-2. 입력 파싱 및 폴백
- URL 추출 함수: `extractTargetUrl(text)`
- 명령 정리 함수: `normalizeYoutubeInput(text)`
- 기사 추출 및 폴백: `fetchArticleByUrl(url)`
  - URL 파싱 실패 또는 페이월/Cloudflare 차단 시, 제목이나 URL의 키워드를 기반으로 **"키워드 모드"로 자동 폴백**하여 작업이 즉시 실패하는 것을 방지.

### 4-3. LLM 스키마 생성기 및 파서
- `buildYouTubeDraftFromKeyword({keyword})`
- `buildYouTubeDraftFromArticle({title, sourceUrl, body})`
- `parseJsonMarkdown(text)`: LLM 응답에서 markdown 블록(```json) 및 제어 문자 등을 정제하는 정규식 기반 JSON 파서 구현
- 응답 검증: scenes 최소 3개 확보, image_prompt 유효성 체크

### 4-4. Flow 미디어 생성 제어
- `generateFlowMedia(prompt, mode)`:
  - `ensureFlowSettings(mode)`: 이미지(Image) 또는 동영상(Video) 모드에 맞춰 Flow 설정을 자동 구성.
  - 생성 완료 대기 및 다운로드: 동영상의 경우 `<video>` 태그를, 이미지의 경우 `<img>` 또는 `<canvas>` 태그를 추출하여 저장.

### 4-5. 최종 응답 및 검수 흐름
- 생성 결과물 저장 경로를 `outputs/youtube/<jobId>/`로 체계화.
- `sendLongMessage`로 대본 전체를 전송하고, 생성 완료된 미디어를 순차 전송.
- 승인 키워드(`최종확정`, `재생성`, `재시도`) 대기 흐름 설계.

---

## 5) 구현 단계 (빠른 시작용)

1. **1차: 텍스트 및 JSON 파서 완성**
   - `/yt` 분기 및 JSON 스키마 기반 대본+씬 프롬프트 생성 테스트
   - 정규식 기반 JSON 마크다운 파서 동작 확인
2. **2차: 단일 씬 Flow 미디어 자동화**
   - 이미지/비디오 모드 설정 전환 테스트 및 단일 씬 미디어 다운로드 성공
3. **3차: 멀티씬 파이프라인 및 진행률 리포팅**
   - Scene당 3~5개 프롬프트 순차 처리
   - Telegram으로 진행률(`setJobPhase` 및 메시지 편집) 실시간 전송 구현
4. **4차: 예외 처리 및 폴백 안정화**
   - URL 추출 실패 시 키워드 모드로 폴백
   - 타임아웃 방지를 위한 작업 제한 시간 확대 (최대 8분)
   - DB 로깅 (`youtube_draft_created`, `flow_scene_completed` 등) 및 `/status`, `/diagnose` 연동 검증

---

## 6) 수용 기준
- `/yt 키워드` 입력 시 스크립트 + 최소 3개 scene 프롬프트 생성 성공
- `/yturl URL` 입력 시 URL 추출 → 본문 요약 → 대본 구성 단계가 막힘없이 실행 (페이월 발생 시 키워드 모드 폴백 작동)
- Flow 생성 시, 비디오 모드에서는 `.mp4`, 이미지 모드에서는 `.png` 형태로 `outputs/youtube/<jobId>/`에 다운로드 완료
- 작업 진행율이 Telegram에 주기적으로 실시간 반영
- 검수 완료 전까지 임의 발송/업로드 차단

---

## 7) 보안/운영 및 데이터베이스 통합
- 민감 키 보안 정책 준수 (`readOpenRouterKey`, `GEMINI_API_KEY` 환경변수 권장)
- 작업당 최대 재시도 및 총 시간(최대 8분) 제약 설정으로 무한 루프 방지
- **DB 로깅**:
  - `task_events` 테이블에 YouTube 워크플로우 이벤트 세분화 로깅 (`youtube_draft_created`, `flow_scene_started`, `flow_scene_completed`, `youtube_completed`)
  - 작업 진행 중 문제 발생 시 `/diagnose`에서 이력을 추적하여 복구 경로 제공

---

## 8) 세부 개선 사항 및 예외 시나리오 대응

### A. Flow 미디어 설정의 동적 제어 (Video vs. Image)
- Google Flow 화면 상에서 동영상 모드(`Video`, `9:16`, `1x`)와 이미지 모드(`Image`)를 오가는 세부 설정을 Playwright CDP 코드로 직접 제어하도록 구현함. 이미지 모드일 때 `<video>` 태그만 감시하는 실수를 방지하기 위해 태그별 추출 전략을 동적으로 분기함.

### B. 장시간 실행에 따른 리포팅
- 씬당 60~90초가 소요되어 전체 4~5분 이상의 긴 대기 시간이 발생할 수 있으므로, Telegram progress ack(`editMessage`) 및 `setJobPhase`를 각 씬 시작/완료 시점마다 동적으로 업데이트함.

### C. 기사 URL 크롤링 폴백
- 뉴스 사이트 보안(Cloudflare, Captcha)으로 인해 본문 크롤링이 실패할 경우, 에러로 종료하지 않고 뉴스 제목 또는 입력된 URL 텍스트 내 주요 명사를 추출하여 자동으로 "키워드 모드" LLM 프롬프트로 넘어가 대본을 정상 생산함.
