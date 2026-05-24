# Hermes Final Video QA and Fix Plan

작성일: 2026-05-24

대상 산출물:

- `C:\Users\amd\hermes\outputs\youtube\1779594807781-8151113796-700001\final-youtube-ai-news-tts-subtitled.mp4`

## 1. 확인 결과 요약

최종 영상은 생성되었지만, 현재 버전은 완성본으로 쓰기 어렵다.

확인된 핵심 문제는 다음 3가지다.

1. **음성 길이와 영상 길이가 맞지 않는다.**
   - 장면 영상 6개: 각 8초
   - 병합 영상: 48.04초
   - TTS 음성: 57.63초
   - 최종 영상: 48.04초
   - 즉, 음성이 영상보다 약 9.6초 길다.

2. **최종 렌더에서 음성이 잘렸다.**
   - 렌더 스크립트가 ffmpeg에 `-shortest` 옵션을 사용했다.
   - `-shortest`는 가장 짧은 스트림 길이에 맞춰 출력을 끝낸다.
   - 그래서 57.63초짜리 TTS 음성이 48.04초 영상 길이에 맞춰 잘렸다.
   - 사용자가 느낀 “영상이 중간에서 끊긴 것 같음”의 직접 원인이다.

3. **자막 싱크가 실제 TTS 기준이 아니다.**
   - `subtitles-ko.srt`는 수동 고정 타임코드다.
   - 마지막 자막은 50초까지 잡혀 있지만 최종 영상은 48.04초다.
   - TTS 실제 발화 타이밍을 측정하지 않고 사람이 임의로 `[0,6]`, `[6,13]` 식으로 나눈 구조라 음성 싱크와 어긋난다.

## 2. 추가 품질 이슈

### 2-1. 최종 영상 길이 설계 부재

현재 Flow 장면은 무조건 6개 x 8초 = 약 48초다.

반면 TTS 대본은 실제 발화 속도 기준 약 57.63초다.

따라서 다음 중 하나를 반드시 선택해야 한다.

- 음성을 48초 안에 맞춘다.
- 영상을 58초 이상으로 늘린다.
- 장면 수/장면 길이/TTS 속도를 렌더 전에 자동 계산한다.

### 2-2. 장면별 내레이션과 영상 클립 매칭이 느슨하다.

현재는 장면별 비디오 6개를 단순 병합하고, 전체 TTS 음성을 한 번에 입힌다.

이 방식은 구현은 쉽지만 다음 문제가 생긴다.

- 1번 장면 자막이 1번 클립 길이와 자연스럽게 맞는지 보장하지 못한다.
- 긴 문장이 짧은 장면에 걸리면 자막과 화면 전환이 어긋난다.
- TTS가 예상보다 느리면 뒤쪽 문장이 영상 끝에서 잘린다.

### 2-3. 자막 생성 방식이 임시 구현이다.

현재 자막은 Whisper 기반 정렬이나 TTS duration 기반 분배가 아니다.

정확한 방식은 둘 중 하나다.

- TTS WAV를 Whisper로 다시 분석해 실제 발화 타임코드로 SRT 생성
- 문장별 TTS를 각각 생성하고 각 WAV 길이에 맞춰 scene별 자막 생성

## 3. 원인 분석

### Root Cause A: 렌더 기준 시간이 영상 기준으로 고정됨

렌더 스크립트는 먼저 6개 scene mp4를 단순 concat으로 붙인다.

그 결과 영상 길이는 48.04초로 고정된다.

그 다음 57.63초 TTS WAV를 얹으면서 `-shortest`를 사용한다.

결과적으로 최종 파일은 영상 기준 48.04초에서 종료된다.

### Root Cause B: TTS 생성 전에 목표 길이 검증이 없다.

대본을 만든 뒤 TTS를 생성하지만, 생성된 WAV 길이를 영상 길이와 비교하는 검증 단계가 없다.

필요한 검증:

```text
if audioDuration > videoDuration:
  fail fast or extend video
if subtitleEnd > finalDuration:
  fail fast
```

현재는 이 검증 없이 바로 렌더한다.

### Root Cause C: 자막 타임코드가 실제 음성에서 파생되지 않는다.

