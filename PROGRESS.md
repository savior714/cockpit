# Cockpit

## 프로젝트 지도

### 1차 핵심 뷰어 런타임
#### 마크다운 파싱 및 뷰어 렌더링 파이프라인
1. **마크다운 파서 및 시맨틱 분해** — H2 슬롯, H3 레일/그룹, H3 영역 상세 속성을 토큰화하고 정형 데이터 구조로 변환
2. **네이티브 프로젝트 지도 렌더링** — 목록 문법 기반 방향성 커넥터/대등 카드 그리드 및 Frontier Grid 렌더링
3. **개요 패널 및 컨텍스트 Handoff** — 핵심 상태 요약 및 외부 Problem Framer 연계를 위한 컨텍스트 클립보드 복사
4. **영역 상세 검사기** — 1:1 타이틀 매칭 기반 영역별 의미, 수준, 근거 점진적 공개 및 영역별 Handoff 지원

### 2차 배포 및 CLI 궤적
#### 확보된 기반
- **루프백 HTTP 서버 및 SSE 실시간 리로드** — Node.js 내장 모듈 기반 단일 파일 서빙 및 파일 변경 감시 시 SSE 갱신 이벤트 전달
- **결정론적 구조 검사기** — `cockpit check`를 통한 지도-상세 1:1 일치, 고아/중복 검출 및 구조적 규약 사전 검증

#### 현재 단계
- **독립 패키징 및 격리 설치 검증** — `prepack` 빌드, npm tarball 패키징, 격리된 접두사에서의 전역 설치 및 CLI/서버 구동 자동화 스모크 검증

#### 향후 여정
- **실환경 다중 저장소 운용 및 이식성 검증** — 실제 외부 사용자 프로젝트 저장소 환경에서의 GitHub/npm 설치 및 외부 에이전트 운영 루프 실증

## 영역 상세

### 마크다운 파서 및 시맨틱 분해

#### 의미
PROGRESS.md의 마크다운 텍스트를 파싱하여 프로젝트 지도, 개요 슬롯, 영역 상세, 하단 맥락 패널의 정형 데이터 모델로 분해하는 핵심 파서 서브시스템.

#### 현재 수준
Markdown-it 기반 토큰화, 현재 정의된 한/영 H2 헤딩 별칭 파싱, 순서형/비순서형 목록 파싱, NFC 및 공백 정규화 기반 영역 타이틀 매칭, Current Stage 및 Current Focus 분리 파싱이 구현되어 단위 테스트로 검증됨.

#### 근거
- `src/parser.ts:L1-450`
- `tests/parser.test.mjs` (정규화, 헤딩 별칭, 파싱 단위 테스트)

### 네이티브 프로젝트 지도 렌더링

#### 의미
파싱된 레일과 그룹 데이터를 기반으로 프로젝트의 구조, 흐름, 객관적 프론티어(Current Stage)를 브라우저 DOM에 반응형 카드로 시각화하는 렌더링 엔진.

#### 현재 수준
B1.2 Frontier Grid 비주얼 디렉션 구현. 명시적 마크다운 목록 문법에 따라 번호 목록은 순차 흐름(화살표 커넥터)으로, 글머리 기호는 대등 카드 그리드로 렌더링하며, 궤적 레일의 Current Stage 하이라이트 및 상태 배지 렌더링이 단위 테스트 및 합성 픽스처로 검증됨.

#### 근거
- `src/parser.ts:L748-850`
- `src/style.css`
- `tests/parser.test.mjs` (네이티브 맵 렌더링 불변식 검증)

### 개요 패널 및 컨텍스트 Handoff

#### 의미
우측 상단 기본 화면에 프로젝트의 현재 상황, 다음 전환, 직면한 문제, 현재 집중을 표시하고, 외부 Problem Framer 연계를 위한 표준화된 Handoff 마크다운을 클립보드로 전송하는 컴포넌트.

#### 현재 수준
Current Focus 유무에 따른 조건부 렌더링, `buildFocusHandoffContext`를 통한 Execution Wave(NOW/SERIAL NOW/WAIT FOR EVIDENCE) 프레이밍 가이드라인 결합 클립보드 복사 함수 및 DOM 피드백 구조, Area handoff의 기존 `남은 문제` anti-anchoring 및 `NO_ACTION / NO_CHANGE` 지침이 구현되어 단위 테스트로 검증됨.

#### 근거
- `src/parser.ts:L850-1050`
- `src/main.ts`
- `tests/parser.test.mjs` (Handoff 컨텍스트 조립 검증)
- `src/parser.ts:L1128-1273` (Focus/Area handoff contract and anti-anchoring instruction)

### 영역 상세 검사기

#### 의미
지도에서 특정 영역 카드를 선택했을 때 해당 영역의 의미, 현재 수준, 근거 및 (존재할 경우) 남은 문제를 표시하고, 해당 영역에 집중된 검토 Handoff를 제공하는 인스펙터.

