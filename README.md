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

Cockpit의 실행 방식은 사용자가 직접 명령어를 입력하는 경우와 외부 역량 에이전트에게 실행을 요청하는 경우에 따라 명확히 구분됩니다:

#### 1. 직접 CLI 실행 (사람이 직접 실행)

터미널에서 `cockpit` 명령어를 직접 실행합니다:

```bash
cd my-project
cockpit
```

- **동작 방식**: Cockpit은 현재 존재하는 `PROGRESS.md`를 있는 그대로 읽어 브라우저(`http://127.0.0.1:4321`)에 표시하는 초경량 읽기 전용(Read-only) 뷰어입니다.
- **바이너리 경계**: Cockpit 바이너리 자체는 저장소를 분석하거나, Git 이력을 검사하거나, `PROGRESS.md`를 수정하거나, AI를 호출하지 않습니다.

#### 2. 외부 역량 에이전트에게 Cockpit 실행/열기 요청 시 (공식 운영 계약)

사용자가 Claude Code, ChatGPT, Gemini 등의 외부 역량 에이전트에게 자연어로:
- *"이 repo에서 Cockpit 실행해줘"*
- *"Cockpit 열어줘"*
- *"이 프로젝트 Cockpit 띄워줘"*

라고 요청했을 때, 에이전트가 따라야 하는 공식 권장 운영 워크플로우(Operator Workflow)는 다음과 같습니다:

```text
1. 기존 PROGRESS.md 읽기
        ↓
2. 현재 repo / runtime / SSOT의 최신 실제 증거(fresh evidence)와 대조
        ↓
3. 기존 open/negative claim 재입장·반증 패스 (Open-Claim Re-admission / Falsification)
   - `남은 문제`, `직면한 문제`, `다음 전환`의 선행조건, material한 `현재 수준` limitation을
     기존 문구가 아니라 fresh evidence로 다시 심사한다.
   - 각 claim에 대해 현재 구현/runtime/proof가 이미 닫혔거나 모순되는지 적극적으로 탐색한다.
        ↓
4. 멘탈 모델 델타 테스트 (Mental Model Delta Test) 수행
   - "현재 PROGRESS.md를 그대로 보여주면 사용자가 프로젝트의 현재 capability,
      Current Stage, Current Focus, material gaps, proof, Next Transition을 오해하는가?"
        ↓
   ├── YES (실질적 차이 존재) → 영향받은 표면만 보수적으로 갱신 (Targeted Refresh)
   └── NO (실질적 차이 없음) → PROGRESS.md 수정하지 않음 (Untouched)
        ↓
5. cockpit check 실행하여 구조적 완전성(PASS) 확인
        ↓
6. cockpit 실행 (뷰어 론칭)
```

> **핵심 원칙**: 최신성 대조(Freshness Check)는 항상 수행하되, 파일 수정(File Mutation)은 실질적인 멘탈 모델 변화(Material Semantic Delta)가 있을 때만 수행합니다.

### 다른 경로의 파일 지정하기

다른 위치에 있는 파일이나 다른 이름의 마크다운 파일을 지정할 수도 있습니다:

```bash
cockpit /path/to/another/PROGRESS.md
cockpit ./docs/PROGRESS.md --port 5000 --no-open
```

### 구조적 완전성 사전 검사 (Structural Preflight Check)

`PROGRESS.md`가 지도 항목과 영역 상세 간 1:1 일치, 궤적 레일당 최대 1개의 Current Stage 그룹(내부 복수 frontier 항목 허용), 필수 섹션 존재 등 구조적으로 완전한지 결정론적으로 검증합니다:

```bash
cockpit check
cockpit check /path/to/PROGRESS.md
```

- **PASS (종료 코드 0)**: 지도의 모든 항목이 영역 상세와 1:1 대응되며 구조적 결함 없음
- **FAIL (종료 코드 1)**: 누락된 영역 상세, 고아(Orphan) 상세(타이틀 불일치), 중복 상세, 동일 레일 내 다중 Current Stage 그룹 오류 목록 출력

#### CLI 옵션

- `cockpit [path/to/PROGRESS.md]` — 뷰어 실행 (생략 시 현재 디렉터리의 `./PROGRESS.md`)
- `cockpit check [path/to/PROGRESS.md]` — 구조적 완전성 검사 후 즉시 종료 (0: PASS, 1: FAIL)
- `--port`, `-p` — 포트 번호 지정 (기본값: `4321`)
- `--no-open` — 브라우저 자동 실행 비활성화
- `--help`, `-h` — 도움말 및 운영자 가이드 출력

---

## 4. Cockpit 동작 원리 및 워크플로우

### 권위 경계 및 동작 원리

Cockpit의 역할과 데이터 흐름은 다음과 같이 명확히 분리되어 있습니다:

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
- **실제 증거 우선**: `PROGRESS.md`는 Cockpit이 읽고 보여주는 단일 현황 문서일 뿐, 최신 코드/런타임/도메인 증거보다 상위의 권위를 갖지 않습니다. 프로젝트 실재가 바뀌면 `PROGRESS.md`는 진부화(stale)될 수 있으며, 실제 증거와 충돌 시 언제나 최신 실제 증거가 우선합니다.
- **외부 에이전트 갱신**: 프로젝트 상태가 달라지면 외부 코딩 에이전트가 최신 실제 증거와 기존 문서를 대조하여 `PROGRESS.md`를 갱신합니다.
- **자동 새로고침 (Live Reload)**: Cockpit은 대상 `PROGRESS.md` 파일 저장을 감시하여 브라우저 새로고침 없이 화면을 즉시 갱신합니다.

### 처음 시작할 때: 새 프로젝트에 PROGRESS.md 작성 요청하기 (First-Use Prompt)

새로운 프로젝트나 기존 프로젝트에 처음 Cockpit을 연결할 때는 외부 역량 에이전트(Claude Code, ChatGPT, Gemini 등)에게 다음 프롬프트를 그대로 복사하여 전달합니다:

