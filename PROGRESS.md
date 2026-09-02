# Cockpit

## 프로젝트 지도

### 1차 핵심 뷰어 런타임
#### 마크다운 파싱 및 뷰어 렌더링 파이프라인
1. **마크다운 파서 및 시맨틱 분해** — H2 슬롯, H3 레일/그룹, H3 영역 상세 속성을 토큰화하고 정형 데이터 구조로 변환
2. **네이티브 프로젝트 지도 렌더링** — 목록 문법 기반 방향성 커넥터/대등 카드 그리드 및 Frontier Grid 렌더링
3. **개요 패널 및 프로젝트 이해 Handoff** — 핵심 상태 요약 및 외부 Problem Framer에 검증 가능한 프로젝트 문맥·진입 계약을 전달하는 컨텍스트 클립보드 복사
4. **영역 상세 검사기** — 1:1 타이틀 매칭 기반 영역별 의미, 수준, 근거 점진적 공개 및 영역별 Handoff 지원

### 2차 배포·운영 및 수용 궤적
#### 확보된 기반
- **루프백 HTTP 서버 및 SSE 실시간 리로드** — Node.js 내장 모듈 기반 단일 파일 서빙 및 파일 변경 감시 시 SSE 갱신 이벤트 전달
- **결정론적 구조 검사기** — `cockpit check`를 통한 지도-상세 1:1 일치, 고아/중복 검출 및 구조적 규약 사전 검증
- **독립 패키징 및 격리 설치 검증** — `prepack` 빌드, npm tarball 패키징, 격리된 접두사에서의 전역 설치 및 CLI/서버 구동 자동화 스모크 검증

#### 현재 단계
- **프로젝트 이해 충실도 계약 및 독립 재구성 수용성** — 실제 EMR real-project testbed에서 불신 baseline RECONSTRUCT와 trusted baseline REFRESH를 독립 검증하여 acceptance를 통과함

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

### 개요 패널 및 프로젝트 이해 Handoff

#### 의미
우측 상단 기본 화면에 프로젝트의 현재 상황, 다음 전환, 직면한 문제, 현재 집중을 표시하고, 외부 Problem Framer가 프로젝트 model을 검증·재구성할 수 있도록 표준화된 Handoff 마크다운과 진입 계약을 클립보드로 전송하는 컴포넌트.

#### 현재 수준
Current Focus 유무에 따른 조건부 렌더링, `buildFocusHandoffContext`를 통한 Execution Wave(NOW/SERIAL NOW/WAIT FOR EVIDENCE) 프레이밍 가이드라인 결합 클립보드 복사 함수 및 DOM 피드백 구조, Focus/Area handoff의 REFRESH·RECONSTRUCT 모드 선택, anti-anchoring, positive-model re-admission, transient Coverage Closure 및 Project Map escape 지침이 구현되어 단위 테스트로 전송 동작을 검증함. 이는 외부 프로젝트 전반의 model fidelity 자체를 증명하는 것은 아님.

#### 근거
- `src/parser.ts:L850-1050`
- `src/main.ts`
- `tests/parser.test.mjs` (Handoff 컨텍스트 조립 검증)
- `src/parser.ts:L1148-1200` (Focus/Area handoff contract, REFRESH/RECONSTRUCT admission and anti-anchoring instruction)

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
로컬 빌드 및 격리된 접두사 설치 스모크에 더해, EMR의 초기 관찰 revision `3c81c0eb0b67c118554824969397ac6937917408`에서 한 번의 실제 외부 프로젝트 fidelity acceptance가 완료되었다. 이후 원격이 `1e400deade67006546f39a5ac84e27f926af393c`로 이동하여 release verifier의 backend test universe만 bounded한 변경을 직접 영향 범위에서 재검증했으며, exact Stage 1A proof는 여전히 `NOT PROVEN`이고 제품 semantic model은 변하지 않았다. 불신 baseline은 기존 문서를 마지막 비교 전까지 읽지 않고 재구성했으며, HIRA sentinel의 좁은 production evidence 변화는 trusted baseline REFRESH와 독립 AFTER oracle이 수렴했다. 이는 한 외부 저장소에 대한 충실도 증명이며, GitHub/npm 설치와 실제 에이전트 운영 루프 또는 다른 저장소로의 이식성을 증명하지 않는다.

#### 근거
- `README.md` (설치 가이드 및 공식 운영 계약)
- `tests/package-smoke.test.mjs` (현재 격리 테스트 경계)

### 프로젝트 이해 충실도 계약 및 독립 재구성 수용성

#### 의미
기존 `PROGRESS.md`가 현재 프로젝트를 충분히 설명한다는 전제를 둘 수 없을 때, 외부 capable agent가 현재 권위·코드·runtime·proof·관련 Git에서 프로젝트 model을 독립적으로 다시 구성하고 문서와의 차이를 판단하는 수용성 표면. Cockpit은 이 reasoning을 수행하지 않고 그 계약이 담긴 문맥만 전달함.

