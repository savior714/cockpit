# Cockpit

Cockpit은 프로젝트의 `PROGRESS.md` 파일을 읽어 브라우저에서 실시간으로 시각화해 주는 초경량 로컬 프로젝트 뷰어(Mental-model-first Thin Viewer)입니다.

프로젝트 상태를 일반 마크다운으로 작성해 두면, Cockpit이 이를 결정론적으로 읽어 **프로젝트 지도 → 지금 → 다음 → 막힘** 순서로 보여주고, 필요할 때 영역 Inspector에서 근거까지 내려가게 합니다.

Cockpit이 아닌 것: 프로젝트 관리 시스템, 워크플로우 엔진, 증명 오케스트레이터, Git/배포 컨트롤러, 에이전트 런타임, 거버넌스 프레임워크가 아닙니다.

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

- **일반 전역 설치(배포 패키지)**: 설치 시점에 패키징된 빌드 스냅샷을 사용하며, 업데이트 시에는 위 명령어로 재설치합니다.
- **로컬 개발 체크아웃(Linked Setup)**: 로컬 Git 체크아웃을 직접 `npm link` 등으로 연결해 사용하는 개발 환경에서는 소스가 변경되었을 때 다음 `cockpit` 실행 시 오래된 빌드를 자동으로 감지하고 갱신합니다.

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

```bash
cd my-project
cockpit
```

- **동작 방식**: Cockpit은 현재 존재하는 `PROGRESS.md`를 있는 그대로 읽어 브라우저(`http://127.0.0.1:4321`)에 표시하는 초경량 읽기 전용(Read-only) 뷰어입니다.
- **바이너리 경계**: Cockpit 바이너리 자체는 저장소를 분석하거나, Git 이력을 검사하거나, `PROGRESS.md`를 수정하거나, AI를 호출하지 않습니다.
- **새로고침 의미**: 브라우저 새로고침과 파일 변경 시 live reload는 지정된 현재 `PROGRESS.md`를 다시 읽어 렌더링할 뿐이며, Git을 조회하는 `Git refresh`가 아닙니다. 문서에 새 전환을 넣는 일은 외부 capable agent의 fresh evidence 대조 책임입니다.

### 다른 경로의 파일 지정하기

```bash
cockpit /path/to/another/PROGRESS.md
cockpit ./docs/PROGRESS.md --port 5000 --no-open
```

### 구조적 완전성 사전 검사 (Structural Preflight Check)

```bash
cockpit check
cockpit check /path/to/PROGRESS.md
```

- **PASS (종료 코드 0)**: 지도의 모든 항목이 영역 상세와 1:1 대응되며 구조적 결함 없음
- **FAIL (종료 코드 1)**: 누락된 영역 상세, 고아(Orphan) 상세(타이틀 불일치), 중복 상세, 동일 레일 내 다중 Current Stage 그룹, 개요의 저수준 telemetry 누출 등 오류 목록 출력

#### CLI 옵션

- `cockpit [path/to/PROGRESS.md]` — 뷰어 실행 (생략 시 현재 디렉터리의 `./PROGRESS.md`)
- `cockpit check [path/to/PROGRESS.md]` — 구조적 완전성 검사 후 즉시 종료 (0: PASS, 1: FAIL)
- `--port`, `-p` — 포트 번호 지정 (기본값: `4321`)
- `--no-open` — 브라우저 자동 실행 비활성화
- `--help`, `-h` — 도움말 출력

---

## 4. Cockpit 동작 원리

### 권위 경계 및 동작 원리

```text
repo / runtime / 관련 SSOT (최신 실제 증거)
        ↓ (대조 및 갱신)
외부 역량 에이전트 (Claude Code, ChatGPT, Gemini 등)
        ↓ (작성/저장)
   PROGRESS.md (Cockpit이 읽는 단일 현황 문서)
        ↓ (시각화)
     Cockpit
```

- **단일 문서 시각화**: Cockpit은 지정된 단일 `PROGRESS.md` 문서만을 읽어 화면에 표시하며, 저장소나 런타임을 직접 검사·분석하지 않습니다.
- **실제 증거 우선**: `PROGRESS.md`는 Cockpit이 읽고 보여주는 단일 현황 문서일 뿐, 최신 코드/런타임/도메인 증거보다 상위의 권위를 갖지 않습니다. 실제 증거와 충돌 시 언제나 최신 실제 증거가 우선합니다.
- **외부 에이전트 갱신**: 프로젝트 상태가 달라지면 외부 코딩 에이전트가 최신 실제 증거와 기존 문서를 대조하여 `PROGRESS.md`를 갱신합니다.
- **자동 새로고침 (Live Reload)**: 대상 `PROGRESS.md` 파일 저장을 감시하여 브라우저 새로고침 없이 화면을 즉시 갱신합니다.

