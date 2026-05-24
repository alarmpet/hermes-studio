# Hermes Electron 데스크톱 인스톨러 계획서 검토 및 아키텍처 최적화 제안서

작성일: 2026-05-24
대상 문서: [2026-05-24-electron-desktop-installer.md](file:///c:/Users/amd/hermes/docs/superpowers/plans/2026-05-24-electron-desktop-installer.md)
대상 소스코드:
- [telegram-flow-news-bot.mjs](file:///c:/Users/amd/hermes/telegram-flow-news-bot.mjs)
- [render-youtube-with-tts.mjs](file:///c:/Users/amd/hermes/scripts/render-youtube-with-tts.mjs)

---

## 1. 아키텍처 핵심 리스크 분석

제안된 [2026-05-24-electron-desktop-installer.md](file:///c:/Users/amd/hermes/docs/superpowers/plans/2026-05-24-electron-desktop-installer.md) 계획서는 Hermes를 Telegram 의존적 봇에서 독립적인 데스크톱 저작 도구로 확장하기 위한 상세한 기능과 흐름을 잘 정의하고 있습니다. 그러나 **타겟 사용자 PC 배포(Distribution) 관점**에서 볼 때 다음과 같은 몇 가지 치명적인 리스크가 식별되었습니다.

### 1-1. 파이썬(Python) 런타임 및 의존성 지옥 (Dependency Hell)
* **리스크**: 유튜브 업로드(`youtube_upload.py`), OAuth 인증(`youtube_auth.py`), 메타데이터 정제(`youtube_meta.py`), Pillow 및 OpenCV 기반 썸네일 가공(`youtube_thumbnail.py`) 등을 모두 파이썬으로 구현하도록 설계되어 있습니다.
* **영향**: 사용자의 다른 Windows PC에 배포할 때, 사용자는 Node.js 패키지뿐만 아니라 **파이썬 인터프리터 설치, `pip install` 환경 설정, C++ 빌드 도구가 필요한 opencv-python 컴파일 환경 등 매우 무겁고 복잡한 설정**을 거쳐야만 합니다. 이 단계에서 거의 100% 실행 환경 에러가 발생하게 됩니다.

### 1-2. ChatGPT 브라우저 자동화의 불안정성 및 계정 정책 리스크
* **리스크**: 무료 썸네일 생성을 위해 Playwright로 ChatGPT 웹 UI를 띄우고 프롬프트를 타이핑(`automation/chatgpt_image_stroke.mjs`)하여 다운로드하는 방식을 채택했습니다.
* **영향**:
  1. **Cloudflare 보호막 우회 실패**: ChatGPT 웹은 강력한 Cloudflare Turnstile 및 봇 차단 기술을 사용하여 헤드리스/비헤드리스 브라우저 자동화를 쉽게 차단합니다.
  2. **사용 약관(ToS) 위반**: 웹 인터페이스 자동화는 OpenAI의 계정 정지(Ban) 사유입니다.
  3. **UI 변동 취약성**: ChatGPT의 HTML 구조가 미세하게 변경되면 자동화 셀렉터가 깨져 즉시 무력화됩니다.

### 1-3. Electron ASAR 패키징과 하위 프로세스(Spawn) 충돌
* **리스크**: Electron 빌더는 보안과 성능을 위해 코드를 읽기 전용 가상 아카이브 파일인 `app.asar`로 묶어 배포합니다.
* **영향**: Node.js의 `child_process.spawn`으로 `app.asar` 내에 패키징된 `.mjs`나 `.py` 파일(예: `telegram-flow-news-bot.mjs`)을 직접 실행하려고 하면, OS 수준에서 실제 파일 경로를 찾지 못해 경로 오류가 빈번히 발생합니다.

---

## 2. 권장 최적화 및 개선안 (Node.js 네이티브화)

배포 안전성을 극적으로 향상시키고 인스톨러 크기를 줄이기 위해, **파이썬 의존성을 최소화하고 Node.js 환경 내에서 대부분의 연산을 종결하는 구조**로 개선할 것을 강력히 제안합니다.

### 2-1. [개선안 1] 유튜브 API 및 업로드 파이프라인의 JavaScript 네이티브화
유튜브 업로드 및 OAuth 인증에 파이썬 스크립트 대신, 공식 구글 Node.js 라이브러리인 `@googleapis/youtube`를 사용하여 Electron 메인 프로세스 내부에서 직접 처리하도록 전환합니다.
* **효과**: 파이썬 인터프리터, `google-api-python-client` 런타임 설치 요구조건을 완전히 제거합니다.

```javascript
// (예시) Node.js 네이티브 유튜브 업로드
import { google } from "googleapis";

export async function uploadToYouTube(authCredentials, videoPath, metadata) {
  const oauth2Client = new google.auth.OAuth2(
    authCredentials.clientId,
    authCredentials.clientSecret,
    authCredentials.redirectUrl
  );
  oauth2Client.setCredentials(authCredentials.token);

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  
  const response = await youtube.videos.insert({
    part: "snippet,status",
    requestBody: {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.categoryId || "25"
      },
      status: {
        privacyStatus: metadata.privacyStatus || "private",
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true
      }
    },
    media: {
      body: fs.createReadStream(videoPath)
    }
  });
  return response.data;
}
```

### 2-2. [개선안 2] Google Flow를 재활용한 썸네일 생성
* **아이디어**: 이미 봇 내부에 안전하게 구현되어 있고 로그인 프로필이 보존된 **Google Flow를 이미지 생성 모드로 가동**하여 썸네일 소스 이미지를 생성합니다.
* **효과**: 불안정하고 차단 리스크가 높은 ChatGPT 웹 브라우저 자동화 모듈(`chatgpt_image_stroke.mjs`)을 추가 개발할 필요가 없으며, 단일 Chrome 브라우저 프로필과 기존 CDP 코드를 100% 재사용하여 개발 공수를 절반으로 줄입니다.

### 2-3. [개선안 3] Node.js 이미지 라이브러리를 활용한 썸네일 텍스트 합성
* **파이썬 Pillow 대체**: 추출된 프레임이나 Flow 이미지에 텍스트를 입히고 가공하는 작업은 Node.js 진영의 표준 라이브러리인 `sharp` 또는 `@napi-rs/canvas`를 사용해 네이티브 바이너리로 빠르게 수행합니다.
* **파이썬 OpenCV 대체**: 베스트 프레임을 고르는 프레임 스코어링 알고리즘은 Playwright로 비디오를 열고 특정 시간별 스크린샷 캔버스의 대비(Contrast)를 연산하거나, 가벼운 ffmpeg 프레임 추출 명령어로 대체 가능합니다.

### 2-4. [개선안 4] Electron 내에서 작업 러너(Job Runner) 인프로세스(In-Process) 실행
* 스폰(Spawn) 방식 대신 Electron 메인 스크립트에서 `import { runYouTubeJob } from "../youtube-job-runner.mjs"`를 직접 실행합니다.
* **효과**: 하위 노드 프로세스를 여러 개 띄우지 않아 메모리 점유율이 획기적으로 낮아지며, ASAR 패키징 경로 꼬임 문제를 원천 차단합니다. (Telegram 워커만 필요시 독립 프로세스로 구동)

### 2-5. [개선안 5] 동적 SQLite 파일 위치 제어
* 데이터베이스 파일 `bot_data.db` 및 Python 데이터베이스 헬퍼(`bot_db_helper.py`)는 Electron 실행 경로에 구애받지 않도록 `HERMES_DB_PATH` 환경 변수나 CLI 인자로 DB 파일 경로를 넘겨받아 `%APPDATA%/Hermes/bot_data.db` 위치에 안전하게 보존하도록 변경합니다.

---

## 3. 요약 및 권장 단계

제안서의 세부 구현 계획을 실천하되, 다음 아키텍처 로드맵을 먼저 반영하여 구현하는 것을 권장합니다.

1. **Node.js 네이티브 유튜브 패키지 설치**: `googleapis`를 `package.json`에 추가하고 파이썬 인증/업로드 로직을 제거하여 런타임 간소화.
2. **Google Flow를 이용한 썸네일 생성**: `generateFlowMedia(..., "image", ...)`로 썸네일 배경 추출 및 `sharp`를 이용한 로컬 텍스트 오버레이.
3. **ASAR 언팩 설정**: `electron-builder` 설정 시 Supertonic 호출용 파이썬 스크립트와 실행 경로(`DB_HELPER` 등)를 `asarUnpack` 항목에 지정하여 OS 경로 안정성 확보.
4. **인프로세스 임포트**: Electron 메인 스레드 내에서 `runYouTubeJob`을 직접 가져와 실행하도록 연동 구조 간결화.