`subtitles-ko.srt`의 타임코드는 수동 배열이다.

실제 Supertonic TTS가 각 문장을 몇 초에 발화하는지 측정하지 않는다.

그래서 자막과 음성은 구조적으로 어긋날 수밖에 없다.

## 4. 수정 방향

추천 방향은 **scene 단위 렌더 파이프라인**이다.

전체 TTS를 한 번에 만든 뒤 전체 영상에 얹는 방식이 아니라, 다음처럼 처리한다.

1. scene별 narration을 분리한다.
2. scene별 TTS WAV를 생성한다.
3. 각 scene WAV의 실제 길이를 측정한다.
4. 각 scene video를 WAV 길이에 맞춰 늘리거나 줄인다.
5. scene별 자막을 WAV 길이에 맞춰 생성한다.
6. scene별 완성 mp4를 만든다.
7. 마지막에 scene mp4들을 concat한다.

이렇게 하면 자막, 음성, 영상 길이가 같은 단위에서 잠긴다.

## 4-1. 영상 프롬프트 생성 원칙

영상 프롬프트는 단순히 사용자가 입력한 키워드만 넣어서 만들면 안 된다.

올바른 방식은 **대본의 각 문장 또는 장면 단위 맥락을 읽고, 그 문장이 전달하려는 핵심 의미를 시각화하는 것**이다.

현재 목표 구조는 다음과 같다.

```text
사용자 키워드/URL
→ 전체 주제와 관점 결정
→ 대본 생성
→ 대본을 scene 단위로 분리
→ 각 scene의 핵심 키워드/감정/시각 대상 추출
→ Google Flow용 영상 프롬프트 생성
```

예를 들어 대본 문장이 다음과 같다면:

```text
AI는 챗봇을 넘어 업무 자동화, 영상 제작, 검색, 코딩 도구까지 확장되고 있습니다.
```

프롬프트는 단순히 `AI news video`가 아니라 아래처럼 만들어야 한다.

```text
9:16 vertical cinematic news video, modern office and creative studio montage,
AI tools assisting with workflow automation, video editing, search interfaces,
and coding dashboards, realistic lighting, smooth camera motion,
no readable text, no logos, no subtitles, no watermark.
```

즉, 한 문장에서 다음 정보를 뽑아야 한다.

- 핵심 주체: AI
- 행동/변화: 챗봇을 넘어 여러 도구로 확장
- 시각 소재: 사무실, 영상 편집 화면, 검색 UI, 코딩 대시보드
- 톤: 최신 뉴스, 현실적, 기술 변화
- 금지 요소: 로고, 읽을 수 있는 글자, 자막, 워터마크

### 프롬프트 생성 규칙

1. **대본 문장과 1:1 또는 1:2로 매칭한다.**
   - 한 scene은 하나의 핵심 메시지를 가져야 한다.
   - 여러 메시지를 한 scene에 넣으면 Flow가 장면을 흐리게 만든다.

2. **문장 안의 명사를 그대로 나열하지 않고 시각적 장면으로 바꾼다.**
   - `저작권, 개인정보, 가짜 정보 문제` → `analysts reviewing risk dashboards, privacy shields, misinformation alerts`
   - `업무 자동화` → `office workers using AI workflow dashboards`

3. **전체 영상 톤은 유지한다.**
   - 모든 scene에 공통 스타일을 넣는다.
   - 예: `realistic cinematic editorial visuals, polished lighting, smooth camera motion`

4. **장면 간 연결성을 유지한다.**
   - scene 1은 훅/도입
   - scene 2~4는 변화/사례
   - scene 5는 리스크
   - scene 6은 결론/시청자 질문

5. **자막이나 글자는 Flow 영상에 맡기지 않는다.**
   - 영상 프롬프트에는 항상 `no readable text, no subtitles, no logos, no watermarks`를 넣는다.
   - 자막은 ffmpeg 단계에서 별도로 굽는다.

6. **사람 얼굴/브랜드/실존 기업 로고는 조심한다.**
   - 뉴스 주제라도 특정 기업 로고를 직접 생성하지 않는다.
   - `generic AI lab`, `modern tech office`, `abstract search interface`처럼 안전한 표현을 쓴다.