### 처음 시작할 때: 새 프로젝트에 PROGRESS.md 작성 요청하기

새 프로젝트나 기존 프로젝트에 처음 Cockpit을 연결할 때는 외부 역량 에이전트에게 다음 프롬프트를 그대로 복사하여 전달합니다:

```text
이 프로젝트의 실제 상태를 파악하여 Cockpit용 `PROGRESS.md` 문서를 작성해줘.

먼저 저장소의 권위 문서(AGENTS.md, README.md, docs/, package.json 등), 실제 소스 코드 진입점과 실행 경로,
테스트 스위트, 최근 변경 이력을 각각 독립적으로 확인하고 서로 대조해줘. 한 축의 존재를 다른 축의
증명으로 비약하지 말고 (문서에 적혀 있다고 구현된 것이 아님), 모순은 미리 해결하고, 확인되지 않은
주장은 쓰지 마.

아래 §5의 마크다운 구조에 맞춰 사실 기반으로 작성해줘. 불확실한 영역은 지어내지 말고 생략하거나
모르는 범위와 경계를 명시해줘. 저장 후 반드시 `cockpit check`로 구조적 완전성을 확인해줘.
```

### 작업 중 PROGRESS.md 갱신하기

작업을 진행한 뒤 외부의 역량 있는 코딩 에이전트에게 다음과 같이 요청하여 `PROGRESS.md`를 갱신합니다:

```text
current repository / runtime 증거와 기존 PROGRESS.md를 대조하여, 기존 문서를 그대로 보여주면
프로젝트의 역량·위치·다음 전환·제약을 실질적으로 잘못 이해하게 되는 표면만 보수적으로 갱신해줘.
시간이 흘렀다는 이유만으로 수정하지 말고, 실질적 변화가 없으면 문서를 그대로 둬.
실제로 확인된 미해결 문제가 없으면 '남은 문제'를 지어내지 말고, 닫힌 문제를 현재 문제로 되살리지 마.
저장 전 반드시 `cockpit check`를 실행해줘.
```

에이전트가 `PROGRESS.md`를 저장하면, 열려 있는 Cockpit 화면은 같은 파일을 다시 읽어 변경사항을 반영합니다. 이는 현재 문서의 재렌더링이며 Git 조회나 자동 semantic refresh가 아닙니다.

### 다른 실제 저장소로 Cockpit을 검증할 때의 경계

Cockpit 자체를 다른 실제 저장소로 수용 테스트할 때만 적용되는 별도 경계입니다. 일반적인 사용자 워크플로우가 아닙니다:

> **TESTBED IS EVIDENCE, NOT THE WORK QUEUE.**

외부 실제 저장소의 결함은 Cockpit이 프로젝트 상태를 올바르게 표현·전달했는지 판단하기 위한 관찰 증거이며, 자동으로 Cockpit의 작업 큐가 되지 않습니다.

---

## 5. PROGRESS.md 작성 구조

질문 하나에 섹션 하나가 대응합니다. 같은 질문에 답하는 섹션을 둘로 나누지 않습니다.

| Heading (한국어 / English) | 답하는 질문 | 규칙 |
|---|---|---|
| `## 프로젝트 지도` / `## Project Map` | 프로젝트는 어떤 주요 부분으로 이루어져 있는가? 지금 어디쯤인가? | **필수.** `###` 레일 → `####` 그룹 → 목록 항목. 항목은 `- **제목** — 한 줄 설명`. 제목은 영역 상세의 `### 제목`과 정확히 일치해야 한다. `#### 현재 단계`(또는 `Current Stage`)는 정확한 문자열이며 레일당 최대 1개다. |
| `## 영역 상세` / `## Area Details` | 특정 영역의 의미·현재 수준·근거는 무엇인가? | **필수.** 지도 항목마다 `### 제목` + `#### 의미` / `#### 현재 수준` / `#### 근거` 권장. 증거로 확인된 미해결 문제가 있을 때만 `#### 남은 문제`를 둔다. 없으면 섹션 자체를 생략한다. |
| `## 현재 상황` / `## Current Situation` | 프로젝트 전체가 지금 어떤 상태인가? | project-level 압축 서술. 개별 작업 chronology가 아니다. |
| `## 다음 전환` / `## Next Transition` | 다음에 어떤 상태로 넘어가려 하는가? | `A 상태 → B 상태` + 완료 조건 형태의 state transition. 실행 command가 아니다. |
| `## 직면한 문제` / `## Facing Issues` | 전환을 막거나 제한하는 것이 있는가? | **선택.** 실제로 제한하는 blocker/제약이 있을 때만 작성하고, 없으면 섹션 자체를 생략한다. |
| `## 최근 변화` / `## Recent Progress` | 어떻게 여기까지 왔는가? | **선택.** `실질적 변경 → 결과` 형태의 핵심 전환만 최신순으로. 작업 나열이 아니다. |
| `## 현재 집중` / `## Current Focus` | 지금 가장 중요한 것은 무엇인가? | **선택, 최대 1개.** 사용자 소유의 관심사. 활동량이나 현재 executor task로 자동 추론하지 않는다. |
| `## 제품 목표` / `## Product Goal` | 이 프로젝트는 무엇을 위한 것인가? | 안정적 맥락. 간결하게. |
| `## 확정된 방향` / `## Settled Direction` | 이미 정해진 제약은 무엇인가? | 안정적 맥락. 영속적 결정만. |

