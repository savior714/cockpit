# Cockpit

Cockpit은 프로젝트의 `PROGRESS.md` 파일을 읽어 브라우저에서 실시간으로 시각화해 주는 초경량 로컬 프로젝트 뷰어(Mental-model-first Thin Viewer)입니다.

프로젝트 상태를 일반 마크다운으로 작성해 두면, Cockpit이 이를 결정론적으로 읽어 **프로젝트 지도 → 프로젝트 현황 → 다음 단계 → 진행 제약** 순서로 보여주고, 필요할 때 영역 Inspector에서 근거까지 내려가게 합니다.

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
- **로컬 개발 체크아웃(Linked Setup)**: 로컬 Git 체크아웃을 직접 `npm link` 등으로 연결해 사용하는 개발 환경에서는 소스가 변경되었을 때 다음 `cockpit` 실행 시 오래된 빌드를 자동으로 감지하고 갱신합니다. `git pull` 등으로 체크아웃을 갱신한 뒤에는 `npm link`를 다시 실행해 `cockpit` 명령이 정식 진입점(`scripts/cockpit.mjs`)을 가리키게 하고, `command -v cockpit && readlink "$(command -v cockpit)"`으로 확인합니다. `scripts/serve.mjs`를 `cockpit` 이름으로 직접 심볼릭 링크하지 마세요.

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

또는 프로젝트 디렉터리를 직접 지정합니다:

```bash
cockpit my-project
cockpit /path/to/my-project
```

- **동작 방식**: Cockpit은 프로젝트 디렉터리의 `PROGRESS.md`를 있는 그대로 읽어 브라우저(`http://127.0.0.1:4321`)에 표시하는 초경량 읽기 전용(Read-only) 뷰어입니다. 인자 없이 실행하면 대화형 터미널에서는 대상 경로를 먼저 묻고(비우면 현재 디렉터리), 비대화형에서는 `./PROGRESS.md`를 사용합니다.
- **바이너리 경계**: Cockpit 바이너리 자체는 저장소를 분석하거나, Git 이력을 검사하거나, `PROGRESS.md`를 수정하거나, AI를 호출하지 않습니다. 첫 실행 온보딩이 만드는 중립 시작점도 사용자의 명시적 확인(`y`)이 있을 때만 기록됩니다.
- **새로고침 의미**: 브라우저 새로고침과 파일 변경 시 live reload는 지정된 현재 `PROGRESS.md`를 다시 읽어 렌더링할 뿐이며, Git을 조회하는 `Git refresh`가 아닙니다. 문서에 새 전환을 넣는 일은 외부 에이전트가 최신 실제 증거와 대조해 반영할 일입니다.

### 다른 프로젝트·파일 지정하기

```bash
cockpit /path/to/another-project
cockpit /path/to/another/PROGRESS.md
cockpit ./docs/PROGRESS.md --port 5000 --no-open
```

- 디렉터리를 지정하면 `<dir>/PROGRESS.md`를 찾아 뷰어를 실행합니다.
- 명시적 파일 지정은 그대로 동작하는 빠른 경로(advanced)입니다.
- `PROGRESS.md`가 아직 없는 프로젝트를 지정하면(또는 빈 디렉터리에서 `cockpit` 실행 시) 실패로 끝나지 않고 준비 흐름으로 들어갑니다. 대상 프로젝트를 명시하고, 외부 에이전트용 준비 요청문을 보여주며, 확인 후에만 중립 시작점을 만듭니다. 자세한 흐름은 §4를 보세요.

### 구조적 완전성 사전 검사 (Structural Preflight Check)

```bash
cockpit check
cockpit check /path/to/PROGRESS.md
```

- **PASS (종료 코드 0)**: 지도의 모든 항목이 영역 상세와 1:1 대응되며 구조적 결함 없음
- **FAIL (종료 코드 1)**: 누락된 영역 상세, 고아(Orphan) 상세(타이틀 불일치), 중복 상세, 동일 레일 내 다중 Current Stage 그룹, 개요의 저수준 telemetry 누출 등 오류 목록 출력

#### CLI 옵션

- `cockpit` — 현재 디렉터리 프로젝트 열기 (대화형이면 대상 경로 확인, 아니면 `./PROGRESS.md`)
- `cockpit <project-dir>` — `<dir>/PROGRESS.md` 열기, 없으면 준비 흐름으로 진입
- `cockpit [path/to/PROGRESS.md]` — 명시적 파일 직접 실행 (빠른 경로)
- `cockpit check [path]` — 구조적 완전성 검사 후 즉시 종료 (0: PASS, 1: FAIL). 디렉터리도 지정 가능하며, 프롬프트·기록 없이 결정론적으로 동작
- `--port`, `-p` — 포트 번호 지정 (기본값: `4321`)
- `--no-open` — 브라우저 자동 실행 비활성화
- `--help`, `-h` — 도움말 출력

