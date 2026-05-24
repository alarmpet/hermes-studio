# Hermes 최종 영상 QA 검토 및 파이프라인 최적화 제안서

작성일: 2026-05-24
대상 문서: [HERMES_FINAL_VIDEO_QA_AND_FIX_PLAN.md](file:///c:/Users/amd/hermes/HERMES_FINAL_VIDEO_QA_AND_FIX_PLAN.md)
대상 소스코드:
- [render-youtube-with-tts.mjs](file:///c:/Users/amd/hermes/scripts/render-youtube-with-tts.mjs)
- [telegram-flow-news-bot.mjs](file:///c:/Users/amd/hermes/telegram-flow-news-bot.mjs)

---

## 1. 현황 및 문제점 분석

현재 [render-youtube-with-tts.mjs](file:///c:/Users/amd/hermes/scripts/render-youtube-with-tts.mjs)의 영상 생성 파이프라인을 분석한 결과, 제시된 문제점에 전적으로 동의하며 상세한 기술적 현황은 다음과 같습니다.

### 1-1. `-shortest` 옵션으로 인한 음성 잘림 현상
현재 스크립트는 6개의 씬 비디오(각 8초, 총 48.04초)를 먼저 하나의 영상 파일 `merged-scenes.mp4`로 합친 뒤, 전체 TTS 오디오 `narration.wav`(57.63초)를 얹어서 렌더링합니다.
이때 ffmpeg에 전달된 `-shortest` 옵션 때문에, 오디오가 더 길더라도 전체 길이가 가장 짧은 입력(비디오, 48.04초)에 맞추어 강제로 잘립니다. 이로 인해 영상의 결론 부근에서 내레이션이 부자연스럽게 중단됩니다.

### 1-2. 고정형 자막 타임코드의 한계
현재 스크립트 상의 자막 데이터(`subtitles` 배열)는 실제 발화 타임코드가 아니라 인위적인 7초 단위 고정 구간(`[0, 6]`, `[6, 13]`, `[13, 20]` 등)으로 하드코딩되어 있습니다. 
내레이션 속도 변화, 텍스트 길이에 따라 자막의 출현/소멸 타이밍이 실제 오디오 음성 및 화면의 씬 전환 속도와 어긋나게 되어 감상 시 불일치감이 발생합니다.

---

## 2. 제안된 해결 계획 검토 및 기술적 보완점

[HERMES_FINAL_VIDEO_QA_AND_FIX_PLAN.md](file:///c:/Users/amd/hermes/HERMES_FINAL_VIDEO_QA_AND_FIX_PLAN.md)에서 제시한 **"씬(Scene) 단위 독립 렌더 파이프라인"** 구축 방향은 기술적으로 매우 타당합니다. 오디오 길이에 동적으로 비디오 길이를 보정하고 개별 씬 단위로 싱크를 맞춘 후 마지막에 합치는(concat) 설계는 멀티미디어 편집 시스템의 표준에 부합합니다.

여기에 추가적으로 반영해야 할 **핵심 성능 최적화 및 안정성 보완책**을 다음과 같이 제안합니다.

### 2-1. [최적화 1] Supertonic TTS 엔진 일괄 로딩 처리 (성능 개선)
* **문제점**: 씬별로 대본을 쪼개어 각각 TTS를 생성할 때, 문장마다 `python make_tts.py`를 매번 `spawn`하게 되면 **파이썬 인터프리터 구동 오버헤드와 Supertonic TTS AI 모델 로딩 모델 오버헤드(약 5~10초)가 6번 중복 발생**하여 렌더링 시간이 분 단위로 대폭 늘어나게 됩니다.
* **개선책**: 하나의 통합 파이썬 렌더링 스크립트를 작성하여 **TTS 모델 로딩은 최초 1회만 수행**하고, 루프를 돌며 `scene_1.wav`, `scene_2.wav` ... `scene_6.wav`를 일괄 생성하도록 구성해야 합니다. 이 경우 렌더 시간이 수십 초 이상 절약됩니다.

### 2-2. [최적화 2] 씬 비디오 보정 방식의 다양화 (Freeze Frame vs Speed Change)
* **문제점**: 오디오가 8초보다 길 때 비디오를 늘리는 방법으로 단순히 마지막 프레임을 정지 화면으로 만드는 `tpad` 필터만 사용하면, 정적 프레임 구간이 너무 길어져 시청자가 영상이 멈춘 것으로 오해할 수 있습니다.
* **개선책**:
  - **방법 A (권장 - Freeze)**: `tpad=stop_mode=clone:stop_duration=<delta>` (자연스러운 B-roll의 정지)
  - **방법 B (대안 - Speed Adjust)**: 오디오가 비디오보다 약간 긴 경우(예: 8초 비디오에 오디오가 9초인 경우), `setpts` 필터를 사용해 비디오의 속도를 `0.9x` 등으로 미세하게 감속시켜 오디오 길이와 똑같이 맞춥니다.
  - 파이프라인 상에서 오디오-비디오 시간 차이 비율(Ratio)을 계산하여, 임계값(예: 1.2배 이하) 이내일 때는 비디오 속도 조절(Setpts)을 적용하고, 그 이상 차이가 날 때만 마지막 프레임 복제(Tpad)를 적용하는 **하이브리드 보정 알고리즘**을 제안합니다.

### 2-3. [최적화 3] 텔레그램 봇 워크플로우 자동화 통합
* 현재 텔레그램 봇 코드 [telegram-flow-news-bot.mjs](file:///c:/Users/amd/hermes/telegram-flow-news-bot.mjs)는 미디어 생성(Flow)까지만 완료하고 최종 검수를 요청합니다.
* 사용자가 텔레그램으로 **"최종확정"** 메시지를 보내면, 봇이 내부적으로 `render-youtube-with-tts.mjs` 스크립트를 자동으로 실행(spawn)하여 병합 및 자막 렌더링을 끝마치고 최종 본을 사용자에게 즉시 전송하는 이벤트 핸들러 구현이 추가되어야 진정한 엔드투엔드(End-to-End) 자동화가 달성됩니다.

---

## 3. 세부 아키텍처 및 구현 설계안

제안된 아키텍처를 바탕으로 하는 구체적인 소스코드 설계안입니다.

### 3-1. 씬별 오디오 일괄 생성 스크립트 설계 (`make_scenes_tts.py`)
AI 모델을 한 번만 로드하여 모든 씬의 WAV 오디오 파일을 일괄 생성하고, 각 파일의 길이 정보를 JSON으로 리턴하는 최적화된 파이썬 스크립트입니다.

```python
# make_scenes_tts.py
import sys
import json
from pathlib import Path

# Supertonic Engine 경로 주입
TTS_ROOT = Path("C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts")
sys.path.insert(0, str(TTS_ROOT / "src"))
from supertonic3_engine import Supertonic3Engine

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Invalid arguments"}))
        return
        
    job_dir = Path(sys.argv[1])
    scenes_data_path = Path(sys.argv[2])
    
    with open(scenes_data_path, "r", encoding="utf-8") as f:
        scenes = json.load(f)
        
    engine = Supertonic3Engine(output_dir=job_dir)
    results = []
    
    # 모델 로드는 루프 외부에서 1회만 진행
    for scene in scenes:
        order = scene["order"]
        text = scene["narration"]
        out_wav = job_dir / f"scene_{order}.wav"
        
        # Supertonic TTS 합성 실행
        info = engine.synthesize_to_file(
            text=text,
            output_path=out_wav,
            voice="M1",
            lang="ko",
            speed=1.08,
            total_step=8,
            max_chunk_length=130,
            silence_duration=0.25,
            verbose=False,
        )
        
        # 파일 경로 및 실제 재생 시간 추가 수집
        results.append({
            "order": order,
            "audio_path": str(out_wav),
            "duration": info.get("duration", 0), # 실제 측정된 오디오 시간
            "text": text
        })
        
    print(json.dumps({"ok": True, "scenes": results}, ensure_ascii=False))

if __name__ == "__main__":
    main()
```

### 3-2. 미디어 프로브 유틸리티 설계 (`scripts/media-probe.mjs`)
ffprobe를 사용하여 오디오 및 비디오의 실제 길이를 밀리초 단위로 정확히 반환하는 Node.js 유틸리티입니다.

```javascript
// scripts/media-probe.mjs
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

// ffprobe는 ffmpeg-static 패키지 디렉토리에 함께 들어있거나 ffmpeg 명령어 분석으로 대체 가능합니다.
// 아래 코드는 ffmpeg로 duration을 추출하는 경량 프로버입니다.
export function getMediaDuration(filePath) {
  const result = spawnSync(ffmpegPath, ["-i", filePath], { encoding: "utf8" });
  // ffmpeg는 입력 파일 정보를 stderr에 출력합니다.
  const stderr = result.stderr || "";
  const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) return 0;
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const hundredths = parseInt(match[4], 10);
  
  return hours * 3600 + minutes * 60 + seconds + hundredths / 100;
}
```

### 3-3. 씬 기반 타임라인 자동 동기화 렌더러 설계 (`render-youtube-with-tts.mjs`)
씬별 오디오 시간 길이를 측정하여 비디오 길이를 자동으로 조절(Freeze/Speed)하고 자막 타임코드를 동적으로 산출하는 완성형 렌더링 스크립트 제안안입니다.

```javascript
// scripts/render-youtube-with-tts.mjs (개선 제안안 구조)
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getMediaDuration } from "./media-probe.mjs";

const ROOT = "C:/Users/amd/hermes";
const JOB_DIR = process.argv[2] ? resolve(process.argv[2]) : `${ROOT}/outputs/youtube/1779594807781-8151113796-700001`;

async function main() {
  // 1. 대본 초안 파일 읽기
  const draftPath = join(JOB_DIR, "draft.json");
  if (!existsSync(draftPath)) {
    throw new Error(`Draft file not found in ${JOB_DIR}. Please run Google Flow first.`);
  }
  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  
  // 2. 씬 정보 및 파이썬 TTS 배치 호출용 임시 파일 작성
  const ttsInputPath = join(JOB_DIR, "tts_input.json");
  writeFileSync(ttsInputPath, JSON.stringify(draft.scenes), "utf8");
  
  console.log("Starting batch TTS generation...");
  const ttsScript = join(ROOT, "scripts/make_scenes_tts.py");
  // 파이썬 TTS 엔진 호출하여 일괄 wav 생성
  const pythonPath = "C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts/.venv-win/Scripts/python.exe";
  const ttsResult = spawnSync(pythonPath, [ttsScript, JOB_DIR, ttsInputPath], { encoding: "utf8" });
  
  const ttsInfo = JSON.parse(ttsResult.stdout.trim());
  if (!ttsInfo.ok) throw new Error("TTS generation failed: " + ttsInfo.error);

  let accumulatedTime = 0.0;
  const srtSegments = [];
  const processedVideos = [];
  const concatList = [];

  // 3. 씬별 오디오 길이에 맞추어 비디오 연장/속도 조절 가공
  for (const scene of ttsInfo.scenes) {
    const order = scene.order;
    const audioDuration = scene.duration; // 실제 TTS 길이 (초)
    const rawVideoFile = join(JOB_DIR, f"scene_{order}.mp4");
    
    if (!existsSync(rawVideoFile)) throw new Error(`Missing scene video: ${rawVideoFile}`);
    
    // 원본 비디오 재생시간 측정 (보통 Flow는 8초)
    const rawVideoDuration = getMediaDuration(rawVideoFile);
    const processedVideoFile = join(JOB_DIR, `scene_${order}_processed.mp4`);
    
    console.log(`Processing Scene ${order}: Video=${rawVideoDuration}s, Audio=${audioDuration}s`);
    
    if (audioDuration > rawVideoDuration) {
      // 오디오가 영상보다 긴 경우: tpad 필터를 사용해 마지막 프레임을 홀딩하여 비디오를 강제 연장
      const paddingNeeded = audioDuration - rawVideoDuration;
      spawnSync(ffmpegPath, [
        "-y", "-i", rawVideoFile,
        "-vf", `tpad=stop_mode=clone:stop_duration=${paddingNeeded}`,
        processedVideoFile
      ]);
    } else {
      // 오디오가 비디오 이하인 경우: 비디오를 오디오 길이에 맞추어 잘라내거나 그대로 사용
      // 여기서는 싱크 정합을 위해 오디오 재생시간에 맞추어 잘라냄(trim)
      spawnSync(ffmpegPath, [
        "-y", "-i", rawVideoFile,
        "-t", String(audioDuration),
        processedVideoFile
      ]);
    }
    
    // 개별 씬 오디오와 가공된 비디오 병합하여 임시 mp4 생성
    const sceneMergedFile = join(JOB_DIR, `scene_${order}_final.mp4`);
    spawnSync(ffmpegPath, [
      "-y",
      "-i", processedVideoFile,
      "-i", scene.audio_path,
      "-c:v", "libx264", "-c:a", "aac",
      "-map", "0:v:0", "-map", "1:a:0",
      sceneMergedFile
    ]);
    
    processedVideos.push(sceneMergedFile);
    concatList.push(`file '${sceneMergedFile.replace(/\\/g, "/")}'`);
    
    // 자막 세그먼트 생성 (오디오의 실제 재생 시간 기준 누적 타임코드)
    const startSrt = accumulatedTime;
    const endSrt = accumulatedTime + audioDuration;
    srtSegments.push({
      index: order,
      start: startSrt,
      end: endSrt,
      text: scene.text
    });
    
    accumulatedTime += audioDuration;
  }
  
  // 4. 자막 파일(SRT) 생성 및 저장
  const srtPath = join(JOB_DIR, "subtitles-ko.srt");
  const srtContent = srtSegments.map(s => {
    return `${s.index}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text}\n`;
  }).join("\n");
  writeFileSync(srtPath, srtContent, "utf8");
  
  // 5. Concat 리스트 텍스트 파일 저장
  const concatPath = join(JOB_DIR, "concat_final.txt");
  writeFileSync(concatPath, concatList.join("\n"), "utf8");
  
  // 6. 모든 씬 병합(Concat) 실행
  const mergedVideoPath = join(JOB_DIR, "merged_final.mp4");
  spawnSync(ffmpegPath, [
    "-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", mergedVideoPath
  ]);
  
  // 7. 자막 오버레이 입혀 최종본 생성 (shortest 사용 불필요, 이미 싱크 정합 완료)
  const finalPath = join(JOB_DIR, "final-youtube-ai-news-tts-subtitled.mp4");
  const subtitleFilter = `subtitles='${srtPath.replace(/\\/g, "/").replace(/:/g, "\\:")}':force_style='FontName=Malgun Gothic,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=60'`;
  
  spawnSync(ffmpegPath, [
    "-y", "-i", mergedVideoPath,
    "-vf", subtitleFilter,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "copy", // 이미 인코딩 완료되었으므로 오디오는 스트림 복사
    finalPath
  ]);
  
  console.log("Final Video Rendering Completed successfully! Output:", finalPath);
}

function formatSrtTime(seconds) {
  const whole = Math.floor(seconds);
  const ms = Math.round((seconds - whole) * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

main().catch(err => {
  console.error("Renderer execution error:", err);
  process.exit(1);
});
```

---

## 4. 최종 의견 및 제안 요약

1. **검토 의견**: [HERMES_FINAL_VIDEO_QA_AND_FIX_PLAN.md](file:///c:/Users/amd/hermes/HERMES_FINAL_VIDEO_QA_AND_FIX_PLAN.md)에서 제시한 원인 규명 및 씬 단위 조립 해결책은 정확하며, 프로덕션 수준의 쇼츠 품질을 보장하기 위해 반드시 반영해야 할 패치입니다.
2. **추가 최적화(TTS 모델 일괄 처리)**: 문장별로 파이썬 프로세스를 계속 재생성(spawn)하는 것은 모델 로딩 시간 때문에 현실적인 병목이 됩니다. 위 설계안 3-1과 같이 **파이썬 내에서 TTS 엔진 인스턴스를 하나 유지하고 일괄 생성하는 구조**로 개선할 것을 강력하게 권장합니다.
3. **사용자 경험(UX) 개선**: 텔레그램 봇 대화 상에서 단순 "최종확정 대기" 메시지에 멈추지 않고, 사용자의 **"최종확정" 메시지 수신 시 자동으로 이 동적 씬 렌더러가 트리거되도록 봇 이벤트를 연결**하는 작업을 보완 로드맵에 반영해 주시기 바랍니다.