- **최소 예제**: `tests/fixtures/canonical-minimal.md`가 위 규칙을 보여주는 복사 시작점이다. 다음이 PASS해야 한다:

  ```bash
  node scripts/serve.mjs check tests/fixtures/canonical-minimal.md
  ```

- 예전 Horizon/Stage/Posture/Frontier/Thread/Movement 형식으로 쓴 문서는 해당 섹션이 보조 맥락으로 표시될 뿐 check를 깨지 않는다. 새 문서는 위 표의 heading을 쓴다.

### 작성 원칙 (짧은 계약)

1. **Fresh evidence first**: 저장 전 current repository/runtime 증거와 대조한다. `PROGRESS.md`는 권위가 아니라 projection이다.
2. **STRUCTURALLY VALID != EVIDENCE-GROUNDED**: `cockpit check` PASS는 구조 검사이지 사실 증명이 아니다.
3. **모르는 것은 만들지 않는다**: `UNKNOWN != PROBLEM`, 증거 부족을 문제로 날조하지 않는다. `증거 없음 != 결함`이다.
4. **개요는 얕게, 근거는 깊게**: commit SHA, 파일 경로, test command 같은 저수준 증거를 `현재 상황`/`다음 전환`/`직면한 문제`에 복사하지 않는다. 그런 증거는 영역 상세와 handoff에 둔다.
5. **현재 집중은 사용자 소유**: 활동량·executor task로 자동 추론하거나 임의 이동하지 않는다.
6. **최근 변화는 의미 전환만**: 커밋 로그가 아니라 역량/상태/방향을 바꾼 전환만 기록한다.
7. **닫힌 것은 되살리지 않는다**: 이미 닫힌 문제를 현재 문제로 올리지 않는다. 문제가 없으면 `NO_ACTION`이다.

### 컨텍스트 Handoff 액션

- **`현재 집중 내용 복사`**: `## 현재 집중`이 있을 때 표시되는 버튼. 프로젝트 이름, 현재 집중, 지금/다음/막힘, 제품 목표, 확정된 방향, 프로젝트 지도, 영역 상세 맥락을 외부 에이전트에게 전달할 클립보드로 복사합니다.
- **`이 영역 검토하기`**: 지도에서 영역 카드를 클릭하면 열리는 Inspector의 버튼. 선택된 영역의 세부 정보와 핵심 프로젝트 맥락을 자기 완결적으로 클립보드에 복사합니다.
- 두 버튼 모두 AI를 실행하거나 태스크를 생성하지 않으며, 외부 capable agent에 전달할 맥락을 복사하는 역할만 합니다. 전달받은側은 PROGRESS claim을 truth로 가정하지 않고 fresh evidence와 대조하며, 실행·스케줄링·발행·Git 절차는 해당 repository 자체의 개발 계약을 따릅니다. Cockpit handoff는 그 절차를 정의하지 않습니다.

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
├── index.html           # 대시보드 HTML 구조 (지도 우선, 개요, 영역 검사기 슬롯)
├── src/
│   ├── main.ts          # Map-first 뷰어 셸 (개요는 plain-text 투영, 상세는 Inspector)
│   ├── domain.ts        # 지도 + 영역 상세 도메인 모델 (표현 오염 없음)
│   ├── authoring-grammar.ts   # README §5의 결정론적 구현 어휘
│   ├── markdown-structure.ts  # markdown-it 토큰 경계/원시 텍스트/문자열 렌더링
│   ├── semantic-construction.ts # 지도/영역 구성 (문자열→문서 모델 진입점 포함)
│   ├── structural-check.ts    # 구조적 유효성 검사 (의미 진실성 검사 아님)
│   ├── inspector-projection.ts # 영역→Inspector/지도 투영 (tone/HTML 소유)
│   ├── handoff-context.ts     # Focus/Area handoff 문맥 구성
│   ├── handoff-contract.ts    # handoff 문구 계약 (프로젝트 맥락만)
│   ├── parser.ts        # 호환/공개 파사드 (재노출만, 정식 구현 아님)
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