### 개선할 데이터 구조

기존 `scenes` 구조에 `keywords`, `visual_intent`, `mood`, `negative_prompt`를 추가한다.

```json
{
  "order": 1,
  "narration": "오늘은 최신 AI 뉴스 흐름을 빠르게 정리해보겠습니다.",
  "keywords": ["AI news", "technology update", "host intro"],
  "visual_intent": "뉴스 도입부. 진행자가 최신 AI 흐름을 소개하는 느낌.",
  "mood": "clear, energetic, professional",
  "image_prompt": "9:16 vertical cinematic tech news intro, friendly presenter in a modern studio, abstract AI network visuals in the background, realistic lighting, smooth camera motion, no readable text, no logos, no subtitles, no watermark",
  "negative_prompt": "readable text, subtitles, logos, watermark, distorted face",
  "duration_seconds": 8
}
```

### 프롬프트 생성 단계에서 LLM에 줄 지시문

YouTube draft 생성 프롬프트에는 다음 지시를 추가해야 한다.

```text
For each scene, derive the visual prompt from the narration sentence.
Extract the sentence's core meaning, key entities, visual subjects, emotional tone,
and transition role in the story. Do not make generic prompts.
Each prompt must visualize what the narration is saying at that moment.
Keep visual continuity across scenes.
Use English for image_prompt.
Always include: 9:16 vertical, realistic cinematic editorial style, smooth camera motion,
no readable text, no logos, no subtitles, no watermark.
```

### 좋은 프롬프트와 나쁜 프롬프트

나쁜 예:

```text
AI news, futuristic city, technology.
```

문제:

- 대본 문장과 연결이 약하다.
- 어떤 장면인지 불명확하다.
- Flow가 일반적인 기술 배경만 만들 가능성이 높다.

좋은 예:

```text
9:16 vertical cinematic editorial video, office workers using AI workflow dashboards
to automate repetitive tasks, subtle holographic interface overlays,
realistic modern workplace, smooth dolly camera motion, polished lighting,
no readable text, no logos, no subtitles, no watermark.
```

장점:

- 대본의 “업무 자동화” 의미를 시각적으로 반영한다.
- 장면 대상이 명확하다.
- 영상 스타일과 금지 조건이 포함되어 있다.

## 5. 구현 계획

### Task 1: 미디어 duration 측정 유틸 추가

파일:

- 생성: `scripts/media-probe.mjs`

기능:

- ffmpeg stderr에서 duration 파싱
- `ffprobe`가 사용 가능한 환경이면 `ffprobe` JSON 출력을 우선 사용
- 현재 Hermes에는 `ffmpeg-static`이 설치되어 있으므로 기본 구현은 `ffmpeg-static` 기반으로 둔다
- video/audio/subtitle 파일 길이 확인
- JSON으로 반환

검증:

```powershell
node .\scripts\media-probe.mjs .\outputs\youtube\1779594807781-8151113796-700001\narration.wav
```

기대:

```json
{"duration":57.63}
```

반영 근거:

- 리뷰 문서의 `media-probe.mjs` 분리 제안은 타당하다.
- 다만 현재 설치된 것은 `ffmpeg-static`이며 `ffprobe` 존재가 보장되지 않으므로, 계획은 `ffmpeg-static` 기반 duration 파서를 기본으로 하고 `ffprobe`는 선택적 개선으로 둔다.

### Task 2: 렌더 전 타임라인 검증 추가

파일:

- 수정: `scripts/render-youtube-with-tts.mjs`

추가할 검증:

- scene 영상 총합 계산
- TTS WAV duration 계산
- SRT 마지막 종료 시간 계산
- 불일치 시 렌더 중단

규칙:

```text
audioDuration <= videoDuration + 0.5
subtitleEnd <= videoDuration + 0.5
```

현재 산출물은 이 검증에서 실패해야 한다.

### Task 3: 문장별 TTS 생성 방식으로 변경

파일:

- 수정: `scripts/render-youtube-with-tts.mjs`
- 생성: `scripts/make-scenes-tts.py`

변경:

- 전체 대본 하나로 `narration.wav` 생성하지 않기
- scene별 `scene_01.wav`, `scene_02.wav` 생성
- 각 WAV duration을 측정
- Python 프로세스를 문장마다 새로 띄우지 않기
- `scripts/make-scenes-tts.py`에서 `Supertonic3Engine`을 한 번만 생성하고, 같은 프로세스 안에서 모든 scene WAV를 일괄 생성
- 결과 JSON에 `order`, `audio_path`, `duration`, `text`를 기록

결과:

```text
scene_1.mp4 + scene_1.wav
scene_2.mp4 + scene_2.wav
...
```

이유:

- Supertonic TTS 모델 로딩 비용이 크다.
- scene마다 `python make_tts.py`를 새로 실행하면 모델 로딩이 반복되어 렌더 시간이 불필요하게 길어진다.
- 배치 TTS 방식은 모델을 한 번만 로드하므로 scene 단위 렌더 구조와 잘 맞는다.

초안 구조:

```python
# scripts/make-scenes-tts.py
import json
import sys
from pathlib import Path

TTS_ROOT = Path("C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts")
sys.path.insert(0, str(TTS_ROOT / "src"))

from supertonic3_engine import Supertonic3Engine


def main():
    job_dir = Path(sys.argv[1])
    scenes_path = Path(sys.argv[2])
    scenes = json.loads(scenes_path.read_text(encoding="utf-8"))

    engine = Supertonic3Engine(output_dir=job_dir)
    results = []

    for scene in scenes:
        order = int(scene["order"])
        out_wav = job_dir / f"scene_{order}.wav"
        info = engine.synthesize_to_file(
            text=scene["narration"],
            output_path=out_wav,
            voice="M1",
            lang="ko",
            speed=1.08,
            total_step=8,
            max_chunk_length=130,
            silence_duration=0.25,
            verbose=False,
        )
        results.append({
            "order": order,
            "audio_path": str(out_wav),
            "duration": info.get("duration", 0),
            "text": scene["narration"],
        })

    print(json.dumps({"ok": True, "scenes": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

### Task 4: scene 영상을 음성 길이에 맞춰 보정

파일:

- 수정: `scripts/render-youtube-with-tts.mjs`

정책:

- scene WAV가 8초보다 짧으면 기존 8초 영상 유지
- scene WAV가 8초보다 길면 해당 scene 영상을 `tpad` 또는 마지막 프레임 freeze로 연장
- 영상이 너무 길면 `trim`하지 않고 음성 기준으로 유지
- 단, 음성/영상 차이가 작을 때는 무조건 freeze하지 않는다
- 차이가 작은 경우에는 영상 속도를 약간 조정하고, 차이가 큰 경우에만 마지막 프레임 freeze를 사용한다

ffmpeg 방향:

```text
-vf "tpad=stop_mode=clone:stop_duration=<needed>"
```

보정 정책:

```text
ratio = audioDuration / videoDuration

if 0.90 <= ratio <= 1.20:
  use setpts to make video duration close to audio duration
else if ratio > 1.20:
  keep original playback speed and extend tail with tpad freeze
else:
  keep video length or trim only if scene-level QA confirms no visual loss
