# Cockpit

Cockpit은 프로젝트의 `PROGRESS.md` 파일을 읽어 브라우저에서 실시간으로 시각화해 주는 초경량 로컬 프로젝트 대시보드(Map-first Thin PM Cockpit)입니다.

프로젝트 상태를 일반 마크다운(Markdown)으로 작성해 두면, Cockpit이 이를 파싱하여 구조화된 프로젝트 지도, 현재 상황 및 다음 전환, 영역별 상세 검사기(Inspector)를 제공합니다.

---

## 1. 사용 전 준비사항

- **Node.js**: Vite 7 툴체인 호환 버전 (`^20.19.0` 또는 `>=22.12.0`, npm 포함)
- **Git**: npm의 GitHub 패키지 설치 시 필요

---

## 2. 설치 및 업데이트 방법

GitHub 저장소(`main` 브랜치)에서 직접 전역 설치합니다:

```bash
npm install -g --install-links "github:savior714/cockpit#main"
```

*(최신 버전으로 업데이트할 때도 동일한 명령어를 다시 실행하면 됩니다.)*

---

## 3. 프로젝트 구성 및 실행

### 권장 프로젝트 구조

프로젝트 최상위 루트에 `PROGRESS.md` 파일을 배치하는 것을 권장합니다:

```text
my-project/
├── ...
└── PROGRESS.md
```

### 실행하기

프로젝트 루트 디렉터리에서 `cockpit` 명령어만 입력하면 됩니다:

```bash
cd my-project
cockpit
```

- 기본 브라우저가 자동으로 열리며 대시보드(`http://127.0.0.1:4321`)가 표시됩니다.
- Cockpit은 `127.0.0.1` 루프백 전용으로 바인딩되며 읽기 전용(Read-only)으로 안전하게 동작합니다.

### 다른 경로의 파일 지정하기

다른 위치에 있는 파일이나 다른 이름의 마크다운 파일을 지정할 수도 있습니다:

```bash
cockpit /path/to/another/PROGRESS.md
cockpit ./docs/PROGRESS.md --port 5000 --no-open
```

#### CLI 옵션

- `cockpit [path/to/PROGRESS.md]` — 대상 파일 경로 (생략 시 현재 디렉터리의 `./PROGRESS.md`)
- `--port`, `-p` — 포트 번호 지정 (기본값: `4321`)
- `--no-open` — 브라우저 자동 실행 비활성화
- `--help`, `-h` — 도움말 출력

---

## 4. Cockpit 동작 원리 및 워크플로우

### Cockpit을 켜둔 채 작업하기

1. **자동 새로고침 (Live Reload)**: Cockpit은 대상 `PROGRESS.md` 파일을 감시(watch)합니다. 파일이 저장되면 브라우저를 새로고침하지 않아도 화면이 즉시 업데이트됩니다.
2. **저장소 미침범 & 분석 없음**: Cockpit 자체는 Git 저장소나 코드를 직접 분석하거나 수정하지 않습니다. 모든 상태의 단일 진실 공급원(SSOT)은 `PROGRESS.md` 마크다운 파일 하나뿐입니다.

### 작업 중 PROGRESS.md 갱신하기

Cockpit 자체는 저장소 상태를 직접 검사하거나, PROGRESS.md를 수정하거나, 진척을 자체 추론하거나, 다음 작업을 선정하지 않습니다.

작업을 진행한 뒤 사용자가 직접 외부의 역량 있는 코딩 에이전트(Claude Code, ChatGPT, Gemini 등)에게 다음과 같이 요청하여 `PROGRESS.md`를 갱신합니다:

```text
"이 프로젝트의 기존 PROGRESS.md를 먼저 읽고,
현재 repo/runtime/SSOT의 실제 상태/증거와 대조한 뒤
달라진 부분만 보수적으로 갱신해줘.
미해결된 실질적 문제(남은 문제)들을 누락 없이 보존하고,
확인되지 않은 성공을 성급히 주장하지 마."
```

에이전트가 `PROGRESS.md`를 저장하면, 열려 있는 Cockpit 화면에 즉시 변경사항이 반영됩니다.

---