```text
이 프로젝트의 실제 상태를 파악하여 Cockpit용 `PROGRESS.md` 문서를 작성해줘.

[다중 패스 증거 동화 및 독자 중심 종합 계약 (Multi-Pass Evidence Assimilation Contract)]
비자명한(non-trivial) 저장소에서 첫 번째 스캔 직후 PROGRESS.md를 곧바로 작성하지 말고, 다음의 독립된 증거/추론 패스를 거쳐 작성해야 한다 (영구 레지스트리/스키마/DB 금지, 에이전트 내부 추론으로 수행):

1. PASS 1 — 권위 및 의도 모델 (Authority / Intent Model):
   - AGENTS.md, README.md, docs/, package.json, 명시적 계약 등 저장소 권위 문서를 통해 제품의 본래 목적, 사용자/소비자, 경계, 영속적 결정 의도를 파악한다.
   - [주의] 문서는 의도/규약의 권위일 뿐, 구현이 실제로 존재하거나 작동한다는 증거가 아니다.

2. PASS 2 — 구현 및 런타임 모델 (Implementation / Runtime Model):
   - Pass 1에 억지로 맞추지 않고, 실제 소스 코드 진입점, 실행 경로, 핵심 컴포넌트, 런타임/서버 동작을 독립적으로 검사한다.
   - 이름만으로 기능을 추론하지 않으며, [구현됨 / 도달 가능함 / 테스트됨 / 단순히 존재만 함 / 불명확함]을 엄격히 구분한다 (존재 != 역량).

3. PASS 3 — 테스트 및 증명 모델 (Test / Proof Model):
   - 테스트 스위트, 픽스처, 스크립트, 검증 아티팩트를 검사하여 실제로 증명된 불변식이 무엇이고, 무엇이 증명되지 않았는지를 파악한다 (테스트 이름/PASS 라벨을 외부 사실의 증거로 비약하지 않음).

4. PASS 4 — 변경 이력 추적 모델 (Change-Trace Model):
   - Git 이력이 존재할 때 최근 커밋과 diff를 검토하여 "실질적으로 무엇이 변경되었고, 프로젝트의 역량/상태/증명에 어떤 영향을 주었는가"를 파악한다 (단순 커밋 제목 로그가 아닌 시맨틱 전환 추적).

5. PASS 5 — 교차 모델 대조 및 증거 진입 심사 (Cross-Model Reconciliation & Evidence Admission):
   - Pass 1~4를 상호 대조하여 후보 주장을 심사한다:
     * ADMIT: 해당 권위/증거 경계에서 직접 뒷받침됨
     * QUALIFY: 명시적 한계가 존재함
     * UNKNOWN: 증거 부족 (모르는 상태 인정)
     * REJECT: 모순되거나, 가상이거나, 진부화되었거나, 막연한 추측임
   - 모순을 사전에 해결하며, 확인되지 않은 가상 주장은 작성 대상에서 배제한다.
   - 기존 PROGRESS.md 문구에는 evidentiary grandfather right가 없다. 특히 `남은 문제`, `직면한 문제`,
     `다음 전환`의 선행조건 및 material한 `현재 수준` limitation은 이미 적혀 있다는 이유만으로
     현재 유효하다고 간주하지 않는다.
   - **OPEN-CLAIM RE-ADMISSION / FALSIFICATION PASS (transient)**를 수행한다:
     1. 위 고감쇠 open/negative claim을 모두 추출한다.
     2. 각 claim에 대해 현재 구현/runtime/proof가 이미 닫거나 모순하는지 적극적으로 탐색하고,
        가장 가까운 semantic owner와 직접 proof를 확인한다.
     3. 각 claim을 정확히 하나로 임시 분류한다: `STILL_OPEN`, `CLOSED`, `PROOF_GAP`, `NOT_ADMITTED`.
     4. 분류는 추론 중에만 유지하며 PROGRESS.md, registry, schema, DB에 기록하지 않는다.
   - `STILL_OPEN`은 current positive evidence가 미충족 invariant/acceptance/workflow 또는 필요한
     proof boundary를 직접 보여줄 때만 사용한다. `CLOSED`는 현재 구현/runtime/proof가 gap의 해소를
     확립할 때, `PROOF_GAP`은 capability는 있을 수 있으나 요구된 exact proof가 없을 때, `NOT_ADMITTED`는
     추측·선택적 개선·미래 기능·사용자 소유 결정 또는 현재 defect가 아닌 경우에 사용한다.

6. PASS 6 — 초안 작성 및 멘탈 모델 분해 (First Synthesis & Map Decomposition):
   - 실제 프로젝트 시맨틱에 기반하여 지도를 분해한다 (단순 폴더 구조 복사 금지).
   - 압축 손실 테스트(Compression Loss Test)를 적용하여 이질적인 영역은 분리 보존하고, 독립된 멘탈 모델 축은 H3 레일로 분리한다.
   - 명시적 목록 문법(번호 목록: 순차 흐름/화살표, 글머리 기호: 대등 카드)을 사용한다.
   - 궤적 레일의 Current Stage(`#### 현재 단계`)는 객관적 frontier 컨테이너로 설정한다 (복수 frontier 허용).
   - Current Focus(`## 현재 집중`)는 사용자 소유이며, 신뢰할 수 있는 사용자 방향 증거가 없다면 생략한다 (활동량/현재 task 기반 자동 추론 금지).