```

이유:

- `tpad`만 쓰면 긴 음성 뒤쪽에서 정지 화면이 길게 보일 수 있다.
- 작은 차이는 `setpts` 기반 속도 보정이 더 자연스럽다.
- 큰 차이는 속도 보정으로 해결하면 영상이 지나치게 느려져 어색하므로 freeze가 낫다.
- 최종 구현에서는 scene별 duration 차이와 보정 방식을 로그에 남겨 QA에서 확인한다.

### Task 5: scene별 SRT 생성

파일:

- 수정: `scripts/render-youtube-with-tts.mjs`

방식:

- scene별 자막은 해당 scene 시작 시간부터 scene WAV duration까지 표시
- 긴 문장은 2줄 이하로 wrap
- 전체 SRT는 scene별 누적 duration으로 생성

예:

```srt
1
00:00:00,000 --> 00:00:06,820
오늘은 최신 AI 뉴스 흐름을
빠르게 정리해보겠습니다.
```

### Task 6: 최종 렌더에서 `-shortest` 제거 또는 안전화

파일:

- 수정: `scripts/render-youtube-with-tts.mjs`

정책:

- scene별로 이미 audio/video 길이를 맞춘 뒤 concat한다.
- 최종 합성에서는 `-shortest`에 의존하지 않는다.
- 부득이하게 사용할 경우, 직전 duration 검증을 통과한 경우에만 사용한다.
- 최종 출력 직전 `videoDuration`, `audioDuration`, `subtitleEnd`를 다시 측정한다.
- 세 값의 차이가 0.5초를 넘으면 최종 파일을 만들지 않고 실패 처리한다.

### Task 7: 후처리 QA 자동화

파일:

- 생성: `scripts/check-rendered-video.mjs`

검증 항목:

- 최종 영상 duration
- 최종 오디오 duration
- SRT 마지막 종료 시간
- duration 차이 0.5초 이하
- 마지막 3초 프레임 추출 가능 여부
- 최종 파일 크기 1MB 이상

검증 명령:

```powershell
node .\scripts\check-rendered-video.mjs .\outputs\youtube\<jobId>\final.mp4
```

### Task 8: Telegram 최종확정 후 자동 렌더 연결

파일:

- 수정: `telegram-flow-news-bot.mjs`

기능:

- YouTube workflow가 scene 영상 생성까지 완료되면 job metadata에 `draft`, `jobDir`, `scene files`를 저장한다.
- 사용자가 같은 채팅에서 `최종확정`을 보내면 최신 YouTube job을 찾는다.
- `scripts/render-youtube-with-tts.mjs <jobDir>`를 실행한다.
- 렌더 완료 후 최종 mp4를 Telegram으로 전송한다.
- 실패하면 `task_events`에 실패 단계와 stderr 요약을 기록하고 사용자에게 원인 메시지를 보낸다.

주의:

- `최종확정`은 일반 작업에 무조건 반응하면 안 된다.
- 최근 job의 `taskName`이 `youtube-workflow`이고, `jobDir` 안에 scene mp4가 존재할 때만 실행한다.
- 이미 최종 렌더가 존재하면 재렌더 여부를 명확히 묻거나 `재렌더` 명령에서만 덮어쓴다.

반영 근거:

- 리뷰 문서의 Telegram bot 통합 제안은 최종 사용자 흐름 측면에서 타당하다.
- 다만 1차 수정의 핵심 원인은 렌더 타임라인이므로, 자동 렌더 연결은 scene별 렌더 안정화 후 별도 작업으로 둔다.

## 6. 즉시 재렌더 임시 해결책

빠른 재렌더만 원하면 다음 임시 방식이 가능하다.

1. 기존 48초 영상에 마지막 프레임을 약 10초 연장한다.
2. 57.63초 TTS 전체 음성을 그대로 사용한다.
3. SRT 타임코드를 57.63초 기준으로 다시 분배한다.
4. `-shortest`를 제거하거나 영상 길이를 음성보다 길게 만든다.

장점:

- 빠르게 최종본을 다시 만들 수 있다.

단점:

- 장면별 싱크는 여전히 완벽하지 않다.
- 후반부가 정지 화면처럼 보일 수 있다.

## 7. 권장 재작업 순서

1. 지금 산출물은 폐기하지 말고 QA 기준 샘플로 보존한다.
2. 임시 재렌더로 “안 끊기는 버전”을 먼저 만든다.
3. 이후 scene별 TTS 방식으로 구조를 고친다.
4. 최종적으로 Flow 생성 단계부터 `scene.narration`, `scene.prompt`, `scene.duration`을 하나의 단위로 관리한다.

## 8. 결론

현재 문제는 Flow 영상 생성 실패가 아니라 **렌더 타임라인 조립 실패**다.

정확한 원인은 다음이다.

- 영상 총 길이: 48.04초
- TTS 음성 길이: 57.63초
- 최종 렌더 옵션: `-shortest`
- 자막: 수동 고정 타임코드

따라서 다음 버전은 “전체 영상 + 전체 음성” 방식이 아니라 “scene별 영상 + scene별 음성 + scene별 자막” 방식으로 바꿔야 한다.