#### 현재 수준
지도 항목과의 1:1 타이틀 매칭 기반 검사기 렌더링, 증거 기반 남은 문제의 조건부 표시(부재 시 생략), `이 영역 검토하기` 컨텍스트 복사 함수 및 DOM 렌더링 단위 테스트 검증.

#### 근거
- `src/parser.ts:L1050-1200`
- `src/main.ts`
- `tests/parser.test.mjs` (Area Detail 렌더링 및 검증)

### 루프백 HTTP 서버 및 SSE 실시간 리로드

#### 의미
외부 웹 프레임워크 없이 순수 Node.js 내장 모듈로 단일 PROGRESS.md와 빌드된 dist/ 정적 파일만을 격리하여 서비스하는 초경량 로컬 뷰어 서버.

#### 현재 수준
루프백(127.0.0.1) 전용 바인딩, 경로 정규화 기반 dist 외부 접근 차단, 대상 마크다운 파일 감시(`fs.watch`) 및 SSE(`/events`) 이벤트 전송, CLI 옵션 파싱(`--port`, `--no-open`) 구현 및 로컬/패키지 스모크 테스트 통과.

#### 근거
- `scripts/serve.mjs`
- `tests/package-smoke.test.mjs` (서버 기동 및 정적/마크다운 서빙 검증)

### 결정론적 구조 검사기

#### 의미
`cockpit check [path]` 명령을 통해 PROGRESS.md의 지도 항목과 영역 상세 간 1:1 일치, 고아/중복 상세, 다중 Current Stage 제약 등을 기계적으로 검증하여 CI 및 커밋 전 검사에서 활용할 수 있는 결정론적 구조 검증 도구.

#### 현재 수준
`checkProgressStructure` 파서 함수 및 CLI 리포트 출력 로직 구현. 지도-상세 불일치나 제약 위반 시 결함 목록과 함께 종료 코드 1 반환, 정상 시 종료 코드 0(PASS) 반환이 단위 및 패키지 스모크 테스트로 검증됨.

#### 근거
- `src/parser.ts:L550-680`
- `scripts/serve.mjs:L24-45`
- `tests/parser.test.mjs`
- `tests/package-smoke.test.mjs` (유효/무효 문서 검사 동작 확인)

### 독립 패키징 및 격리 설치 검증

#### 의미
배포 아티팩트(`dist/`, `scripts/`)가 소스 의존 없이 독립적으로 패키징되고, 임의의 격리된 환경에서 정상 설치되어 CLI 명령 및 뷰어가 올바르게 실행되는지 검증하는 배포 기반.

#### 현재 수준
`package.json`의 `files`, `bin`, `prepack` 스크립트 구성, standalone `dist/parser.js` 빌드, 임시 디렉터리 내 npm pack tarball 생성, 격리된 npm prefix 전역 설치 후 `--help`, `check`, 뷰어 HTTP 기동 및 종료까지의 자동화 스모크 테스트 통과.

#### 근거
- `package.json`
- `tests/package-smoke.test.mjs`

### 실환경 다중 저장소 운용 및 이식성 검증

#### 의미
실제 외부 프로젝트 저장소 환경에서 `github:savior714/cockpit#main` 또는 npm 배포본을 설치하고, 외부 역량 에이전트가 제안된 운영 루프(Operator Workflow)에 따라 실제 PROGRESS.md를 점검·시각화하는 실환경 수용성 검증.

#### 현재 수준
로컬 빌드 및 격리된 접두사 설치 스모크는 입증되었으나, 다양한 외부 실제 프로젝트 저장소에서의 GitHub 전역 설치 및 실제 에이전트 운영 루프를 거치는 실환경 이식성 검증이 향후 마일스톤으로 남아 있음.

#### 근거
- `README.md` (설치 가이드 및 공식 운영 계약)
- `tests/package-smoke.test.mjs` (현재 격리 테스트 경계)

## 현재 상황
Cockpit은 마크다운 파서, 네이티브 맵 렌더러, 영역 검사기, Handoff 컨텍스트 전송, 루프백 서버 및 `cockpit check` 구조 검사기 등 핵심 런타임을 구현하고 단위 및 패키지 격리 스모크 테스트를 통과했습니다. 가상 데이터(Orion 데모) 제거와 사실 기반 PROGRESS 수립, 다중 패스 증거 동화 및 기존 open/negative claim 재입장·반증 계약 공식화가 완료되었으며, 내부 개발 상의 실질적 결함 없이 안정적인 배포 검증 단계에 도달해 있습니다.

## 다음 전환
실제 외부 프로젝트 저장소 환경에서 Cockpit을 전역 설치하고, 외부 역량 에이전트가 제안된 운영 워크플로우(Operator Workflow)에 따라 실제 PROGRESS.md를 점검하고 시각화하는 실환경 이식성 검증을 수행합니다.