7. PASS 7 — 적대적 모순 감사 (Adversarial Audit — 필수 2차 사이클):
   - 작성된 초안을 엄격하게 공격하여 다음 허위/날조 요소가 있는지 점검한다:
     * 가상의 외부 시스템 / EMR / 검증 파이프라인
     * 가상의 사용자 / 고객 / 조직
     * 가상의 성능 수치 / 처리량 (예: 10k msg/s 등)
     * 가상의 규정 / 컴플라이언스
     * 가상의 미래 단계 / 가상의 장애 / 가상의 정해진 방향
   - 기존 material open/negative claim마다 closure 및 counterevidence를 찾는다. 예전 문구를 지지하는
     근거만 재확인하지 말고, 현재 evidence가 해당 claim을 닫거나 반증하는지 먼저 공격적으로 확인한다.
   - negative claim을 current defect, proof gap, future enhancement, user-owned product decision으로
     구분한다. current defect가 아닌 항목을 `남은 문제`로 되살리거나 작업으로 승격하지 않는다.
   - "이 주장의 구체적 증거가 저장소 어디에 있는가?"에 답할 수 없다면 즉시 삭제하거나 한계를 명시한다 (Zero Tolerance for Plausible Fiction).

8. PASS 8 — 독자 중심 종합 및 구조 사전 검사 (Reader Reconstruction & Structural Preflight):
   - 외부인 관점의 6대 독자 테스트(WHAT, STRUCTURE, RELATION, WHERE, FOCUS, PATH)를 통과하는지 점검한다.
   - `cockpit check`를 실행하여 지도-상세 1:1 일치, 고아/중복 없음(PASS)을 기계적으로 확인한다.

[마크다운 구조 및 작성 규칙]
아래 마크다운 구조에 맞춰 사실 기반으로 작성해줘:

# [프로젝트 이름]

## 현재 집중 (선택 사항)
사용자가 현재 중요하게 보고 있는 핵심 product/problem focus. (사용자 의도나 확정된 방향 기반. 단순 activity나 현재 executor task로 자동 추론하지 않으며, 증거가 없으면 생략).

## 프로젝트 지도

### [프로젝트 고유의 1차 분류 레일]
#### [해당 레일 내부의 논리적 그룹 (대등/집합 관계인 경우)]
- **[영역 이름]** — 해당 영역이 프로젝트에 기여하는 실질적 역할/가치를 담은 한 줄 요약 (글머리 기호: 대등 카드 렌더링)

#### [해당 레일 내부의 순차적 흐름 그룹 (명시적 순서/흐름 관계인 경우)]
1. **[1단계 영역 이름]** — 1단계 역할/가치 한 줄 요약 (번호 목록: 방향성 커넥터 및 순서 렌더링)
2. **[2단계 영역 이름]** — 2단계 역할/가치 한 줄 요약

#### [해당 궤적 레일의 객관적 현재 frontier인 경우: 현재 단계]
- **[현재 frontier 영역 A]** — 해당 궤적 레일의 객관적 진행 경로상 현재 frontier에 도달한 영역 (1개 이상 작성 가능)
- **[현재 frontier 영역 B]** — (필요 시) 동시에 현재 frontier에 도달해 있는 다른 영역

### [프로젝트 고유의 2차 분류 레일 (독립적인 멘탈 모델 축이 존재하는 경우에만 추가)]
#### [논리적 그룹]
- **[영역 이름]** — 해당 영역이 프로젝트에 기여하는 실질적 역할/가치를 담은 한 줄 요약

## 영역 상세 (또는 영역별 상세)

### [지도에 등장한 동일한 영역 이름]

#### 의미
해당 영역이 이 시스템/프로젝트에서 수행하는 실질적인 목적, 역할 및 경계 맥락 (저장소를 모르는 독자도 이해할 수 있도록 설명).

#### 현재 수준
인간이 이해할 수 있는 프로젝트 언어로 현재 실제로 확립되었거나 증명된 기능/상태를 먼저 기술하고, 중요한 실질적 한계를 명시한다 (기술적 세부 증거는 근거 섹션에 배치).

#### 남은 문제 (선택 사항: 증거 기반)
- 신선한 repo/runtime/SSOT 증거로 뒷받침되는 구체적 미해결 문제와 실질적 파급 효과 (완벽하지 않다는 이유나 이론적 위험, 단순 템플릿 채우기를 위한 가상 문제 작성 금지. 증거로 확인된 미해결 문제가 없다면 이 소제목 자체를 완전히 생략하며, '없음'이나 '특이사항 없음' 등의 플레이스홀더를 작성하지 않음).

#### 근거
- 현재 수준과 주장을 뒷받침하는 구체적인 코드 파일, 테스트 슈트, 런타임/운영 증거, 커밋 등 기술적 세부 증거 (단순 "코드 확인 완료" 같은 일반론 금지).

### [지도에 등장한 다음 영역 이름...]
(지도에 나열된 모든 검사 대상 영역마다 동일한 영역 제목(H3)으로 필수 항목(의미, 현재 수준, 근거)을 작성하고, 증거가 있는 경우에만 남은 문제를 선택적으로 작성할 것)

## 현재 상황
최근 실질적 변경 이력, 객관적으로 증명된 것 vs 존재하는 것, 핵심 불확실성 및 갭을 포함한 프로젝트 상태 종합 서술.

## 다음 전환
Current Focus가 있을 때 해당 focus가 한 단계 전진하는 가장 가까운 전환 (또는 프로젝트 차원의 가장 가까운 다음 전환).

## 직면한 문제 (선택 사항)
- 현재 진행을 가로막고 있거나 집중적인 해결이 필요한 프로젝트 차원의 실질적 장애 요인 (신선한 증거가 있는 경우에만 작성하며, 프로젝트 수준의 직면 문제가 없으면 생략 가능).

## 최근 진척
- **[주요 시맨틱 전환 1]** — 실질적 변경 내용 및 프로젝트 상태/역량/방향에 미친 영향 (`실질적 변경 → 영향`, 최신순 권장, 약 5~8개 항목)
- **[주요 시맨틱 전환 2]** — ...

## 제품 목표
이 프로젝트가 실제로 가능하게 만들고자 하는 핵심 목적, 해결하는 실질적 필요, 성공의 정의와 책임 경계를 간결하고 정보 밀도 높게 서술.

## 확정된 방향
- [영속적 제약 결정 1]: 제품 경계, 아키텍처 방향, 권위/소유권 등 향후 작업에 실질적 제약을 가하는 합의 (일자 표기는 선택적 메타데이터).
- [영속적 제약 결정 2]: ...