#### 현재 수준
Handoff와 authoring contract가 신뢰 가능한 baseline에 대한 REFRESH와 불명확한 baseline에 대한 RECONSTRUCT를 구분하고, RECONSTRUCT에서 기존 문서 anchoring 차단, material semantic surface Coverage Closure, positive/open claim 재입장, Project Map boundary escape를 요구하도록 보강됨. 이 계약은 EMR에서 실제로 적용되어 Lane A와 Lane B 모두 의미적으로 PASS했다. 비교 과정에서 NHIS provider-level capability와 전체 Golden Path `Exit Status 0`은 현재 production proof로 승격하지 않았고, HIRA는 `653700520` 단일 sentinel 범위로만 유지했으며, Cockpit contract defect는 발견되지 않았다.

#### 근거
- `README.md` (Operator Workflow, First-Use / RECONSTRUCT 및 REFRESH 계약)
- `src/parser.ts` (Focus/Area Handoff admission instruction)
- `tests/parser.test.mjs` (양쪽 Handoff contract transport regression)

## 현재 상황
Cockpit은 마크다운 파서, 네이티브 맵 렌더러, 영역 검사기, Handoff 컨텍스트 전송, 루프백 서버 및 `cockpit check` 구조 검사기 등 핵심 런타임을 구현하고 단위 및 패키지 격리 스모크 테스트를 통과했습니다. `REAL-PROJECT-RECONSTRUCT-REFRESH-01`에서 fresh published Cockpit을 사용해 EMR의 초기 revision `3c81c0eb0b67c118554824969397ac6937917408`을 testbed로 관찰했고, 이후 fresh clean snapshot에서 현재 원격 revision `1e400deade67006546f39a5ac84e27f926af393c`의 release verifier 범위 변경을 재검증했습니다. 이 후속 변경 뒤에도 exact Stage 1A proof는 `NOT PROVEN`이며 이번 fidelity acceptance의 제품 semantic model은 변하지 않았습니다. Lane A는 기존 EMR `PROGRESS.md`가 공유 working tree의 uncommitted draft이고 일부 provider/release 표현이 현재 proof보다 강하다는 점을 분리하면서도 핵심 project model의 충실도를 확인했습니다. Lane B는 지정된 `40f99322→45832f9`가 consumer 없는 Service07 adapter 추가라 project-level delta가 아님을 확인한 뒤, `6c681323→edbd82843`의 HIRA 단일 sentinel 증거 전이를 bounded material delta로 선택했고 REFRESH와 독립 oracle이 수렴했습니다. 이 acceptance 결과는 한 real project에서의 fidelity를 닫지만, EMR Stage 1A 전체 release나 NHIS/DUR/NIMS/EDI/payment의 live capability를 증명하지 않습니다. 외부 실제 프로젝트 수용성에서는 대상 프로젝트를 evidence로만 취급하고, 필요한 경우 하나의 사전 승인된 자극을 관찰한 뒤 Cockpit의 semantic delta만 추출하고 중단하는 운영 경계를 갖습니다.

## 다음 전환
Cockpit의 GitHub/npm 설치와 여러 외부 저장소에서의 실제 에이전트 운영 루프를 검증하여, 이번 EMR 한 사례에서 확인한 RECONSTRUCT/REFRESH fidelity와 evidence boundary가 다른 프로젝트에서도 유지되는지 확인합니다.

## 최근 진척
- **프로젝트 이해 충실도 acceptance gap을 식별하고 진입 모드를 분리함; REAL-PROJECT-RECONSTRUCT-REFRESH-01을 실제 EMR에서 PASS함** → 불신 baseline의 독립 RECONSTRUCT와 HIRA 단일 sentinel의 trusted-baseline REFRESH가 독립 oracle과 수렴했고, unproven provider/release claims는 positive fact로 승격하지 않음. 기존 PROGRESS가 신뢰할 수 있는 baseline인지 먼저 판정하며, 불명확하면 기존 문서에 anchoring하지 않는 RECONSTRUCT, 확립된 baseline에는 보수적인 REFRESH를 적용함.
- **Recent Progress를 rolling semantic window로 재정렬하고 최신 전환 위계를 강화함** → 기존 9개 누적 목록을 현재 상태를 설명하는 8개 material transition으로 압축하고, 새 문서 갱신 때 stable context가 된 오래된 전환을 제거할 수 있게 했으며, 화면에서 최신 1–2개를 우선 읽도록 함.
- **실 프로젝트 수용성 검증의 테스트베드 경계를 확립함** → 외부 실제 프로젝트의 결함을 Cockpit 상태 표현·전송·reconciliation을 평가하기 위한 evidence로 한정하고, mutation-bearing acceptance는 하나의 사전 승인된 stimulus 뒤 관찰·Cockpit delta 추출·중단하도록 명시함. 정상적인 `Cockpit → Problem Framer → executor` 사용자 워크플로우는 그대로 유지함.
- **기존 open claim을 fresh evidence로 재입장시키는 반증 계약을 확립함** → 기존 `남은 문제`·`직면한 문제`·`다음 전환` 선행조건·material limitation을 자동 승계하지 않고, 외부 capable agent가 fresh implementation/runtime/proof의 closure와 counterevidence를 먼저 탐색하도록 하여 닫힌 문제의 잔존 표시와 무근거 remediation task 승격을 방지함.
- **가상 Orion 상태를 제거하고 사실 기반 프로젝트 상태·다중 패스 동화 계약을 정립함** → 실제 저장소 증거 기반의 PROGRESS를 수립하고, 4대 증거 축 대조·적대적 모순 심사·닫힘 시점 정합성 규칙을 거치는 이식 가능한 외부 agent 운영 계약을 확립함.
- **B1.2 Frontier Grid와 하단 맥락 계층을 정리함** → 대시보드 클리셰와 AI UI 문법을 제거하고, 상단 지도·프론티어 강조·하단 Recent Progress 중심의 에디토리얼 정보 계층을 확립함.
- **영역 상세를 evidence-admitted semantics로 정합화함** → `남은 문제`를 증거가 입증한 경우에만 선택적으로 표시하고, 근거 없는 문제·플레이스홀더가 현재 mental model을 오염시키지 않도록 함.