---

## 4. Cockpit 동작 원리

### 권위 경계 및 동작 원리

```text
repo / runtime / 관련 SSOT (최신 실제 증거)
        ↓ (대조 및 갱신)
외부 에이전트 (Claude Code, ChatGPT, Gemini 등)
        ↓ (작성/저장)
   PROGRESS.md (Cockpit이 읽는 단일 현황 문서)
        ↓ (시각화)
     Cockpit
```

- **단일 문서 시각화**: Cockpit은 지정된 단일 `PROGRESS.md` 문서만을 읽어 화면에 표시하며, 저장소나 런타임을 직접 검사·분석하지 않습니다.
- **실제 증거 우선**: `PROGRESS.md`는 Cockpit이 읽고 보여주는 단일 현황 문서일 뿐, 최신 코드/런타임/도메인 증거보다 상위의 권위를 갖지 않습니다. 실제 증거와 충돌 시 언제나 최신 실제 증거가 우선합니다.
- **외부 에이전트 갱신**: 프로젝트 상태가 달라지면 외부 코딩 에이전트가 최신 실제 증거와 기존 문서를 대조하여 `PROGRESS.md`를 갱신합니다.
- **자동 새로고침 (Live Reload)**: 대상 `PROGRESS.md` 파일 저장을 감시하여 브라우저 새로고침 없이 화면을 즉시 갱신합니다.
- **자동 업데이트 (선택, 기본 꺼짐)**: 우측 상단 `자동 업데이트`를 켜면 10분마다 외부 담당자에게 확인을 요청합니다. Cockpit은 직접 분석하거나 문서를 만들지 않고, 결과를 다시 읽어 실제 변경이 있을 때만 화면을 갱신합니다. 변경이 없으면 화면을 그대로 두고, 확인에 실패하면 기존 화면을 유지합니다. 외부 연결은 `COCKPIT_REFRESH_COMMAND` 환경 변수로 지정합니다.

### 처음 시작할 때: PROGRESS.md가 없는 프로젝트

`PROGRESS.md`가 아직 없는 프로젝트에서 `cockpit`을 실행하면(디렉터리 지정 포함) 막다른 오류 대신 준비 흐름으로 들어갑니다:

1. Cockpit이 대상 프로젝트와 찾는 위치(`<dir>/PROGRESS.md`)를 명시합니다.
2. 외부 에이전트에게 그대로 전달할 준비 요청문을 보여줍니다. Cockpit 자체는 저장소를 분석하거나 내용을 자동으로 만들지 않습니다.
3. 대화형 터미널에서는 중립 시작점 파일을 만들지 묻고, 명시적으로 확인(`y`)할 때만 기록합니다. 비대화형(파이프·스크립트·CI)에서는 묻지 않고 종료 코드 1과 함께 조치 경로를 출력합니다.

중립 시작점은 `§5` 구조의 빈 골격이며, 실제 증거로 채우기 전에는 `cockpit check`가 FAIL인 것이 정상입니다. 준비 요청문을 받은 에이전트(또는 작성자)가 실제 증거 기반으로 채운 뒤 `cockpit check`로 확인하고 `cockpit <project-dir>`로 다시 실행하세요.

참고로 준비 요청문은 다음과 같으며, 실제 실행 시에는 대상 프로젝트·작성 위치가 채워진 형태로 출력됩니다:

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

작업을 진행한 뒤 외부 에이전트에게 다음과 같이 요청하여 `PROGRESS.md`를 갱신합니다:

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

아래 표의 heading은 파일 작성 계약이다. 화면에는 같은 의미를 독자용 표시 이름(프로젝트 현황, 다음 단계, 진행 제약, 최근 업데이트, 우선 과제, 제품 목표, 주요 결정)으로 보여주며, 내부 의미 소유자(situation / next / facing / recent / focus / frame / settled)는 바뀌지 않는다.

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

  (위 명령은 저장소 파일을 직접 지정하는 검사 호출이며, 설치된 `cockpit` 명령 자체는 정식 진입점인 `scripts/cockpit.mjs`를 사용합니다.)