[작성 및 진입 핵심 원칙]
1. 다중 증거 축 독립성 (Independent Evidence Axes):
   - 문서(권위/의도), 코드(구현/런타임), 테스트(증명), Git(변경 이력)은 서로 독립적인 증거 축이다.
   - 한 축의 존재를 다른 축의 증명으로 비약하지 않는다 (문서에 적혀 있다고 구현된 것이 아니며, 코드가 존재한다고 외부 기능이 입증된 것이 아님).

2. 합성 전 대조 및 모순 제거 (Reconciliation Before Synthesis):
   - 첫 번째 훑어보기 직후 템플릿을 채우지 않는다.
   - 축 간의 충돌(문서와 코드의 불일치, 진부화된 로드맵 등)을 먼저 식별하고 사실 기반으로 조정한다.
   - 기존 open/negative claim도 예전에 admitted 되었다는 이유로 유지하지 않으며, closure/counterevidence를 찾는 재입장 심사를 통과한 것만 현재 문맥에 남긴다.

3. 미확인 주장의 엄격한 배제 (Omission Over Fabrication):
   - 불확실하거나 증거가 없는 영역은 억지로 지어내지 않고 UNKNOWN으로 두거나 생략한다.
   - `남은 문제`, `직면한 문제`, `확정된 방향`, `다시 열리는 조건`은 현재 긍정적 증거가 있을 때만 작성하며, 없으면 섹션 자체를 완전히 생략한다.
   - `UNKNOWN != PROBLEM`, `ABSENCE OF PROOF != PROOF OF DEFECT`이며, 정확한 acceptance contract가 그 proof를 요구하고 그 부재가 현재 blocker인 경우에만 예외로 다룬다.

4. Current Focus와 Current Stage의 분리 (Separation of Current Focus & Current Stage):
   - **Current Focus (`## 현재 집중`)**: 사용자 소유의 핵심 관심사. 단순 commit 수, 코드 변경량, 현재 executor task 등으로 자동 추론하지 않으며, 사용자 방향 증거가 없으면 생략한다.
   - **Current Stage (`#### 현재 단계`)**: 특정 궤적 레일 내부의 객관적 현재 frontier 컨테이너. 레일당 최대 1개 그룹을 가지며, 복수의 frontier 항목이 동시에 존재할 수 있다.

5. 최근 진척의 시맨틱 인과성 (Semantic Transitions in Recent Progress):
   - 단순 커밋 로그, PR 목록, 빌드 통과 등의 행위 나열이 아닌 `실질적 변경 → 프로젝트 역량/상태/방향 영향`의 시맨틱 전환을 기술한다.

6. 2단계 검증 및 구조 vs 시맨틱 분리 (STRUCTURALLY VALID != EVIDENCE-GROUNDED):
   - **`cockpit check`**: 마크다운 구조(지도-상세 1:1 대응, 문법)가 완전한지 결정론적으로 검증하는 기계 검사 도구다 (종료 코드 0: PASS).
   - **시맨틱 진실성(Semantic Ground Truth)**: `cockpit check`가 PASS라고 해서 내용이 사실임을 보증하지 않는다. 내용의 사실성, 증거 정합성, 날조 여부 판단은 전적으로 **외부 역량 에이전트의 다중 패스 추론 책임**이다.

7. 태스크 누수 방지 (Task Leakage Prevention):
   - `CURRENT FOCUS != CURRENT STAGE != CURRENT EXECUTOR TASK`, `RECENT TASK != CURRENT STAGE`.
   - 일시적 실행 상태(문서 개편, README 보강, 리팩터링 등 단기 executor task) 자체는 제품의 궤적 단계(Current Stage)가 될 수 없다.

8. 닫힘 시점 정합성 및 증거 비례적 주장 (Closure-Time Coherence & Proportional Claims):
   - 현재 상황과 다음 전환은 작업 완료 및 발행 이후(post-closure)의 상태를 기준으로 기술한다.
   - 주장의 강도는 직접 증거의 입증 범위에 엄격히 비례해야 하며('완벽', '보장', '무중단' 등 과대 표현 배제), 증거가 입증하는 정확한 경계만을 기술한다.
```

### 작업 중 PROGRESS.md 갱신하기

작업을 진행한 뒤 사용자가 직접 외부의 역량 있는 코딩 에이전트(Claude Code, ChatGPT, Gemini 등)에게 다음과 같이 요청하여 `PROGRESS.md`를 갱신합니다:

```text
"이 프로젝트의 기존 PROGRESS.md를 먼저 읽고,
다음 4대 증거 축(권위/의도, 구현/런타임, 테스트/증명, 최근 변경 이력)을 대조하여
영향을 받는 시맨틱 표면만 선별적으로 보수적 갱신(Targeted Refresh)해줘:
  A. PROJECT STATE: repo/runtime/SSOT evidence에서 객관적으로 무엇이 확립되었는가
  B. CURRENT STAGE: 특정 진행 경로(Trajectory Rail)가 객관적으로 어디까지 왔는가 (레일당 최대 1개 그룹, 그룹 내 1개 이상의 객관적 현재 frontier 항목)
  C. CURRENT FOCUS: 사용자가 현재 어떤 product/problem을 중요하게 보고 있는가 (명시적 사용자 방향 증거가 없다면 기존 Focus를 보존하고, 단순 Git 커밋/활동량/현재 task만으로 Focus를 임의 추론하거나 이동하지 마)
  D. RECENT PROGRESS: 단순 커밋 로그가 아닌 실질적 변경에 따른 시맨틱 전환 이력 기록