## 제품 목표
Cockpit은 프로젝트의 `PROGRESS.md`를 읽어 대화형 프로젝트 지도, 진행 궤적의 객관적 프론티어, 영역별 상세 검사기를 브라우저에 실시간 시각화해 주는 초경량 읽기 전용 PM 대시보드입니다. 외부 역량 에이전트가 신뢰 가능한 경우에는 보수적으로 기존 mental model을 갱신하고, 신뢰할 수 없는 경우에는 현재 repo/runtime/SSOT 증거에서 독립적으로 project model을 재구성한 뒤 단일 현황 문서를 통해 문제를 외부 Problem Framer로 결정론적으로 인계(Handoff)할 수 있도록 지원합니다. Cockpit 바이너리 자체에는 AI, 데이터베이스, 백그라운드 데몬, 파일 쓰기 메커니즘을 일체 포함하지 않습니다.

## 확정된 방향
- Cockpit은 순수 읽기 전용 뷰어이며, 파일 갱신 및 멘탈 모델 최신화는 외부 역량 에이전트(Claude, ChatGPT, Gemini 등)가 전담함.
- 외부 실제 프로젝트를 대상으로 Cockpit을 수용 테스트할 때 대상 프로젝트는 **evidence이지 work queue가 아니다**. Cockpit의 표현·전송·reconciliation을 평가하고, 대상 프로젝트 결함을 Cockpit 작업으로 승격하거나 재귀적으로 remediation하지 않으며, 필요할 때만 하나의 사전 승인된 test stimulus를 실행한 뒤 관찰하고 멈춘다.
- 일반 마크다운(`PROGRESS.md`)을 유일한 현황 저장소로 사용하며 독자적인 데이터베이스나 스키마를 요구하지 않음.
- 기존 PROGRESS.md의 open/negative claim에는 evidentiary grandfather right가 없으며, 유지되는 `남은 문제`는 current positive evidence가 입증하는 현재 defect/필수 proof blocker여야 함. closure/falsification 분류는 외부 agent의 transient reasoning으로만 수행함.
- 기존 mental model의 신뢰성이 확립된 경우에만 REFRESH를 사용하고, first-use·baseline 불명확·사용자 의문·복수 stale/false claim·Project Map 불일치 등에서는 RECONSTRUCT를 사용함. RECONSTRUCT의 coverage closure와 positive-model re-admission은 transient reasoning이며 persistent registry/schema/DB/score로 만들지 않음.
- Focus/Area review에서 Project Map boundary 자체가 실제 evidence와 맞지 않으면 기존 Area에 강제 편입하지 않고 필요한 범위의 RECONSTRUCT 또는 wider re-entry로 재검토함.
- 문제 중심의 사용자 관심사(`Current Focus`)와 궤적 레일별 객관적 진행 위치(`Current Stage`)를 독립된 개념으로 엄격히 분리함.
- 마크다운 목록 문법(순서형 번호 목록 vs 비순서형 글머리 기호)을 지도의 순차 흐름 및 대등 관계를 결정하는 유일한 권위로 사용함.
- 영역 상세의 `남은 문제`는 실제 증거로 입증된 경우에만 작성하며, 미확인 가상 문제나 '없음' 플레이스홀더를 작성하지 않음.
- `cockpit check`는 구조적 완전성(지도-상세 1:1 대응, 문법)만 검증하며, 내용의 시맨틱 진실성 판단은 외부 에이전트의 다중 패스 추론 책임임.