## 5. PROGRESS.md 핵심 시맨틱

Cockpit v0.3은 프로젝트의 실질적인 진척과 상태를 정확하게 파악할 수 있도록 다음과 같은 시맨틱 구조를 사용합니다:

- **`현재 수준`**: 현재 실제로 수립되었거나 증명된 구현/기능 수준
- **`남은 문제`**: 해당 영역의 실제 상태를 이해하는 데 필요한 실질적 미해결 문제들 (여러 항목이 존재할 수 있으며, 단순히 "다음 목표 1개"를 의미하는 것이 아닙니다. 다음 한정된 목표(Bounded Target)의 선정은 외부 추론 에이전트에게 맥락을 넘긴 후 이루어집니다)
- **`다시 열리는 조건`**: 기존에 안정화되었던 영역을 다시 검토하거나 재작업해야 하는 향후 조건/근거
- **`근거`**: 현재 수준 및 상태 주장을 뒷받침하는 실제 근거나 테스트/운영 결과
- **`다음 전환`**: 프로젝트 차원에서 다음에 일어날 의미 있는 한 단계 전환
- **`이 영역 검토하기`**: 지도에서 영역 카드를 클릭하면 나타나는 우측 검사기(Inspector)의 버튼으로, 외부 추론 에이전트나 모델에 전달할 수 있도록 해당 영역의 맥락과 검토 프롬프트를 원클릭으로 클립보드에 복사합니다.

### 마크다운 섹션 구성

Cockpit은 한국어와 영어 `## h2` 헤딩을 모두 지원합니다:

| 섹션 (한국어) | Section (English) | 패널 설명 |
|---|---|---|
| `## 프로젝트 지도` | `## Project Map` | 궤적/워크플로우 그룹 및 영역 카드 렌더링 |
| `## 영역별 상세` | `## Area Details` | 각 영역의 세부 속성(현재 수준, 남은 문제, 다시 열리는 조건, 근거) |
| `## 현재 상황` / `## 지금` | `## Current Situation` / `## Current Frontier` | 우측 기본 개요: 현재 상황 |
| `## 다음 전환` / `## 다음` | `## Next Transition` / `## Next` | 우측 기본 개요: 다음 전환 |
| `## 직면한 문제` / `## 막힌 것` | `## Facing Issues` / `## Blocked` | 우측 기본 개요: 직면한 문제 |
| `## 제품 목표` / `## 프로젝트 큰 그림` | `## Product Goals` / `## Project Frame` | 하단 맥락 카드 |
| `## 확정된 방향` / `## 이미 정해진 방향` | `## Settled Direction` | 하단 맥락 카드 |
| `## 최근 진척` / `## 최근 완료` | `## Recently Completed` | 하단 맥락 카드 |

*(일반 Mermaid 다이어그램 코드 블록도 지원되며 기존과 동일하게 렌더링됩니다.)*

---

## 6. 개발자 가이드 (Cockpit 소스 코드 수정 시)

Cockpit 소스 코드를 직접 수정하고 빌드하는 경우:

```bash
# 의존성 설치
npm install

# Vite 개발 서버 실행
npm run dev

# 타입 검사 및 프로덕션 빌드 (dist/ 생성)
npm run build

# 로컬 빌드 파일로 실행 테스트
npm run cockpit -- /path/to/PROGRESS.md

# 배포용 tarball 패키징 (사전 빌드 자동 실행)
npm pack
```

### 디렉터리 구조

```text
cockpit/
├── index.html           # 대시보드 HTML 구조 (지도, 개요, 영역 검사기 슬롯)
├── src/
│   ├── main.ts          # 마크다운 파싱, 네이티브 지도 생성, 검사기 상태 제어, SSE 연동
│   └── style.css        # 지도/검사기 반응형 그리드 및 테마 스타일
├── scripts/
│   └── serve.mjs        # 루프백 HTTP 서버 + SSE 파일 변경 감시 CLI
├── docs/operations/
│   ├── DEVELOPMENT.md   # 개발 실행 원칙
│   └── TESTING.md       # 검증 및 증거 기준
├── package.json
└── tsconfig.json
```

---

## 라이선스

Private.