독자 관점의 필수 항목(의미, 현재 수준, 근거)과 명시적 관계 문법을 엄격히 유지하고,
기존 `남은 문제`, `직면한 문제`, `다음 전환`의 선행조건 및 material한 `현재 수준` limitation을
모두 open claim으로 재입장시켜, 이미 닫혔거나 현재 defect가 아닌지 closure/counterevidence를 적극적으로 탐색해줘.
첫 substantial assimilation에서는 모든 Area와 project-level claim을 재검증하고, 일반 bounded-task refresh에서는
직접 영향받은 Area와 truth가 달라질 수 있는 project-level `직면한 문제`/`다음 전환`만 재검증해줘.
각 claim은 추론 중에만 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 분류하고 이 label을 저장하지 마.
실제 증거로 확인된 미해결 문제(증거가 없으면 '남은 문제' 섹션을 생략하며, '없음'을 날조하지 마)와 다단계 향후 여정을 보존하며,
확인되지 않은 성공이나 가상의 문제를 성급히 주장/날조하지 마.
저장 전 반드시 `cockpit check`를 실행하여 구조적 완전성을 기계적으로 증명해줘."
```

에이전트가 `PROGRESS.md`를 저장하면, 열려 있는 Cockpit 화면에 즉시 변경사항이 반영됩니다.

### 멘탈 모델 델타 테스트 및 운영자 가이드라인 (Mental Model Delta Test & Operator Guidelines)

외부 역량 에이전트가 `PROGRESS.md`의 최신성을 대조하거나 갱신할 때는 다음 핵심 원칙을 따릅니다:

#### 1. 멘탈 모델 델타 테스트 (Mental Model Delta Test)
외부 역량 에이전트는 다음 핵심 질문을 통해 `PROGRESS.md` 수정 여부를 판단합니다:
> **“현재 PROGRESS.md를 그대로 보여주면, 사용자가 프로젝트의 capability, 위치(Current Stage frontier), 관심점(Current Focus), material gaps, proof 또는 다음 경로(Next Transition)를 실질적으로 잘못 이해하게 되는가? 특히 fresh evidence가 이미 닫혔거나 잘못 분류했거나 더 이상 적용되지 않는 problem, blocker, limitation 또는 Next Transition prerequisite를 현재 문서가 계속 보존하고 있지는 않은가?”**

- **NO (실질적 오해 없음)** → `PROGRESS.md`를 일체 수정하지 않습니다 (Unchanged).
- **YES (실질적 왜곡 발생)** → 영향을 받는 시맨틱 표면만 선별적으로 보수적 갱신합니다 (Targeted Refresh).
- 닫힌 `남은 문제` 하나를 제거하는 것은 Current Stage/Focus가 움직이지 않거나 이번 task에서 새 feature가 추가되지 않아도 material semantic delta다. `FRONTIER UNCHANGED`와 `PROGRESS NO_CHANGE`를 동일시하지 않는다.

*이 테스트는 외부 역량 에이전트의 지능적 판단 규칙이며, 기계적 점수화(score)나 파서 차원의 기계적 검증으로 대체하지 않습니다.*

#### 2. 프로젝트 재진입 시 최신성 확인 (Re-entry Freshness)
오랜만에 프로젝트를 다시 여는 경우에도 동일한 계약을 적용합니다:
- **“시간의 경과는 재확인(recheck)의 이유이지, 파일 수정(mutate)의 이유가 아니다 (Time is a reason to recheck, not a reason to mutate).”**
- 시간이 흘렀다는 이유만으로 문서를 수정하지 않습니다.
- Git 프로젝트라면 외부 에이전트는 필요 시 `PROGRESS.md`의 마지막 유용한 기준선 이후의 실질적 변경 이력(Change Trace)을 비례적으로 확인할 수 있습니다 (기계적으로 전체 Git 이력을 재생하거나 고정 커밋 수를 강제하지 않음).
- 첫 substantial assimilation/re-entry에서는 최신 change trace 범위를 넘어 모든 기존 high-decay open/negative claim을 재입장시킨다.
- 일반 bounded-task targeted refresh에서는 직접 영향받은 Area의 claim을 재입장시키고, task가 truth를 바꿀 수 있는 project-level `직면한 문제`와 `다음 전환` prerequisite도 확인한다. 무관한 stable Area를 기계적으로 재검색하지 않는다.

#### 3. 유계 태스크 종료(Bounded Task Closure) 및 발행과의 관계
- 태스크 종료나 커밋/발행 자체가 자동 파일 수정 트리거가 아닙니다.
- Bounded Task Closure는 *“이 작업으로 프로젝트 멘탈 모델이 실질적으로 달라졌는가?”*를 점검하는 **진입 심사 체크포인트(Admission Checkpoint)**입니다.
- 실질적인 시맨틱 델타가 발생했다면 해당 작업 흐름 안에서 영향받은 `PROGRESS.md`를 갱신하는 것이 기본 운영 방식이며, 델타가 없다면 문서를 건드리지 않습니다.
- 기존 open claim이 fresh evidence로 `CLOSED`/`NOT_ADMITTED`로 판정되어 제거되거나, `PROOF_GAP`으로 재표현되어야 하는 것도 semantic delta다.
- 일회성 Execution Wave 생성 자체 역시 갱신 트리거가 아닙니다.

#### 4. Current Focus 보존 특별 규칙
- Current Focus(`## 현재 집중`)는 저장소의 단순 활동량(최근 커밋 수, 특정 서브시스템의 코드 변경량, 현재 실행 중인 executor task 등)으로 자동 추론하거나 임의로 이동하지 않습니다.
- 기존 Current Focus는 사용자의 명시적인 방향 전환 증거가 없는 한 그대로 보존합니다.
- 사용자가 명시적으로 focus를 변경했다면 이는 시맨틱 델타이므로 `PROGRESS.md` 갱신 대상입니다.

#### 5. 구조적 완전성과 시맨틱 진실성의 분리 (Structural Validity != Semantic Truth)
- `cockpit check`의 통과(PASS, exit 0)는 마크다운 문서가 파싱 가능한 구조적 규약(지도 항목과 영역 상세의 1:1 매칭, 고아/중복 없음)을 만족함을 증명할 뿐, 내용이 실제 저장소의 진실임을 증명하지 않습니다.
- 시맨틱 진실성(Semantic Truth)과 증거 기반 무결성은 외부 역량 에이전트가 다중 패스 동화(Multi-Pass Assimilation) 절차를 통해 독립적으로 확보해야 합니다.