- 예전 Horizon/Stage/Posture/Frontier/Thread/Movement 형식으로 쓴 문서는 해당 섹션이 보조 맥락으로 표시될 뿐 check를 깨지 않는다. 새 문서는 위 표의 heading을 쓴다.

### 작성 원칙 (짧은 계약)

1. **Fresh evidence first**: 저장 전 current repository/runtime 증거와 대조한다. `PROGRESS.md`는 권위가 아니라 projection이다.
2. **STRUCTURALLY VALID != EVIDENCE-GROUNDED**: `cockpit check` PASS는 구조 검사이지 사실 증명이 아니다.
3. **모르는 것은 만들지 않는다**: `UNKNOWN != PROBLEM`, 증거 부족을 문제로 날조하지 않는다. `증거 없음 != 결함`이다.
4. **개요는 얕게, 근거는 깊게**: commit SHA, 파일 경로, test command 같은 저수준 증거를 `현재 상황`/`다음 전환`/`직면한 문제`에 복사하지 않는다. 그런 증거는 영역 상세와 handoff에 둔다.
5. **현재 집중은 사용자 소유**: 활동량·executor task로 자동 추론하거나 임의 이동하지 않는다.
6. **최근 변화는 의미 전환만**: 커밋 로그가 아니라 역량/상태/방향을 바꾼 전환만 기록한다.
7. **닫힌 것은 되살리지 않는다**: 이미 닫힌 문제를 현재 문제로 올리지 않는다. 문제가 없으면 `NO_ACTION`이다.

### 독자용 표시 언어

화면에 보이는 문구는 파일 작성 계약(위 표)과 구분된다. 작성용 heading·의미 키는 그대로 두고, 표시 이름·버튼·상태만 아래 원칙으로 다듬는다.

- 독자가 실제로 쓰는 말을 우선한다. (예: 화면에는 `프로젝트 현황`, 파일에는 `## 현재 상황`)
- 직역투·혼합어·영어 섞어 쓰기를 피하고 쉬운 우리말로 쓴다.
- 같은 개념은 화면 어디서나 하나의 제품 용어로 수렴한다. (예: `우선 과제`, `주요 결정`, `외부 에이전트`)
- 내부 설계·해석용 약어와 의미 키는 일반 화면에 올리지 않는다.
- 버튼·상태 문구는 사용자가 이해할 행동·결과 중심으로 쓴다. (예: `우선 과제 내용 복사`, `확인 실패 · 기존 화면 유지`)
- 필요한 경우 다음에 무엇을 하면 되는지까지 함께 안내한다.
- 일반 독자 화면과 개발자·내부 용어를 구분한다. 내부 용어는 주석·타입·개발자 가이드에만 둔다.
- 최종 제품 문구는 실제 렌더링된 화면(브라우저)에서 눈으로 확인한다.

### 컨텍스트 Handoff 액션

- **`우선 과제 내용 복사`**: `## 현재 집중`이 있을 때 표시되는 버튼(화면에는 `우선 과제`로 표시). 프로젝트 이름, 우선 과제, 프로젝트 현황/다음 단계/진행 제약, 제품 목표, 주요 결정, 프로젝트 지도, 영역 상세 맥락을 외부 에이전트에게 전달할 클립보드로 복사합니다.
- **`이 영역 검토하기`**: 지도에서 영역 카드를 클릭하면 열리는 Inspector의 버튼. 선택된 영역의 세부 정보와 핵심 프로젝트 맥락을 자기 완결적으로 클립보드에 복사합니다.
- 두 버튼 모두 AI를 실행하거나 태스크를 생성하지 않으며, 외부 에이전트에 전달할 맥락을 복사하는 역할만 합니다. 전달받은 에이전트는 `PROGRESS.md` 내용을 사실로 단정하지 않고 최신 실제 증거와 대조하며, 실행·스케줄링·발행·Git 절차는 해당 repository 자체의 개발 계약을 따릅니다. Cockpit handoff는 그 절차를 정의하지 않습니다.

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
├── index.html           # 대시보드 HTML 구조 (지도 우선, 개요, 상세 정보 창 슬롯)
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
│   └── style.css        # 지도/상세 정보 창 반응형 그리드 및 테마 스타일
├── scripts/
│   ├── cockpit.mjs        # 정식 bin 진입점 (`package.json` bin 소유) + 빌드 신선도 가드 후 serve 위임
│   ├── freshness.mjs      # 로컬 체크아웃용 빌드 지문·스탬프·자동 갱신
│   ├── target.mjs       # CLI target 획득·progress resolution·온보딩의 단일 canonical owner
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