## 최근 진척
- **기존 open claim 재입장 및 stale negative claim 반증 계약 확립** — 기존 `남은 문제`·`직면한 문제`·`다음 전환` 선행조건·material limitation을 자동 승계하지 않고, 외부 capable agent가 fresh implementation/runtime/proof의 closure와 counterevidence를 먼저 탐색하도록 하여 닫힌 문제의 잔존 표시와 무근거 remediation task 승격을 방지함.
- **사실 기반 프로젝트 상태 재구축 및 다중 패스 증거 동화 계약 정립** — 가상의 데모(Orion) 멘탈 모델을 제거하고 실제 저장소 증거 기반의 PROGRESS를 수립함과 동시에, 4대 증거 축 대조 및 적대적 모순 심사를 거치는 이식 가능한 외부 에이전트 운영 계약과 닫힘 시점 정합성 규칙을 확립함.
- **프론티어 그리드(B1.2) 비주얼 디렉션 및 컨텍스트 계층 개편** — 대시보드 클리셰와 AI UI 문법을 제거하고, 상단 지도 및 프론티어 강조, 하단 최근 진척 중심의 에디토리얼 정보 계층을 확립함.
- **영역 상세 증거 진입 계약 정합화** — `남은 문제` 섹션을 증거가 입증된 경우에만 작성하도록 선택적 섹션으로 전환하고 불필요한 플레이스홀더를 배제함.
- **Universal Execution Wave 연계 Handoff 컨텍스트 표준화** — Focus 및 Area 검토 Handoff 시 외부 Problem Framer가 즉시 NOW/SERIAL NOW/WAIT FOR EVIDENCE 작업을 도출할 수 있도록 자기완결적 마크다운 복사 계약을 수립함.
- **Current Stage 멀티 프론티어 컨테이너 시맨틱 확립** — 궤적 레일별 객관적 현재 단계를 표현하며, 단일 레일 내 복수 frontier 항목 동시 표시 및 중립 레일 공존을 지원함.
- **사용자 소유 Current Focus와 객관적 Current Stage의 분리** — 문제 중심의 사용자 관심사(`## 현재 집중`)와 시스템 궤적의 객관적 진척 위치(`#### 현재 단계`)를 완전히 분리하여 활동량 기반 임의 추론을 방지함.
- **결정론적 구조 검사기(`cockpit check`) 및 독립 배포 패키징 검증** — 지도 항목과 영역 상세의 1:1 일치, 고아/중복 검출을 기계적으로 검증하고 standalone `dist/parser.js` 빌드 및 격리 접두사 전역 설치 스모크 테스트를 구축함.

## 제품 목표
Cockpit은 프로젝트의 `PROGRESS.md`를 읽어 대화형 프로젝트 지도, 진행 궤적의 객관적 프론티어, 영역별 상세 검사기를 브라우저에 실시간 시각화해 주는 초경량 읽기 전용 PM 대시보드입니다. 외부 역량 에이전트가 단일 현황 문서를 통해 프로젝트의 최신 멘탈 모델을 공유하고 문제를 외부 Problem Framer로 결정론적으로 인계(Handoff)할 수 있도록 지원하며, Cockpit 바이너리 자체에는 AI, 데이터베이스, 백그라운드 데몬, 파일 쓰기 메커니즘을 일체 포함하지 않습니다.

## 확정된 방향
- Cockpit은 순수 읽기 전용 뷰어이며, 파일 갱신 및 멘탈 모델 최신화는 외부 역량 에이전트(Claude, ChatGPT, Gemini 등)가 전담함.
- 일반 마크다운(`PROGRESS.md`)을 유일한 현황 저장소로 사용하며 독자적인 데이터베이스나 스키마를 요구하지 않음.
- 기존 PROGRESS.md의 open/negative claim에는 evidentiary grandfather right가 없으며, 유지되는 `남은 문제`는 current positive evidence가 입증하는 현재 defect/필수 proof blocker여야 함. closure/falsification 분류는 외부 agent의 transient reasoning으로만 수행함.
- 문제 중심의 사용자 관심사(`Current Focus`)와 궤적 레일별 객관적 진행 위치(`Current Stage`)를 독립된 개념으로 엄격히 분리함.
- 마크다운 목록 문법(순서형 번호 목록 vs 비순서형 글머리 기호)을 지도의 순차 흐름 및 대등 관계를 결정하는 유일한 권위로 사용함.
- 영역 상세의 `남은 문제`는 실제 증거로 입증된 경우에만 작성하며, 미확인 가상 문제나 '없음' 플레이스홀더를 작성하지 않음.
- `cockpit check`는 구조적 완전성(지도-상세 1:1 대응, 문법)만 검증하며, 내용의 시맨틱 진실성 판단은 외부 에이전트의 다중 패스 추론 책임임.