#### 6. 닫힘 시점 정합성 검토 패스 (Closure-Time Coherence Pass)

유계 태스크를 종료하고 `PROGRESS.md` 변경을 확정하기 전, 외부 역량 에이전트는 다음 단계를 거칩니다:

1. **상태 가상 전진**: 저장소 및 프로젝트 상태를 해당 작업이 완료되고 발행된 이후(post-closure)의 상태로 정신적으로 전진시킵니다.
2. **핵심 표면 재독**: 다음 섹션들을 순서대로 다시 읽습니다:
   - `## 현재 상황` (Current Situation)
   - `#### 현재 단계` (Current Stage)
   - `## 다음 전환` (Next Transition)
   - `## 직면한 문제` (Facing Issues)
   - `## 최근 진척` (Recent Progress)
3. **실행 중 서술 제거**: 현재 진행 중인 작업 내용 자체만을 묘사하는 문장을 제거합니다.
4. **시맨틱 진척 이전**: 완료된 시맨틱 전환이 프로젝트 역량/상태를 실질적으로 변화시킨 경우에만 `## 최근 진척`으로 이동합니다.
5. **다음 전환의 미래성 확인**: `## 다음 전환`이 발행 이후 시점에서도 여전히 진정한 미래 마일스톤인지 확인합니다.

실제 구현 및 증명 완료 후, 최종 발행 직전에 실제 최종 후보 문서에 대해 이 점검을 다시 실행합니다.

#### 7. 태스크 누수 방지 및 증거 비례적 주장 (Task Leakage Prevention & Proportional Claims)

- **`CURRENT FOCUS != CURRENT STAGE != CURRENT EXECUTOR TASK`** 및 **`RECENT TASK != CURRENT STAGE`**: 일회성 executor 태스크는 일시적 실행 상태일 뿐 영속적 프로젝트 단계가 아닙니다.
- **주장 강도와 증거의 비례성**: '완벽', '완전히', '보장', '무중단', 'fully', 'guarantees'와 같은 절대적 수식어를 지양하고, 실제 테스트/코드/런타임 증거가 입증하는 구체적 경계와 관찰 사실에 맞춰 기술합니다.

### Problem Framer & Universal Execution Wave 연계 워크플로우

Cockpit은 태스크를 직접 분해하거나 실행을 관리하지 않습니다. Cockpit은 읽기 전용 대시보드이자 프로젝트 문맥을 외부 역량 에이전트에 원클릭으로 전달하는 결정론적 컨텍스트 전송(Deterministic Transport) 도구입니다.

표준적인 운영 루프는 다음과 같습니다:

```text
PROGRESS.md
  ↓ (시각화)
Cockpit
  ↓ (현재 집중 컨텍스트 복사 또는 이 영역 검토하기 클릭)
클립보드 컨텍스트 (자기 완결적 Handoff)
  ↓ (전달)
외부 Problem Framer (Web GPT, Claude, Gemini 등 Capable Agent)
  ↓ (최신 repo/runtime fresh evidence와 대조하여 실제 문제 검증)
일회성 Execution Wave (Transient Execution Wave)
  ├─ NOW / INDEPENDENT: 동일 응답 내 병렬 실행 가능한 개별 executor-neutral prompts
  ├─ SERIAL NOW: 동일 응답 내 순차 실행 순서가 명시된 개별 executor-neutral prompts
  └─ WAIT FOR EVIDENCE: 선행 결과/증거/사용자 결정 대기
  ↓ (개별 실행기 중립적 프롬프트 전달)
독립적인 로컬 코딩 에이전트들 (Claude Code, Gemini CLI 등)
  ↓ (작업 완료 및 터미널 보고)
Problem Framer에서 결과 종합 및 다음 판단
  ↓ (실제 멘탈 모델에 material한 변화 발생 시)
PROGRESS.md 보수적 갱신
```

**핵심 원칙:**
- **Execution Wave 비영속화**: Execution Wave, 태스크 목록, 상태 머신, 에이전트 배정 등은 Cockpit이나 `PROGRESS.md`의 persistent state가 아닙니다. Cockpit에 태스크 관리자/백로그 엔진을 추가하지 않으며, `PROGRESS.md`에 `## Execution Wave` 같은 임시 실행 상태를 기록하지 않습니다.
- **Problem Framer의 역할과 계약**: 복사된 프로젝트 문맥을 전달받은 외부 Problem Framer가 최신 코드/런타임/도메인 실제 증거와 대조하여 문제를 검증합니다.
  - Area Details의 `남은 문제`는 실행 task 목록이 아니라 재검증 대상 claim이다. 각 항목을 task로 승격하기 전에 current evidence로 closure/counterevidence를 적극적으로 탐색하고, 이미 닫혔거나 defect가 아닌 항목은 제거 대상으로 판정한다.
  - 문제가 없으면 무리하게 작업을 제조하지 않고 `NO_ACTION`으로 종료합니다.
  - 전달된 문제가 모두 닫혔거나 추가 조치가 불필요하면 `NO_ACTION / NO_CHANGE`를 유지합니다.
  - 문제가 있으면 지금 확정 가능한 최대 범위에서 `NOW` (병렬 독립 작업), `SERIAL NOW` (동일 표면/상태 공유로 순차 실행이 필요한 작업), `WAIT FOR EVIDENCE` (결과 대기)로 분류하고, 실행 가능한 모든 작업에 대해 executor-neutral 로컬 에이전트 프롬프트를 같은 응답에서 산출합니다.
