# Hermes Studio Timeline

이 문서는 Hermes Studio의 기능 추가, 수정, 삭제, 큰 코드나 아키텍처 변경을 시간순으로 남기는 작업 기록입니다.

## 기록 규칙

- 형식: `YYYY-MM-DD HH:mm KST - 구분 - 요약`
- 기록 대상: 기능 추가, 수정, 삭제, 아키텍처 변경, 워크플로우 변경, 외부 인증/자동화 경로 변경, 렌더링 결과에 영향을 주는 변경
- 제외 대상: 단순 오탈자, 임시 로그, 실행 산출물, 빌드 캐시
- 각 항목에는 가능하면 영향 범위와 검증 방법을 한 줄로 남깁니다.

## 내역

- 2026-05-26 00:00 KST - 기능 추가 - Gemini 자료 수집/대본 작성 경로를 Gemini Gems 우선으로 변경하고, 실패 시 일반 Gemini와 기존 OpenRouter fallback으로 이어지게 설계했습니다. 영향 범위: `automation/gemini-research-draft.mjs`, `youtube-workflow-stages.mjs`. 검증: `scripts/check-gemini-gems-priority.mjs`.
- 2026-05-26 00:00 KST - 아키텍처 변경 - 기능 추가/수정/삭제 및 큰 코드 변경을 시간순으로 추적하기 위한 루트 `timeline.md` 기록 규칙을 추가했습니다. 검증: `scripts/check-timeline-contract.mjs`.
