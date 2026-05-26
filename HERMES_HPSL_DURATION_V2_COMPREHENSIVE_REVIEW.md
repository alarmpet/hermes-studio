# Hermes Studio HPSL 대본 구조 및 재생 시간 V2 구현 검토 보고서

본 보고서는 `2026-05-25-hermes-studio-hpsl-duration-v2-plan.md` 계획서와 관련 코드베이스, 워크플로우 이벤트 파이프라인, 그리고 SQLite 데이터베이스 기록 시스템(`workflow-db-events.mjs`, `bot_db_helper.py`)을 종합적으로 대조 검토한 결과입니다.

---

## 1. 종합 평가 및 구현 완료 현황 검증

검토 결과, 계획서에 제시된 **HPSL 구조 강제화, 대본 중복 방지, 그리고 프리셋/수동 길이 혼선 제거**를 위한 백엔드 및 프런트엔드 비즈니스 로직과 관련 테스트 스크립트들이 코드베이스에 **안정적이고 견고하게 이미 선반영되어 동작 중임**을 확인했습니다.

구체적인 검증 데이터는 다음과 같습니다:

### 1.1 재생 시간 계약(Duration Contract)의 준수
* `youtube-job-schema.mjs` 및 데스크톱 서비스(`youtube-job-service.mjs`) 내에서 수동 입력 초 기본값이 `120`에서 `60`으로 정상 일치화되었습니다.
* `index.html`과 `app.js`에서 프리셋 모드 선택 시 수동 입력 컴포넌트(`customDurationSeconds`)가 비활성화(disabled)되며, 프리셋 정보와 HPSL 예상 장면 수가 동적으로 조합되어 실제 적용 길이 preview(`실제 적용 길이: 60초 · 예상 장면 5개 · HPSL`)를 실시간 갱신합니다.
* **테스트 통과**: `check-duration-mode-contract.mjs` 검증 스크립트가 로컬에서 완벽하게 통과하여, 프리셋 모드일 때 캐시된 이전 120초 수동값이 60초 작업에 혼선을 주는 오염 현상이 완벽히 방지되고 있습니다.

### 1.2 HPSL 대본 계약 및 동적 QA 게이트 적용
* `youtube-draft-quality.mjs` 스크립트 하단에 `validateHpslStructure` 유효성 검사 모듈이 추가되었습니다.
* **동적 가드 검증**: `structure === "HPSL"`일 때 `hook`, `point`, `story`, `lesson` 4대 핵심 영역 중 누락된 곳이 있거나, 텍스트가 비어 있거나, 타겟 초가 양수(> 0)가 아닌 불량 대본이 감지되면 즉시 `HPSL_SECTION_MISSING` 에러 코드로 작업을 반려하여 안정성을 높였습니다.
* **테스트 통과**: `check-hpsl-draft-structure.mjs` 및 `check-hpsl-qa-gate.mjs` 검사기를 통해, HPSL 섹션이 누락된 대본과 마지막 장면에 전체 대본이 통째로 복사되어 멈춤을 유발하는 중복 대본(`DUPLICATE_FULL_SCRIPT_SCENE`)을 런타임에 완벽히 필터링하고 있습니다.

### 1.3 HPSL 장면 스플리터의 오디오/비디오 싱크 알고리즘 고도화
* `script-planner.mjs` 내의 `planScenesFromHpsl` 및 유틸 함수들을 확인한 결과, 다음 2가지 중요 싱크 보정 알고리즘이 빈틈없이 구현되었습니다:
  1. **비례 시간 배분 (Proportional Scaling)**: LLM이 준 세부 타겟 초의 합이 최종 지정 시간과 차이 날 때, 선형 스케일 비율(`scale = targetSeconds / sumRaw`)을 적용하여 전체 길이 단수 오차를 완벽 보정(`allocateSectionSeconds`)합니다.
  2. **글자 수(음절) 비례 분할**: 스토리 섹션을 여러 개의 비주얼 B-roll 장면으로 문장 분할할 때 단순 균등 분할하지 않고, 각 문장의 **순수 공백 제외 글자 수 비례 배분**(`allocateChunkDurations`)을 채택하여 특정 장면의 재생 시간이 비정상적으로 길어지는 멈춤 현상을 사전에 완벽히 제거했습니다.

### 1.4 데이터베이스(SQLite) 이력 동기화 체계 완비
* **현황**: `workflow-db-events.mjs` 파일에서 데스크톱 워크플로우 진행 이벤트를 `bot_db_helper.py`의 `log-event` 및 `log-failure` 명령어로 실시간 동기화하고 있습니다.
* **관제 지표 연계**: 대본 기획 단계(`scene-planning`)에서 산출되는 HPSL 배분 정보(`hpslOffsets`), 실제 분할된 장면 배분 초(`hpslSectionSeconds`), 그리고 장면 ➔ HPSL 맵 정보(`sceneSectionMap`)가 `bot_data.db`의 `task_events` 테이블에 JSON 데이터 세부 사항(`details`)으로 온전히 기록됩니다.
* **테스트 통과**: `check-hpsl-workflow-observability.mjs` 스크립트를 통해 SQLite로 들어가는 이벤트 페이로드 보존성과 속성 계약이 보장되고 있음을 증명했습니다.

---

## 2. 추가적인 개선 제안 및 권고사항

현재 HPSL 구조 기반 비디오 제작 시스템은 완성도가 매우 높으나, 더 장기적인 배포 안정성과 고품질 쇼츠 유지를 위해 다음 마이너 개선 사항을 검토할 것을 권장합니다:

### 2.1 UI 구조 스트립의 스타일 피드백 시각화
* **개선제안**: `index.html`에 추가된 후킹/포인트/스토리/교훈 대본 구조 스트립(`structure-strip`)은 현재 단색 텍스트 묶음으로 표현되어 있습니다. 생성 시작 단계 혹은 완료 단계에서 각 섹션이 완성될 때마다 해당 스트립의 라벨 색상을 녹색(Green)으로 활성화해 주는 시각적 피드백 효과를 더하면 사용자 체감 품질이 크게 향상될 것입니다.

### 2.2 비동기 DB 기록 프로세스 고려 (`workflow-db-events.mjs`)
* **현황**: `mirrorWorkflowEventToDb` 함수는 동기식 `spawnSync` 명령어로 파이썬 데이터베이스 CLI를 띄웁니다.
* **개선제안**: 이 작업은 백그라운드 DB 기록이므로 메인 렌더링 스레드를 잡고 있을 필요가 없습니다. 만약 다량의 작업이 집중될 때 프로세스 포크 비용을 절감하려면, 이 로깅 유틸을 비동기식 `spawn` 호출 구조로 비차단식(Non-blocking) 처리하는 방향으로 점진적 개선을 추천합니다.

---

## 3. 결론

구현 계획서(`2026-05-25-hermes-studio-hpsl-duration-v2-plan.md`)상의 목표 조건들은 **전부 코드베이스에 모범적으로 설계 및 배치 완료**되어 있습니다. 
특히, 비례 시간 스케일링, 음절 비례 분할, HPSL 검수 게이트, 그리고 SQLite 영속 로그 연동에 이르기까지 **프로덕션 수준의 안정적인 예외 가드 장치들이 모두 확보**되어 있으므로 배포에 전혀 무리가 없는 완성도 높은 상태입니다.