- **PROGRESS.md 갱신 시점**: Execution Wave가 생성되었다는 이유만으로 `PROGRESS.md`를 갱신하지 않습니다. Bounded tasks가 실제로 완료되어 프로젝트의 객관적 상태나 사용자 관심사(Current Focus)가 실질적으로 달라졌을 때만 해당 멘탈 모델 표면을 갱신합니다.
- **판단 소유권**: claim의 closure/falsification/re-admission은 외부 capable agent가 수행하며, Cockpit binary는 이 판단을 자동화하지 않고 읽기 전용 deterministic presentation/context transport만 제공합니다.

---

## 5. PROGRESS.md 핵심 시맨틱

Cockpit v0.3은 프로젝트의 실질적인 진척과 상태를 정확하게 파악할 수 있도록 다음과 같은 시맨틱 구조와 정보 계층을 사용합니다:

### 독자 중심 3단계 정보 계층 (Information Hierarchy)

Cockpit의 화면 및 문맥 구성은 다음 우선순위 계층을 엄격히 준수합니다:

```text
CURRENT STATE (현재 상태)
    >
RECENT SEMANTIC CHANGE (최근 시맨틱 전환)
    >
STABLE CONTEXT (영속적 맥락 프레임)
```

1. **현재 상태 (Current State — 최우선 독서면)**:
   - **현재 집중 (`## 현재 집중`)**: 사용자가 현재 중요하게 보고 있는 핵심 관심사.
   - **프로젝트 지도 (`## 프로젝트 지도`)**: 프로젝트 고유의 궤적/중립 레일 및 영역 카드.
   - **현재 상황 (`## 현재 상황`)**: 최근 실질적 변경 및 객관적 상태 종합.
   - **다음 전환 (`## 다음 전환`)**: 현재 상태/Focus가 전진하는 가장 가까운 다음 마일스톤.
   - **직면한 문제 (`## 직면한 문제`)**: 해결이 필요한 실질적 블로커.
   - **영역 상세 (`## 영역 상세`)**: 각 영역의 의미, 현재 수준, 근거 및 (증거 기반 미해결 문제가 있는 경우) 남은 문제.
2. **최근 시맨틱 전환 (Recent Progress — 하단 주 독서면)**:
   - **최근 진척 (`## 최근 진척` / `## Recent Progress`)**: "이 프로젝트가 이전 상태에서 현재 상태로 어떻게 실질적으로 도달했는가?"를 설명하는 시맨틱 전환 이력. 하단 영역에서 가장 넓고 명확한 독서면으로 렌더링됩니다.
3. **영속적 맥락 프레임 (Stable Context — 하단 보조 그리드)**:
   - **제품 목표 (`## 제품 목표`)** 및 **확정된 방향 (`## 확정된 방향`)**: 느리게 변하는 고정 기반 맥락으로, 하단에서 공간 낭비 없이 정보 밀도 높은 컴팩트 에디토리얼 패널로 나란히 배치됩니다.

---

### 하단 맥락 영역 작성 가이드라인 (Authoring Semantics)

외부 역량 에이전트가 `PROGRESS.md`의 하단 맥락 섹션을 작성/갱신할 때는 다음 기준을 따릅니다:

#### 1. 제품 목표 (Product Goal / Project Frame)
- **목적**: 저장소 이력을 모르는 외부인도 **"이 프로젝트가 왜 존재하고 무엇을 가능하게 하려는가?"**, **"어떤 사용자/시스템 필요를 충족하며 무엇이 성공의 경계인가?"**를 즉시 이해할 수 있도록 간결하고 정보 밀도 높게 설명합니다.
- **지양**: 단순 홍보 슬로건, 막연한 미션 선언문, 아키텍처 나열, 태스크 목록, 히스토리 로그.
- **원칙**: 소수의 정보 밀도 높은 문장이나 글머리 기호로 작성하며, 인위적인 파서 줄 수 제한을 두지 않습니다.

#### 2. 확정된 방향 (Settled Direction)
- **목적**: 현재 프로젝트의 해석 방식이나 향후 작업 진행을 **실질적으로 제약하는 영속적(durable) 결정**만 선별 기록합니다 (예: 제품 경계, 핵심 아키텍처 방향, 권위/소유권 결정, 작업 방식 합의 등).
- **지양**: 모든 사소한 결정 목록, 시간순 ADR 색인, 완료된 작업/커밋 나열, 불확실한 미래 추측 정책.
- **원칙**: 높은 레버리지를 갖는 영속적 약속들을 간결하게 작성합니다 (일자 표기는 선택적 메타데이터).

#### 3. 최근 진척 (Recent Progress)
- **목적**: 새로운 독자나 재진입한 독자가 **"이 프로젝트가 이전 상태에서 현재 상태로 어떻게 실질적으로 도달했는가?"**를 온전히 재구성할 수 있도록 돕는 시맨틱 전환 이력입니다.
- **형식**: `실질적 변경 (Material Change) → 프로젝트 상태/역량/증명/방향에 미친 영향 (Consequence)`.
  * *모범 예시*: `멀티 프론티어 시맨틱 확립 — 이제 Current Stage가 궤적 레일별 객관적 frontier를 표현하며, 증거에 기반한 복수 frontier 항목 동시 표시를 지원함.`
  * *모범 예시*: `유니버설 Handoff 완료 — 복사된 Focus/Area 컨텍스트가 자기 완결성을 갖추어 새로운 capable agent가 이전 개인 기억 없이도 즉시 문제를 검증하고 Execution Wave를 산출할 수 있음.`
- **지양**: 단순 커밋 SHA, PR 병합, 파일 수정, 테스트 개수 변동, CSS 수정 등 단순 엔지니어링 행위 나열 (기술적 증거는 뒷받침할 수 있으나 시맨틱 항목 자체가 되지 않음).
- **수량**: 증거가 존재할 때 최근 궤적을 복원할 수 있는 **약 5~8개의 실질적 전환**을 최신순으로 기술합니다 (하드 스키마가 아니며, 증거가 부족하면 적은 수만 유지하고 절대 가상 항목을 날조하지 않음).
- **갱신 시점**: 프로젝트에 실질적인 시맨틱 전환이 실제로 발생했을 때만 보수적으로 갱신합니다.

---

### 컨텍스트 Handoff 액션

- **`현재 집중 컨텍스트 복사`**: `## 현재 집중`이 존재할 때 우측 기본 개요의 현재 집중 카드 하단에 표시되는 버튼입니다. 프로젝트 이름, 현재 집중, 현재 상황, 다음 전환, 직면한 문제, 제품 목표, 확정된 방향, 프로젝트 지도, 영역 상세 전체 맥락과 Problem Framer 가이드라인을 원클릭으로 클립보드에 복사합니다. 외부 Problem Framer가 Current Focus를 Next Transition까지 전진시키기 위한 Execution Wave를 수립하도록 돕습니다. (Focus가 없는 문서에서는 버튼이 표시되지 않습니다.)
- **`이 영역 검토하기`**: 지도에서 영역 카드를 클릭하면 나타나는 우측 검사기(Inspector)의 버튼입니다. 선택된 영역의 세부 정보와 핵심 프로젝트 컨텍스트(Current Focus, Current Situation, Next Transition, Product Goal, Settled Direction 등), 그리고 fresh evidence 기반 심층 검토 및 Execution Wave(NOW/SERIAL NOW/WAIT FOR EVIDENCE) 산출 가이드라인을 자기 완결적(self-contained)으로 클립보드에 복사합니다.
- **결정론적 전송 경계**: 두 버튼 모두 AI를 직접 실행하거나 태스크를 생성하지 않으며, 외부 capable agent에 표준화된 컨텍스트와 프레이밍 계약을 전달하는 클립보드 전송 역할만 수행합니다.

### 영역 상세 시맨틱

- **`의미` (필수)**: 해당 영역의 실질적인 목적, 역할 및 경계 맥락 (저장소를 모르는 사람도 이해할 수 있는 설명)
- **`현재 수준` (필수)**: 현재 실제로 수립되었거나 증명된 구현/기능 수준 (과대평가 방지 한계 포함)
- **`근거` (필수)**: 현재 수준 및 상태 주장을 뒷받침하는 실제 코드, 테스트, 런타임, 커밋 증거
- **`남은 문제` (선택 사항)**: 기존에 적혀 있다는 사실이나 명시적 close가 없다는 이유가 아니라, current positive evidence가 material한 invariant/acceptance/workflow가 아직 충족되지 않음을 보여줄 때만 보존한다. 얕은 scan에서 구현을 찾지 못한 것, 이론적 edge case, generic technical debt, "could improve", future feature는 근거가 아니다.
  - 보존 전에는 각 항목을 적극적으로 falsify한다. `UNKNOWN != PROBLEM`, `ABSENCE OF PROOF != PROOF OF DEFECT`이며, 정확한 acceptance contract가 proof를 요구하고 그 부재가 material current blocker인 경우에만 proof 부재를 문제로 다룬다.
  - 의미상 `남은 문제`에 자연스럽게 들어가는 것은 **A. CURRENT DEFECT**(기존 필수 invariant가 위반됨)다. **B. PROOF GAP**은 capability가 있을 수 있으나 required exact proof가 없는 상태로 `현재 수준`/`근거`/acceptance frontier에 비례해 표현하고, **C. FUTURE ENHANCEMENT**는 defect로 만들지 않으며, **D. USER-OWNED PRODUCT DECISION**은 agent가 임의로 결정하지 않는다.
  - 이 구분은 재입장 추론 중의 transient 판단일 뿐 schema나 registry로 저장하지 않는다. 현재 claim은 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 임시 분류한다.
- **`직면한 문제`·`다음 전환`의 선행조건·material한 `현재 수준` limitation**: 모두 동일한 high-decay negative claim으로 취급하여 fresh evidence로 재입장시킨다. 현재 defect가 아니라면 문제/실행 task로 유지하지 않는다.
- **`다시 열리는 조건` (선택 사항)**: 기존에 안정화되었던 영역을 다시 검토하거나 재작업해야 하는 향후 조건/근거

### 마크다운 섹션 구성

Cockpit은 한국어와 영어 `## h2` 헤딩을 모두 지원합니다:

| 섹션 (한국어) | Section (English) | 패널 설명 |
|---|---|---|
| `## 현재 집중` | `## Current Focus` | 우측 기본 개요 최상단: 현재 집중 (사용자 소유의 핵심 관심사) 및 컨텍스트 복사 액션 |
| `## 프로젝트 지도` | `## Project Map` | 프로젝트 고유의 레일/그룹 구조 및 영역 카드 렌더링 |
| `## 영역 상세` / `## 영역별 상세` | `## Area Details` / `## Area Detail` | 각 영역의 세부 속성 (필수: 의미, 현재 수준, 근거 / 선택: 남은 문제, 다시 열리는 조건) |
| `## 현재 상황` / `## 지금` / `## 지금 하는 일` | `## Current Situation` / `## Current Frontier` | 우측 기본 개요: 현재 상황 (최근 실질적 변경 및 객관적 상태 종합) |
| `## 다음 전환` / `## 다음` | `## Next Transition` / `## Next` | 우측 기본 개요: 다음 전환 |
| `## 직면한 문제` / `## 막힌 것` | `## Facing Issues` / `## Blocked` | 우측 기본 개요: 직면한 문제 |
| `## 최근 진척` / `## 최근 완료` | `## Recently Completed` / `## Recent Progress` | 하단 주 독서면: 최근 시맨틱 전환 이력 (실질적 변경 → 영향) |
| `## 제품 목표` / `## 프로젝트 큰 그림` | `## Product Goals` / `## Product Goal` / `## Project Frame` | 하단 영속적 맥락: 프로젝트 존재 이유 및 성공 경계 (컴팩트 에디토리얼) |
| `## 확정된 방향` / `## 이미 정해진 방향` | `## Settled Direction` | 하단 영속적 맥락: 영속적 제약 결정 (컴팩트 에디토리얼) |

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
