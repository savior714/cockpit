# Cockpit

Cockpit은 프로젝트의 `PROGRESS.md` 파일을 읽어 브라우저에서 실시간으로 시각화해 주는 초경량 로컬 프로젝트 cockpit(Mental-model-first Thin Viewer)입니다.

프로젝트 상태를 일반 마크다운(Markdown)으로 작성해 두면, Cockpit이 이를 파싱하여 프로젝트의 지평·단계·상태·최전선·구조를 결정론적으로 보여주고, 필요할 때 하나의 Universal Inspector에서 근거까지 내려가게 합니다.

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

Cockpit의 실행 방식은 사용자가 직접 명령어를 입력하는 경우와 외부 역량 에이전트에게 실행을 요청하는 경우에 따라 명확히 구분됩니다:

#### 1. 직접 CLI 실행 (사람이 직접 실행)

터미널에서 `cockpit` 명령어를 직접 실행합니다:

```bash
cd my-project
cockpit
```

- **동작 방식**: Cockpit은 현재 존재하는 `PROGRESS.md`를 있는 그대로 읽어 브라우저(`http://127.0.0.1:4321`)에 표시하는 초경량 읽기 전용(Read-only) 뷰어입니다.
- **바이너리 경계**: Cockpit 바이너리 자체는 저장소를 분석하거나, Git 이력을 검사하거나, `PROGRESS.md`를 수정하거나, AI를 호출하지 않습니다.
- **새로고침 의미**: 브라우저 새로고침과 파일 변경 시 live reload는 지정된 현재 `PROGRESS.md`를 다시 읽어 렌더링할 뿐이며, Git을 조회하거나 최신 commit을 가져오는 `Git refresh`가 아닙니다. 문서에 새 전환을 넣는 일은 외부 capable agent의 fresh evidence reconciliation 책임입니다.

#### 2. 외부 역량 에이전트에게 Cockpit 실행/열기 요청 시 (공식 운영 계약)

사용자가 Claude Code, ChatGPT, Gemini 등의 외부 역량 에이전트에게 자연어로:
- *"이 repo에서 Cockpit 실행해줘"*
- *"Cockpit 열어줘"*
- *"이 프로젝트 Cockpit 띄워줘"*

라고 요청했을 때, 에이전트가 따라야 하는 공식 권장 운영 워크플로우(Operator Workflow)는 다음과 같습니다:

```text
1. 기존 mental model의 신뢰성에 따라 진입 모드 선택
   ├── 신뢰성이 최근 독립 evidence와 provenance로 확립됨 → REFRESH
   │    - 기존 PROGRESS.md를 baseline으로 읽고 현재 repo / runtime / SSOT의 fresh evidence와 대조한다.
   │    - Mental Model Delta Test와 Open-Claim Re-admission을 수행하여 material delta가 있는 표면만 Targeted Refresh한다.
   └── 신뢰성을 전제할 수 없음 → RECONSTRUCT
        - 기존 PROGRESS.md는 마지막 비교 전까지 topology/architecture truth가 아닌 historical claim/comparison source로만 취급한다.
        - current authority / code / runtime / proof / relevant Git에서 project model을 독립적으로 다시 구성한다.
        - Coverage Closure와 positive/open model re-admission을 끝낸 뒤에만 synthesis하고, 마지막에 기존 문서와 비교하여 replacement를 결정한다.
        ↓
2. 선택한 경로의 model admission/reconciliation 완료
        ↓
3. RECONSTRUCT 또는 full rebuild라면 최종 project-model synthesis와 reader-facing semantic acceptance 완료
        ↓
4. `cockpit check` 실행하여 구조적 완전성(PASS) 확인
        ↓
5. `cockpit` 실행 (뷰어 론칭)
```

> **핵심 원칙**: REFRESH는 신뢰할 수 있는 baseline에 대한 보수적 delta 경로이고, RECONSTRUCT는 baseline 신뢰성이 없는 경우의 독립 재구성 경로입니다. RECONSTRUCT를 모든 실행의 기본 절차로 만들지는 않되, 기존 문서를 truth로 먼저 읽어 생길 수 있는 anchoring을 허용하지 않습니다. 어느 경로든 파일 수정은 실질적인 멘탈 모델 변화가 있을 때만 수행하며, 새 material transition을 넣을 때는 Recent Progress가 최신순 rolling semantic window로 남아 있는지도 함께 확인합니다.

RECONSTRUCT에서 evidence collection, repository exploration, 또는 subagent 보고서의 충실성은 **입력이지 완료 판정이 아닙니다**. 최종 synthesis/semantic acceptance가 끝나지 않은 문서는 `cockpit check`가 PASS해도 satisfactory RECONSTRUCT 결과가 아닙니다.

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

### 처음 시작할 때: 새 프로젝트에 PROGRESS.md 작성 요청하기 (First-Use / RECONSTRUCT Prompt)

새로운 프로젝트나 기존 프로젝트에 처음 Cockpit을 연결할 때는 기존 mental model의 신뢰성이 아직 확립되지 않았으므로 **RECONSTRUCT** 경로를 사용합니다. 기존 `PROGRESS.md`가 있더라도 독립 재구성을 끝내고 마지막 비교 단계에 도달하기 전에는 project topology/architecture truth로 사용하지 않습니다. 외부 역량 에이전트(Claude Code, ChatGPT, Gemini 등)에게 다음 프롬프트를 그대로 복사하여 전달합니다:

```text
이 프로젝트의 실제 상태를 파악하여 Cockpit용 `PROGRESS.md` 문서를 작성해줘.

[다중 패스 증거 동화 및 독자 중심 종합 계약 (Multi-Pass Evidence Assimilation Contract)]
이 프롬프트는 RECONSTRUCT 경로다. 비자명한(non-trivial) 저장소에서 첫 번째 스캔 직후 PROGRESS.md를 곧바로 작성하지 말고, 기존 PROGRESS.md의 구조나 표현에 맞춰 현재 project model을 만들지 말며, 다음의 독립된 증거/추론 패스를 거쳐 작성해야 한다 (영구 레지스트리/스키마/DB 금지, 에이전트 내부 추론으로 수행):

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

   - **RECONSTRUCT positive-model re-admission (transient)**: 기존 negative/open claim뿐 아니라
     material positive model도 grandfather하지 않는다. subsystem의 존재/역할, A→B→C workflow,
     semantic owner, capability의 구현·검증 여부, Project Map decomposition, Current Stage는
     current evidence가 다시 뒷받침할 때만 admitted한다. 코드·설정·테스트가 존재한다는 사실만으로
     capability나 proof를 인정하지 않는다.

6. PASS 6 — 일시적 semantic surface Coverage Closure:
   - RECONSTRUCT synthesis 전에 material semantic surface를 가능한 범위에서 accounting한다. 각
     surface에 대해 실제 역할, semantic owner, 실제 entry/runtime path, consequential consumer/
     downstream effect, authority/intent source, 직접적인 implementation/proof evidence, relevant
     history가 현재 의미를 바꾸는지, 최종 model에서 represented / intentionally omitted / UNKNOWN
     중 무엇인지 설명할 수 있어야 한다.
   - 특히 Product Goal / Project Frame, Settled Direction, major project trajectories / Project Horizon,
     Current Stage / Current Frontier, Recent Material Movement(그런 evidence가 있을 때)를 subsystem/Area
     surface와 함께 명시적으로 accounting한다.
   - 권위/evidence가 surface를 뒷받침하는데 최종 문서에서 비워 두면 acceptance failure다. surface가
     genuinely unknowable하거나 durable direction이 없다면 빈 heading/placeholder 대신 `UNKNOWN` 또는
     `none-with-boundary`처럼 모르는 범위와 경계를 독자에게 명시한다.
   - 모든 파일/함수 전수 inventory나 coverage %를 만들라는 뜻이 아니다. 이 closure는 agent 내부의
     transient completeness test이며, persistent table/registry/schema/DB/score를 만들거나 PROGRESS에
     저장하지 않는다. 설명되지 않은 material surface가 남아 있으면 synthesis를 완료한 것으로
     간주하지 않는다.

7. PASS 7 — 초안 작성 및 멘탈 모델 분해 (First Synthesis & Map Decomposition):
   - 실제 프로젝트 시맨틱에 기반하여 지도를 분해한다 (단순 폴더 구조 복사 금지).
   - 압축 손실 테스트(Compression Loss Test)를 적용하여 이질적인 영역은 분리 보존하고, 독립된 멘탈 모델 축은 H3 레일로 분리한다.
   - 명시적 목록 문법(번호 목록: 순차 흐름/화살표, 글머리 기호: 대등 카드)을 사용한다.
   - 궤적 레일의 Current Stage(`#### 현재 단계`)는 객관적 frontier 컨테이너로 설정한다 (복수 frontier 허용).
   - Current Focus(`## 현재 집중`)는 사용자 소유이며, 신뢰할 수 있는 사용자 방향 증거가 없다면 생략한다 (활동량/현재 task 기반 자동 추론 금지).

8. PASS 8 — 적대적 모순 감사 (Adversarial Audit — 필수 2차 사이클):
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
   - Project Map의 boundary가 실제 architecture/workflow를 설명하지 못하거나 semantic owner가
     다른 곳에 있다는 direct evidence가 있으면 기존 Area에 억지로 끼워 넣지 말고 map decomposition을
     재검토하며 필요한 범위의 RECONSTRUCT/wider re-entry를 수행한다.

9. PASS 9 — 최종 프로젝트 모델 합성 및 독자 중심 시맨틱 수용 (Final Project-Model Synthesis & Semantic Acceptance):
   - evidence collection/subagent exploration을 completion으로 취급하지 말고, coverage closure 뒤에 admitted evidence를
     Project Horizon 수준까지 투영하는 별도의 최종 synthesis pass를 수행한다.
   - Product Goal / Project Frame, Settled Direction, major project trajectories / Horizon, Current Stage / Frontier,
     evidence가 뒷받침하는 Recent Material Movement와 subsystem/Area를 함께 닫는다. 권위/evidence가 뒷받침하는
     surface를 blank/placeholder로 남기면 acceptance failure다. 정말 알 수 없거나 durable direction이 없으면
     `UNKNOWN` 또는 `none-with-boundary`로 그 경계를 명시한다.
   - cold reader가 이 문서만 읽고 (1) 프로젝트가 무엇인지/왜 존재하는지, (2) 전체 여정의 어디에 있는지,
     (3) 무엇이 다음 상위 전환인지, (4) major trajectory가 무엇인지, (5) 어떤 durable decision이 제약하는지를
     답할 수 있어야 한다. 답하지 못하면 RECONSTRUCT를 완료했다고 부르지 말고 synthesis를 계속하거나
     `COLD_READ_JUDGE_REQUIRED`로 남긴다.
   - 위 semantic acceptance가 끝난 뒤에만 외부인 관점의 6대 독자 테스트(WHAT, STRUCTURE, RELATION, WHERE, FOCUS, PATH)와
     `cockpit check`를 실행한다. `cockpit check` PASS는 구조적 사전 검사일 뿐 semantic acceptance가 아니다.
   - 독립 재구성이 끝난 뒤에만 기존 PROGRESS.md를 읽고 새 model과 비교하여 stale/false/missing semantics를 판별하고
     필요한 replacement를 결정한다. 비교는 독립 synthesis를 대체하지 않으며, replacement로 최종 후보가 바뀌면
     실제 저장할 후보 문서에 대해 최종 semantic acceptance와 `cockpit check`를 다시 수행한다.

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
Project Horizon — "프로젝트는 전체적으로 지금 어떤 상태인가?"에 대한 답. 최근 작업의 chronology나 evidence dump가 아니라, 재입장·reconciliation이 끝난 admitted project model을 프로젝트 전체 수준의 위치로 압축한 서술 (가능하면 성과/범위, 핵심 기반/capability, 검증/readiness, 제품·운영 단계 같은 material category 2~4개).
- **[category]** — project-level 상태 claim (예: **검증/준비도** — 현재 무게중심은 기능 확장보다 release readiness의 최종 증명에 있다.)

## 다음 전환
Project Horizon — "프로젝트가 어떤 상위 상태로 넘어가려 하는가?" Current Focus가 있을 때 해당 focus가 한 단계 전진하는 가장 가까운 전환 (또는 프로젝트 차원의 가장 가까운 다음 전환). executor action/shell command가 아니라 state transition으로 표현한다.
- **전환** — A 상태 → B 상태
- **완료 조건** — B라고 부를 수 있는 project-level condition
- **그 이후** — 이 전환이 닫히면 열리는 다음 trajectory

## 직면한 문제 (선택 사항)
Project Horizon — "방향과 다음 전환을 실제로 제한하는 것은 무엇인가?" bug backlog가 아니라 Blocker / Material Uncertainty / Constraint·Trade-off만 admitted한다.
- **[category]** — 현재 진행을 가로막거나 다음 전환을 제한하는 프로젝트 차원의 실질적 제약 (신선한 증거가 있는 경우에만 작성하며, 프로젝트 수준의 직면 문제가 없으면 생략 가능). 이미 닫힌 defect나 과거 실패 chronology는 올리지 않는다.

## 최근 진척
- **[주요 시맨틱 전환 1]** → 실질적 변경 내용과 프로젝트 상태/역량/방향에 생긴 결과 (최신순 rolling window, 보통 약 5~8개)
- **[주요 시맨틱 전환 2]** → ...

## 제품 목표
이 프로젝트가 실제로 가능하게 만들고자 하는 핵심 목적, 해결하는 실질적 필요, 성공의 정의와 책임 경계를 간결하고 정보 밀도 높게 서술.
(RECONSTRUCT/full rebuild에서는 근거 있는 project frame을 작성하고, 정말 알 수 없으면 빈칸 대신 `UNKNOWN`과 그 경계를 명시한다.)

## 확정된 방향
- [영속적 제약 결정 1]: 제품 경계, 아키텍처 방향, 권위/소유권 등 향후 작업에 실질적 제약을 가하는 합의 (일자 표기는 선택적 메타데이터).
- [영속적 제약 결정 2]: ...
(durable direction이 없거나 근거가 없으면 빈 목록/placeholder 대신 `none-with-boundary` 또는 `UNKNOWN`으로 그 사실을 명시한다.)

[작성 및 진입 핵심 원칙]
1. 다중 증거 축 독립성 (Independent Evidence Axes):
   - 문서(권위/의도), 코드(구현/런타임), 테스트(증명), Git(변경 이력)은 서로 독립적인 증거 축이다.
   - 한 축의 존재를 다른 축의 증명으로 비약하지 않는다 (문서에 적혀 있다고 구현된 것이 아니며, 코드가 존재한다고 외부 기능이 입증된 것이 아님).

2. 합성 전 대조 및 모순 제거 (Reconciliation Before Synthesis):
   - 첫 번째 훑어보기 직후 템플릿을 채우지 않는다.
   - 축 간의 충돌(문서와 코드의 불일치, 진부화된 로드맵 등)을 먼저 식별하고 사실 기반으로 조정한다.
   - 기존 open/negative claim도 예전에 admitted 되었다는 이유로 유지하지 않으며, closure/counterevidence를 찾는 재입장 심사를 통과한 것만 현재 문맥에 남긴다.

3. 미확인 주장의 엄격한 배제 및 BLANK != UNKNOWN (Omission Over Fabrication & Explicit Boundary):
   - 불확실하거나 증거가 없는 영역은 억지로 지어내지 않고 UNKNOWN으로 두거나 생략한다.
   - `남은 문제`, `직면한 문제`, `확정된 방향`, `다시 열리는 조건`은 현재 긍정적 증거가 있을 때만 작성하며, 없으면 섹션 자체를 완전히 생략한다.
   - 반면 RECONSTRUCT에서 Product Goal / Settled Direction과 같이 recoverable authority가 있는 stable context 표면을 묵묵히 빈칸(blank)으로 남겨두는 것은 acceptance failure다. 정말 알 수 없거나 durable direction이 없는 경우에만 `UNKNOWN` 또는 `none-with-boundary`로 그 부재와 경계를 명시한다 (`BLANK != UNKNOWN`).
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

9. evidence assimilation과 reader-level projection의 분리 (Assimilate Deep, Project Shallow):
   - 증거 수집·재입장·reconciliation은 높은 해상도로 수행하되, 각 surface에는 그 surface의 zoom level에 맞게 투영한다. `evidence → admitted project model → surface별 projection`이며, 분석의 정확도를 낮추지 않고 표현 해상도만 분리한다.
   - Overview(현재 상황/다음 전환/직면한 문제)는 project-wide orientation, state transition, material constraint만 담는다. commit SHA, 개별 파일/함수/route, test 개수, test command, CI run, 세부 verifier invocation, 저수준 bug chronology, executor가 수행할 shell command는 Overview의 내용이 아니다.
   - material semantic transition은 최근 진척에, subsystem별 상태/문제/근거는 영역 상세에, exact actionable execution context와 proof identity는 Handoff에 둔다. Overview에서 제거한 세부사항이 이미 적절한 lower-level surface에 존재하면 중복 복사하지 않는다.
   - 닫힌 defect나 과거 실패의 chronology는 어떤 surface에도 현재 문제로 재투사하지 않는다.
```

### 작업 중 PROGRESS.md 갱신하기

작업을 진행한 뒤 사용자가 직접 외부의 역량 있는 코딩 에이전트(Claude Code, ChatGPT, Gemini 등)에게 다음과 같이 요청하여 `PROGRESS.md`를 갱신합니다:

```text
"먼저 이 작업의 진입 모드를 판정해줘. 기존 mental model의 신뢰성이 최근 독립 evidence와 신뢰할 수 있는 provenance로 확립된 경우에만 REFRESH를 사용하고, 그 신뢰성을 전제할 수 없으면 RECONSTRUCT를 사용해줘.
REFRESH에서는 기존 PROGRESS.md를 baseline으로 읽고,
RECONSTRUCT에서는 기존 PROGRESS.md를 마지막 비교 전까지 topology/architecture truth로 사용하지 말고
current authority / code / runtime / proof / relevant Git에서 project model을 독립적으로 다시 구성해줘.
RECONSTRUCT가 필요한 대표 조건은 Cockpit first-use/최초 연결, 사용자의 model 정확성 의문, 여러 stale/false claim,
실제 architecture/workflow와 Project Map 불일치, 장기간 재진입으로 baseline 신뢰 불명확, PROGRESS provenance/fidelity 근거 부족이야.
다음 4대 증거 축(권위/의도, 구현/런타임, 테스트/증명, 최근 변경 이력)을 대조하여
REFRESH라면 영향을 받는 시맨틱 표면만 선별적으로 보수적 갱신(Targeted Refresh)하고,
RECONSTRUCT라면 독립 재구성 → coverage closure → claim admission/uncertainty handling → synthesis를 끝낸 뒤
마지막에만 기존 문서와 비교하여 stale/false/missing semantics의 replacement를 결정해줘.
  A. PROJECT STATE: repo/runtime/SSOT evidence에서 객관적으로 무엇이 확립되었는가
  B. CURRENT STAGE: 특정 진행 경로(Trajectory Rail)가 객관적으로 어디까지 왔는가 (레일당 최대 1개 그룹, 그룹 내 1개 이상의 객관적 현재 frontier 항목)
  C. CURRENT FOCUS: 사용자가 현재 어떤 product/problem을 중요하게 보고 있는가 (명시적 사용자 방향 증거가 없다면 기존 Focus를 보존하고, 단순 Git 커밋/활동량/현재 task만으로 Focus를 임의 추론하거나 이동하지 마)
   D. RECENT PROGRESS: 단순 커밋 로그가 아닌 실질적 변경에 따른 시맨틱 전환 이력 기록. 새 material transition을 넣을 때 오래되어 stable context가 된 항목은 제거할 수 있는지 함께 판단
EVIDENCE ASSIMILATION(권위/구현/runtime/proof/relevant Git 재입장·모순 제거·coverage closure)과 READER-LEVEL PROJECTION(admitted model을 surface별 zoom level로 투영)을 분리해줘.
EVIDENCE ASSIMILATION에서 발견한 high-resolution evidence를 `현재 상황`/`다음 전환`/`직면한 문제` Overview에 그대로 투사하지 말고,
Overview는 project-wide 상태·state transition·material constraint 수준으로 압축하고, subsystem 근거는 영역 상세, material transition은 최근 진척, exact execution context는 Handoff에 둬줘.
독자 관점의 필수 항목(의미, 현재 수준, 근거)과 명시적 관계 문법을 엄격히 유지하고,
기존 `남은 문제`, `직면한 문제`, `다음 전환`의 선행조건 및 material한 `현재 수준` limitation을
모두 open claim으로 재입장시켜, 이미 닫혔거나 현재 defect가 아닌지 closure/counterevidence를 적극적으로 탐색해줘.
RECONSTRUCT에서는 subsystem의 존재/역할, workflow, semantic owner, capability 구현·검증 여부, Project Map decomposition,
Current Stage 같은 material positive model도 기존 문구를 승계하지 말고 current evidence로 다시 admission해줘.
첫 substantial assimilation에서는 모든 Area와 project-level claim을 재검증하고, 일반 bounded-task REFRESH에서는
직접 영향받은 Area와 truth가 달라질 수 있는 project-level `직면한 문제`/`다음 전환`만 재검증해줘.
RECONSTRUCT synthesis 전에 각 material semantic surface의 역할, owner, entry/runtime path, consequential consumer/downstream effect,
authority/intent source, 직접 implementation/proof evidence, relevant history 및 represented / intentionally omitted / UNKNOWN 상태를
transient reasoning으로 설명해줘. 모든 파일/함수 전수 inventory, coverage %, persistent table/registry/schema/DB/score는 만들지 마.
설명되지 않은 material surface가 남으면 synthesis를 조기 종료하지 마.
Focus/Area evidence가 기존 map boundary 자체의 오류를 보여주면 억지로 기존 Area에 맞추지 말고 필요한 범위의 RECONSTRUCT/wider re-entry로
escalate하되, 기본 bounded review를 무관한 repository-wide audit으로 확대하지 마.
각 claim은 추론 중에만 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 분류하고 이 label을 저장하지 마.
실제 증거로 확인된 미해결 문제(증거가 없으면 '남은 문제' 섹션을 생략하며, '없음'을 날조하지 마)와 다단계 향후 여정을 보존하며,
확인되지 않은 성공이나 가상의 문제를 성급히 주장/날조하지 마.
저장 전 반드시 `cockpit check`를 실행하여 구조적 완전성을 기계적으로 증명해줘."
```

에이전트가 `PROGRESS.md`를 저장하면, 열려 있는 Cockpit 화면은 같은 파일을 다시 읽어 변경사항을 반영합니다. 이는 현재 문서의 재렌더링이며 Git 이력 조회나 자동 semantic refresh가 아닙니다.

### 멘탈 모델 델타 테스트 및 운영자 가이드라인 (Mental Model Delta Test & Operator Guidelines)

외부 역량 에이전트가 `PROGRESS.md`의 최신성을 대조하거나 갱신할 때는 다음 핵심 원칙을 따릅니다:

#### 진입 모드: REFRESH와 RECONSTRUCT

- **REFRESH**는 기존 mental model의 신뢰성이 최근 독립 evidence와 신뢰할 수 있는 provenance로 충분히 확립된 경우에만 사용합니다. 기존 `PROGRESS.md`를 baseline으로 삼아 fresh evidence와 대조하고, material semantic delta가 있는 surface만 Targeted Refresh합니다.
- **RECONSTRUCT**는 기존 mental model의 신뢰성을 전제할 수 없을 때 사용합니다. Cockpit first-use/최초 프로젝트 연결, 사용자가 현재 model 정확성에 의문을 제기한 경우, 여러 stale/false claim이 발견된 경우, 실제 architecture/workflow와 Project Map 구조가 맞지 않는 경우, 장기간 재진입으로 baseline 신뢰성이 불명확한 경우, 기존 `PROGRESS.md`의 provenance/fidelity를 신뢰할 근거가 없는 경우가 대표적인 조건입니다.
- RECONSTRUCT에서는 `current authority / code / runtime / proof / relevant Git → independent project reconstruction → coverage closure → claim admission/uncertainty handling → synthesis → existing PROGRESS comparison → replacement` 순서를 유지합니다. 기존 `PROGRESS.md`는 마지막 비교 전까지 historical claim/comparison source일 뿐 topology/architecture truth가 아닙니다.
- RECONSTRUCT에서는 subsystem의 존재·역할, workflow, semantic owner, capability 구현·검증 여부, Project Map decomposition, Current Stage와 같은 material positive model도 current evidence로 다시 admit해야 하며, 기존 문구를 grandfather하지 않습니다. 기존 `남은 문제` 등 negative/open claim의 재입장·반증도 그대로 유지합니다.
- REFRESH와 RECONSTRUCT 모두 evidence assimilation(증거 수집·재입장·reconciliation)과 reader-level projection(admitted model을 surface별 zoom level로 투영)의 두 단계를 분리합니다. assimilation 중 발견한 high-resolution evidence를 `현재 상황`/`다음 전환`/`직면한 문제` Overview에 그대로 투사하지 않고, Overview는 Project Horizon(project-wide 상태·state transition·material constraint)으로 유지하며 subsystem 근거는 영역 상세, material transition은 최근 진척, exact execution context는 Handoff에 둡니다.
- RECONSTRUCT synthesis 전에 material semantic surface마다 역할, owner, entry/runtime path, consequential consumer/downstream effect, authority/intent source, 직접 implementation/proof evidence, relevant history 및 represented / intentionally omitted / UNKNOWN 상태를 transient reasoning으로 닫습니다. 전수 inventory, coverage %, persistent registry/schema/DB/score는 만들지 않습니다.
- Focus/Area review 중 전달된 Area 또는 Project Map의 의미·owner·boundary가 실제 evidence와 맞지 않거나 root cause가 경계를 넘는다는 direct evidence가 나오면 기존 map에 강제 편입하지 않고 필요한 범위에서 RECONSTRUCT 또는 wider re-entry로 escalate합니다. 단순한 가능성만으로 매번 repository-wide audit으로 확대하지 않습니다.

#### 1. 멘탈 모델 델타 테스트 (Mental Model Delta Test)
외부 역량 에이전트는 다음 핵심 질문을 통해 `PROGRESS.md` 수정 여부를 판단합니다:
> **“현재 PROGRESS.md를 그대로 보여주면, 사용자가 프로젝트의 capability, 위치(Current Stage frontier), 관심점(Current Focus), material gaps, proof 또는 다음 경로(Next Transition)를 실질적으로 잘못 이해하게 되는가? 특히 fresh evidence가 이미 닫혔거나 잘못 분류했거나 더 이상 적용되지 않는 problem, blocker, limitation 또는 Next Transition prerequisite를 현재 문서가 계속 보존하고 있지는 않은가?”**

- **NO (실질적 오해 없음)** → `PROGRESS.md`를 일체 수정하지 않습니다 (Unchanged).
- **YES (실질적 왜곡 발생)** → 선택한 모드에 따라 처리합니다. REFRESH라면 영향을 받는 시맨틱 표면만 선별적으로 보수적 갱신하고(Targeted Refresh), RECONSTRUCT라면 독립 재구성·coverage closure·model admission 결과에 따라 필요한 표면을 대체합니다.
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

#### 6. RECONSTRUCT 시맨틱 완료 게이트 (RECONSTRUCT Semantic Acceptance Gate)

RECONSTRUCT 또는 full rebuild에서만 적용하는 최종 authoring gate입니다. REFRESH의 보수적 targeted update를 이 gate 때문에 전체 재작성으로 바꾸지 않습니다.

- **수집은 입력이다**: repository 탐색, subagent 조사, Area/Map coverage 확장은 admitted evidence를 만드는 과정일 뿐 completion이 아닙니다. coverage closure 뒤에 별도의 project-model synthesis를 수행합니다.
- **stable context를 닫는다**: Product Goal / Project Frame, Settled Direction, major project trajectories / Project Horizon, Current Stage / Current Frontier를 subsystem/Area surface와 함께 최종 문서에 투영합니다. Recent Material Movement는 이를 뒷받침하는 material history가 있을 때 포함합니다.
- **빈칸은 수용 결과가 아니다**: authority/evidence가 surface를 뒷받침하면 blank heading·placeholder로 남긴 초안은 acceptance failure입니다. 정말 unknowable하거나 durable direction이 없을 때만 `UNKNOWN` 또는 `none-with-boundary`처럼 독자가 알 수 있는 경계를 작성합니다.
- **cold reader 확인**: repository와 대화 맥락을 모르는 실제 대상 독자가 문서만 읽고 “무엇을 만드는가, 지금 어디인가, 무엇이 다음인가, major trajectory는 무엇인가, 어떤 durable decision이 제약하는가”를 답할 수 있어야 합니다. 독립 reader를 사용할 수 없으면 keyword 검색으로 대체하지 말고 `COLD_READ_JUDGE_REQUIRED`로 남깁니다.
- **구조 검사와 분리**: 이 gate를 통과한 뒤 `cockpit check`를 실행합니다. `cockpit check`의 structural PASS는 map/detail 및 선언된 canonical guardrail의 결정론적 확인일 뿐, 위 semantic acceptance나 authored claim의 진실성을 증명하지 않습니다.

#### 7. 닫힘 시점 정합성 검토 패스 (Closure-Time Coherence Pass)

유계 태스크를 종료하고 `PROGRESS.md` 변경을 확정하기 전, 외부 역량 에이전트는 다음 단계를 거칩니다:

1. **상태 가상 전진**: 저장소 및 프로젝트 상태를 해당 작업이 완료되고 발행된 이후(post-closure)의 상태로 정신적으로 전진시킵니다.
2. **핵심 표면 재독**: 다음 섹션들을 순서대로 다시 읽습니다:
   - `## 현재 상황` (Current Situation)
   - `#### 현재 단계` (Current Stage)
   - `## 다음 전환` (Next Transition)
   - `## 직면한 문제` (Facing Issues)
   - `## 최근 진척` (Recent Progress)
3. **실행 중 서술 제거**: 현재 진행 중인 작업 내용 자체만을 묘사하는 문장을 제거합니다.
4. **시맨틱 진척 이전**: 완료된 시맨틱 전환이 프로젝트 역량/상태를 실질적으로 변화시킨 경우에만 `## 최근 진척`으로 이동하고, 이미 stable context가 되어 현재 상태 복원에 필요하지 않은 오래된 전환은 rolling window에서 제거합니다.
5. **다음 전환의 미래성 확인**: `## 다음 전환`이 발행 이후 시점에서도 여전히 진정한 미래 마일스톤인지 확인합니다.
6. **Fresh-supersession gate — investigator finding vs fresh authority (mutation/repair recommendation을 emit하기 전에만 적용)**: read-only investigation이 새 mutation/repair를 추천하려는 경우 closure 직전에 fresh `origin/main`을 확인하고 fresh SHA를 명시적으로 확보한다. investigation baseline/finding provenance와 fresh authority 사이의 identity/containment를 `rev-parse`, `merge-base --is-ancestor`로 직접 Git authority에서 판정한다. fresh history가 전진했더라도 topology movement 자체만으로 finding을 폐기하거나 유지하지 않는다. investigated defect와 intervening history를 semantic-overlap 관점에서 비교한다 — 동일/직접 관련 source hunk, 동일 contract 또는 behavior, 동일 proof/test surface, superseded fix 여부. fresh authority가 해당 defect의 root cause를 이미 완결적으로 해결하고 필요한 proof까지 포함하면 finding을 `CLOSED / SUPERSEDED_BY_PUBLISHED_FIX`로 재분류하고, 이미 published fix를 재구현하거나 재검증하기 위한 mutation task를 만들지 않으며 `NEXT_REPAIR` 또는 repair handoff를 출력하지 않는다. 단순한 unrelated upstream movement는 기존 규칙대로 information이며 investigation invalidation 사유가 아니다. 부분 fix, 다른 의미의 fix, revert, proof gap 등이 있으면 자동 CLOSED 처리하지 말고 기존 semantic/proof 판단을 적용한다. 새로운 state machine, registry, queue, daemon, task DB, scheduler를 만들지 않고 기존 §6 vocabulary와 Git authority semantics를 재사용한다. 이 gate는 transmitted open claim의 Fresh Evidence/Open-Claim Re-admission과 다르며, investigator가 새로 도출한 finding과 fresh authority 사이의 판정이다. 모든 read-only 작업에 publication workflow를 강제하지 않는다.

실제 구현 및 증명 완료 후, 최종 발행 직전에 실제 최종 후보 문서에 대해 이 점검을 다시 실행합니다.

#### 8. 태스크 누수 방지 및 증거 비례적 주장 (Task Leakage Prevention & Proportional Claims)

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
  - Handoff에 포함된 Project Map, Area, Current Stage 및 positive description은 RECONSTRUCT에서 truth가 아니라 검증할 가설입니다. material positive model도 current evidence로 재입장시킵니다.
  - Area Details의 `남은 문제`는 실행 task 목록이 아니라 재검증 대상 claim이다. 각 항목을 task로 승격하기 전에 current evidence로 closure/counterevidence를 적극적으로 탐색하고, 이미 닫혔거나 defect가 아닌 항목은 제거 대상으로 판정한다.
  - 문제가 없으면 무리하게 작업을 제조하지 않고 `NO_ACTION`으로 종료합니다.
  - 전달된 문제가 모두 닫혔거나 추가 조치가 불필요하면 `NO_ACTION / NO_CHANGE`를 유지합니다.
  - 전달된 Area 또는 Project Map의 의미·semantic owner·boundary가 fresh evidence와 맞지 않으면 기존 map에 강제로 맞추지 않고 필요한 범위의 RECONSTRUCT 또는 wider re-entry로 escalate합니다. direct evidence 없는 임의 확장은 하지 않습니다.
  - 문제가 있으면 지금 확정 가능한 최대 범위에서 `NOW` (mutation owner·semantic surface·proof boundary·publication interaction이 실질적으로 독립적인 병렬 작업), `SERIAL NOW` (각 작업의 bounded target과 성공조건은 확정되었으나 동일 semantic/proof/publication 표면 공유로 병렬 admission 시 충돌/연쇄 staleness 위험이 높아 선행 작업의 publication 후 fresh evidence에서 시작하는 순차 작업; WAIT로 미루지 않음), `WAIT FOR EVIDENCE` (선행 결과가 후속 작업의 필요 여부나 semantic target/ownership/success criterion을 바꿀 때만 대기; READY candidate 존재만으로 WAIT 판정 금지)로 분류하고, 실행 가능한 모든 작업에 대해 executor-neutral 로컬 에이전트 프롬프트를 같은 응답에서 산출합니다.
  - Mutation-intended executor prompt에는 fresh BASE admission 조건(execution 직전 `origin/main` fresh fetch, 실제 admitted `ADMITTED_BASE` SHA 기록 후 semantic work 동안 immutable execution basis 유지, task-owned workspace 시작, stale worktree HEAD/canonical dirty state 상속 금지)과 최소 transient WATCH_SURFACES(`DIRECT_PATHS`/`SEMANTIC_OWNERS`/`PROOF_OWNERS`)를 명시합니다. path를 아직 정확히 모르면 좁은 surface description으로 전달하고 executor가 current evidence로 좁힙니다. 이 3필드는 transient handoff evidence이며 persistent slot/registry/queue/DB가 아닙니다. 이미 만들어진 candidate의 BASE freshness 검사와 아직 시작하지 않은 후속 작업의 scheduling 판단은 서로 다른 단계로 구분합니다.
  - Publication은 short serialization boundary입니다. remote advance를 발견하면 blind retry loop를 돌지 않고 freshness 3축(topology / semantic / proof)을 독립 판정합니다. topology-only movement는 semantic result·reusable proof·candidate/reference preserve 후 최소 final JIT topology binding과 directly affected proof만 수행하는 CONTINUABLE이며 fresh main 위 동일 delta 재적용을 unconditional remediation으로 제시하지 않습니다. semantic owner가 실제로 움직이면 `READMIT`(blind salvage 금지), proof-owner-only movement는 semantic preserve 후 directly affected targeted proof만 재검증하며 semantic overlap과 합쳐 `BLOCKED` 처리하지 않습니다. uncertain이면 bounded read-only classification과 nearest targeted proof로 먼저 줄이고 `UNKNOWN`을 `BLOCKED`/full rebuild로 승격하지 않습니다. final binding 뒤 두 번째 advance는 attempt 패배로 종결(`SEMANTIC_READY`·proof·candidate preserve)하며 같은 attempt에서 rematerialization loop를 열지 않습니다. legacy handoff에 WATCH_SURFACES가 없으면 reconstruction/preserve 우선, missing metadata만으로 semantic work 폐기 금지입니다.
- **PROGRESS.md 갱신 시점**: Execution Wave가 생성되었다는 이유만으로 `PROGRESS.md`를 갱신하지 않습니다. Bounded tasks가 실제로 완료되어 프로젝트의 객관적 상태나 사용자 관심사(Current Focus)가 실질적으로 달라졌을 때만 해당 멘탈 모델 표면을 갱신합니다.
- **판단 소유권**: claim의 closure/falsification/re-admission은 외부 capable agent가 수행하며, Cockpit binary는 이 판단을 자동화하지 않고 읽기 전용 deterministic presentation/context transport만 제공합니다.

#### Cockpit 제품 수용성 검증일 때의 별도 경계 (Real-Project Acceptance Boundary)

앞의 표준 루프는 사용자가 자신의 프로젝트를 발전시키는 **정상 사용자 워크플로우**이며 그대로 유효합니다. Cockpit 자체를 다른 실제 저장소로 수용 테스트할 때만 다음 별도 경계를 적용합니다:

> **TESTBED IS EVIDENCE, NOT THE WORK QUEUE.**

외부 실제 저장소(testbed)의 결함은 Cockpit이 프로젝트의 현재 상태를 올바르게 표현·전달·재조정했는지 판단하기 위한 관찰 증거입니다. 그 결함은 자동으로 Cockpit의 작업 큐가 되지 않으며, acceptance 중에 대상 프로젝트의 개발을 계속할 권한을 부여하지도 않습니다.

수용 테스트의 목적은 다음 질문에 답하는 것입니다:

> Cockpit이 대상 프로젝트의 mental model을 정확히 표현하고, 운반하고, reconciliation 이후에도 올바르게 갱신했는가?

신선한 조사에서 대상 프로젝트를 위한 Execution Wave가 생성되더라도, 그 Wave는 수용 테스트 산출물로서 정확성·실행 가능성을 검사할 수 있을 뿐 자동 실행하지 않습니다. 대상 프로젝트의 한 작업을 post-task reconciliation 자극으로 일부러 실행해야 하는 경우에만, 정확히 하나의 사전 승인된 bounded mutation을 test stimulus로 사용하고, Cockpit의 closure/reconciliation 결과를 관찰한 즉시 중단합니다. 그 자극으로 새롭고 무관한 대상 프로젝트 결함이 드러나도 다음 대상 프로젝트 remediation으로 재귀하지 않습니다. 새 대상 작업은 별도의 acceptance hypothesis 또는 사용자의 명시적인 대상 프로젝트 개발 재개 지시가 필요합니다.

Mutation-bearing acceptance의 최소 흐름은 다음과 같습니다. 읽기 전용 수용 테스트라면 자극을 생략할 수 있지만, 자극을 사용할 때는 하나만 사용합니다:

```text
ONE INTENTIONAL TESTBED STIMULUS
        ↓
OBSERVE target state and Cockpit representation/reconciliation
        ↓
EXTRACT COCKPIT DELTA
        ↓
STOP
```

#### 수용 관찰의 임시 분류

아래 분류는 acceptance 실행 중 판단을 돕는 일시적 라벨일 뿐이며, Cockpit·`PROGRESS.md`·registry·schema·database에 저장하지 않습니다.

| 분류 | 판정 | 조치 |
|---|---|---|
| **COCKPIT DEFECT** | Cockpit 또는 외부 운영 계약이 프로젝트 상태를 잘못 표현·전달·갱신함 | 영향받은 Cockpit 표면의 bounded repair로 승격 |
| **TESTBED DEFECT** | 신선한 증거가 대상 프로젝트 결함을 입증하고 Cockpit은 이를 올바르게 표현·framing함 | acceptance 관찰로 기록하고 대상 프로젝트 remediation은 중단 |
| **MIXED** | 대상 프로젝트 결함은 실제지만 Cockpit도 일부를 잘못 표현·분류함 | Cockpit semantic/transport 결함만 수정하고 대상 프로젝트 수정은 흡수하지 않음 |
| **ENVIRONMENT FRICTION** | 어느 제품 결함이나 대상 프로젝트 결함도 입증하지 못한 acceptance 환경·도구 문제 | 기존 friction 규칙에 따라 `WATCH`/`DROP`/`PROMOTE`하고 프로젝트 상태와 혼동하지 않음 |

예를 들어 실제 release gate가 실패하고 그에 대한 downstream task가 기술적으로 유효하더라도, Cockpit이 실패를 정확히 표현했다면 결론은 `TESTBED DEFECT`입니다. `COCKPIT DEFECT`는 stale claim 유지, 현재 결함과 미도달 proof의 혼합, 잘못된 Current Stage 이동, 자기완결적이지 않은 handoff처럼 Cockpit의 표현·운영 계약이 틀린 경우에만 성립합니다.

#### 휴대 가능한 실제 프로젝트 수용 시나리오

1. Cockpit을 다른 실제 repository에 연결하고, 최신 실제 증거로 대상 프로젝트의 현재 상태를 확인합니다.
2. 대상 프로젝트의 실제 실패가 발견되고, downstream Problem Framer가 기술적으로 유효한 task를 생성합니다.
3. Cockpit이 그 실패와 문맥을 정확히 운반·framing했다면, transport/framing은 `PASS`로 평가할 수 있지만 결함은 testbed evidence로 남깁니다. 해당 task를 실행하지 않습니다.
4. post-task reconciliation을 검증해야 한다면 그 정확한 task 하나만 사전 승인된 stimulus로 실행하고, closure, Current Stage, Remaining Problems, Recent Progress, Next Transition 및 live reload를 관찰합니다.
5. stimulus 이후 두 번째의 무관한 대상 프로젝트 결함이 드러나면, 새 상태를 Cockpit이 올바르게 표현했는지만 평가하고 recursive remediation은 중단합니다. 그 관찰이 Cockpit 결함을 보일 때만 Cockpit bounded target으로 추출합니다.

이 acceptance 경계는 일반 Area/Focus handoff에 전역적인 `do not execute`를 추가하지 않습니다. 정상 사용자 워크플로우에서는 `Cockpit → Problem Framer → 실행 가능한 Execution Wave`가 계속 유효하며, 이 별도 중단 규칙은 Cockpit 제품을 외부 repository로 검증할 때만 적용됩니다.

#### 수용 실행 후 Cockpit 마찰 추출

각 실제 프로젝트 acceptance가 끝나면 다음 질문을 통해 대상 프로젝트의 결함과 Cockpit의 제품·계약 마찰을 분리합니다:

1. Cockpit이 false current fact를 보여주었는가?
2. mental model에 필요한 material fact를 누락했는가?
3. defect, proof gap, future requirement를 잘못 분류했는가?
4. stale open claim을 보존했는가?
5. Current Stage를 올바르게 이동·보존했는가?
6. 사용자 소유의 Current Focus를 보존했는가?
7. handoff에 충분한 문맥이 들어 있었는가?
8. handoff가 downstream framer를 stale claim 신뢰 또는 task 제조로 고정했는가?
9. `NO_ACTION`이 여전히 가능한 상태였는가?
10. test stimulus 이후 closure reconciliation이 post-task world를 올바르게 설명했는가?
11. viewer가 semantic delta를 올바르게 반영했는가?
12. Cockpit의 install/transport/runtime 마찰이 사용을 실질적으로 방해했는가?

이 질문 중 Cockpit/product-contract 결함을 뜻하는 관찰만 다음 Cockpit bounded target이 될 수 있습니다. 대상 프로젝트 결함을 Cockpit backlog로 변환하지 않으며, 이 경계를 위해 acceptance engine, state machine, testbed registry, mutation controller, execution queue, special database 또는 automatic stopping mechanism을 추가하지 않습니다.

---

## 5. PROGRESS.md 핵심 시맨틱

Cockpit v0.3은 프로젝트의 실질적인 진척과 상태를 정확하게 파악할 수 있도록 다음과 같은 시맨틱 구조와 정보 계층을 사용합니다:

### 독자 중심 3단계 정보 계층 (Information Hierarchy)

Cockpit의 화면 및 문맥 구성은 다음 해상도 계층을 엄격히 준수합니다:

```text
PROJECT HORIZON
    ↓
STAGE JOURNEY ↔ PROJECT POSTURE
    ↓
CURRENT FRONTIER → STRATEGIC THREADS → RECENT MATERIAL MOVEMENT
    ↓
PROJECT MAP → AREA DETAIL → EVIDENCE
```

1. **Project Horizon (최상단 orientation)**: 프로젝트 전체가 어디에 있고 어느 방향으로 가는지 2–3문장으로 압축합니다.
2. **Stage Journey ↔ Project Posture (공동 주인공)**: 명시적 여정의 현재/다음 gate와 cross-cutting maturity를 나란히 보여줍니다. Stage는 maturity가 아닙니다.
3. **Current Frontier / Strategic Threads / Recent Material Movement**: 가장 가까운 state transition, durable parallel directions, 최근의 material model delta를 차례로 보여줍니다.
4. **Project Map → Universal Inspector → Evidence**: 구조·영역·근거로 내려가는 상세 해상도입니다. 기존 Map/Area Detail은 제거하거나 Posture로 복제하지 않습니다.
5. **Current Focus / Product Goal / Settled Direction**: 각각 사용자 소유 관심사와 느리게 변하는 stable context로 보존하되, 위 mental-model surface보다 낮은 visual weight로 둡니다.

---

### Mental-model-first canonical contract

새 문서는 다음 semantic surface를 가능한 순서대로 사용합니다. 모든 surface는 사람이 읽을 수 있는 평범한 heading과 본문이며, Cockpit은 선언된 의미를 표시할 뿐 project truth를 추론하지 않습니다.

```text
Project Horizon → Stage Journey ↔ Project Posture
→ Current Frontier → Strategic Threads → Recent Material Movement
→ Project Map → Area Detail → Evidence
```

#### Evidence Assimilation != Presentation Abstraction

외부 capable agent의 작업은 두 단계입니다.

1. **Evidence Assimilation** — 현재 권위, 구현/runtime, proof, relevant Git를 대조하고 모순을 해결하며, stale claim을 재입장시켜 admitted project model을 재구성합니다.
2. **Presentation Synthesis** — admitted model을 독자가 읽을 해상도에 맞게 압축합니다. 분석 중 발견한 commit, test, path, command를 top-level 문장에 그대로 복사하지 않습니다.

Project Horizon은 프로젝트 전체의 위치·핵심 기반·검증/readiness를 2–3개의 concise sentence로 말합니다. `PID`, full SHA, test node, absolute path, exact command, 개별 executor task는 Horizon에 두지 않습니다. 그런 evidence는 Area Detail, Recent Material Movement, Handoff, 또는 Universal Inspector의 Evidence depth에 둡니다.

#### Canonical sections

| Canonical heading | 작성 규칙 |
|---|---|
| `## 프로젝트 지평` / `## Project Horizon` | project-level 현재 상태와 dominant direction. 실행 chronology가 아닌 orientation. |
| `## 단계 여정` / `## Stage Journey` | `### 현재 — Stage ...`, `### 다음 — Stage ...` 아래에 material gate만 기록. Stage는 maturity가 아님. gate나 `NOT OPEN` 단계 block에 `진입 조건:` / `Entry condition:` (또는 `개시 조건:`, `opens when:`) 라인으로 그 단계를 열기 위한 명시적 entry condition을 한 줄로 선언할 수 있다. 각 gate에는 outer 항목 안의 continuation paragraph로 `판정 이유:` (영문 `Decision reason:`) 한 줄을 둘 수 있다. `NOT PROVEN`은 현재 admissible proof가 확인되지 않았다는 뜻이며 failure가 아니고, `FAILED`는 canonical/accepted proof가 terminal failure에 도달했을 때만 쓴다. RECONSTRUCT에서는 durable proof recovery → admissibility 판단 → 정확한 non-positive state + 판정 이유 → 필요한 경우에만 fresh proof execution 순서로 admission한다. |
| `## 프로젝트 상태` / `## Project Posture` | 보통 5–8개의 cross-cutting axis. 각 `### Axis — STRONG/PARTIAL/WEAK/UNKNOWN`에는 한 줄 의미를 둠. |
| `## 현재 최전선` / `## Current Frontier` | 기본 Primary Frontier 하나. `현재: A`, `목표: B` 또는 `A → B` 형태의 state transition. |
| `## 전략적 흐름` / `## Strategic Threads` | 현재 Primary가 아닌 durable parallel direction만 기록. task backlog가 아님. |
| `## 최근 실질적 변화` / `## Recent Material Movement` | Stage/Posture/Frontier/Horizon/Map capability를 실제로 움직인 변화만 `이전/변경/이후`로 기록. activity feed가 아님. |
| `## 프로젝트 지도` / `## Project Map` | 기존 trajectory/neutral 구조를 유지. Posture의 복제본이 아님. |
| `## 영역 상세` / `## Area Details` | Map item마다 `의미`, `현재 수준`, `근거`; 증거 기반인 경우에만 `남은 문제`를 추가. |

Posture axis에는 `역할: CORE CAPABILITY`와 `역할: DELIVERY READINESS` 같은 작은 visible annotation으로 두 conceptual role을 명시할 수 있습니다. 축 이름은 프로젝트에 맞게 고르되 단일 파일·컴포넌트·test family·executor task를 축으로 만들지 않습니다. maturity는 위 네 값만 사용하고 `BLOCKED`는 별도 `STAGE BLOCKER` 관계나 `단계 영향` 문장으로 표현합니다. Ordinary refresh에서는 기존 축을 보존하며, 중복·비중요·성공조건 변화가 직접 입증되었거나 실제 Stage 전환이 생겼을 때만 전체 축을 재검토합니다.

Current Frontier는 기본적으로 하나만 둡니다. 둘이 같은 다음 project-level transition에 독립적으로 필수이고 genuinely parallel인 경우에만 각 항목 heading에 `[CO-PRIMARY]`를 붙여 예외를 명시합니다. 여러 중요한 작업이 있다는 이유만으로 Primary를 늘리거나 frontier를 queue로 만들지 않습니다.

관계는 `관련 영역: Authorization, Audit`, `관련 단계: Stage 1A`, `관련 상태: Security`, `관련 최전선: Exact release convergence`처럼 visible title을 참조합니다. hidden ID, registry, YAML, database를 추가하지 않습니다. `cockpit check`는 선언된 target이 현재 Map/Stage/Posture/Frontier/Movement에 존재하는지 확인합니다.

Universal Inspector는 Posture, Stage Gate, Frontier, Strategic Thread, Material Movement, Area, Evidence를 하나의 shell에서 표시합니다. 관계 버튼과 breadcrumb/back으로 `Security → Audit → Evidence`처럼 이동하며, entity별로 별도 inspector나 window를 만들지 않습니다. Area Detail의 근거와 optional remaining problem은 그대로 보존하되, Posture에는 cross-cutting synthesis만 둡니다.

#### `cockpit check` 작성 문법 (안정 계약)

`src/parser.ts`를 열지 않고 PASS 문서를 만들기 위한 최소 안정 규칙이다. 아래만 지키면 된다. 정규식·AST·헬퍼 이름·tone 분류 같은 구현 세부사항은 계약이 아니며 문서화하지 않는다. 영문 canonical heading도 위 표와 같이 허용된다.

- **필수 vs 선택**: PASS에 필수인 것은 `## 프로젝트 지도`와 `## 영역 상세`뿐이다. 지평/여정/상태/최전선/흐름/변화는 선택 사항이지만, 쓰면 그 섹션의 guardrail을 모두 만족해야 한다.
- **헤딩 레벨**: 최상위 슬롯은 정확히 `##`(H2)이다. `##` 아래에서 `###`는 레일/segment/axis/frontier/movement/영역을, `####`는 그룹/하위 섹션을 만든다. 어떤 `##`에도 속하지 않은 `###`는 구조로 인식되지 않는다.
- **지도**: `###` 레일 → `####` 그룹 → 목록 항목. 항목은 `- **제목** — 한 줄 설명` 형태를 쓴다. 제목은 영역 상세의 `### 제목`과 대소문자/공백 무시 정확히 일치해야 한다. 누락·고아(지도에 없는 상세)·중복 제목은 FAIL이다. `#### 현재 단계`(또는 `Current Stage`)는 정확한 문자열이어야 하며 레일당 최대 1개다. `####` 없는 레일 직속 항목은 인식되지 않는다.
- **영역 상세**: `###` 영역마다 `#### 의미` / `#### 현재 수준` / `#### 근거`를 권장하고, 증거로 확인된 미해결 문제가 있을 때만 `#### 남은 문제`를 둔다. check가 강제하는 것은 영역의 존재·일치이지 하위 섹션 이름이 아니다.
- **단계 여정**: 쓰면 `### 현재 — <Stage>`와 `### 다음 — <Stage>`가 둘 다 있어야 한다. gate는 글머리 목록이며 매 줄마다 상태가 필수다: `STATE — 제목` 또는 `제목 — STATE`. STATE는 `CLOSED`, `IN PROOF`, `NOT OPEN`, `OPEN`, `IN REVIEW`, `PROVEN`, `NOT PROVEN`, `FAILED`, `UNKNOWN`, `BLOCKED` 중 하나다. `PROVEN`은 현재 claim을 성립시키는 admissible proof가 있다는 뜻이고, `NOT PROVEN`은 그런 proof가 확인되지 않았다는 뜻이며 failure를 의미하지 않는다. `FAILED`는 관련 canonical/accepted proof가 실제 terminal failure에 도달했을 때만 쓰고 "증거를 못 찾음"이나 "아직 안 돌림"에는 쓰지 않는다. `CLOSED`는 현재 closure 기준상 닫혔다는 뜻이며 `PROVEN`과 동의어로 재정의하지 않는다. 각 gate에는 outer 항목 안의 continuation paragraph로 `판정 이유:` (영문 `Decision reason:`) 한 줄을 둘 수 있다. nested 목록 항목은 새 gate로 인식되지 않는다. 과거 PASS 주장은 있으나 현재 durable evidence를 재입증하지 못하면 `NOT PROVEN`으로 보수적으로 두고 그 의미를 판정 이유에 자연어로 남기며, historical claim만으로 자동 `PROVEN`하지도 recovery 조사 없이 heavy verifier를 무조건 다시 실행하지도 않는다. 목록이 없는 segment는 본문의 상태 한 줄이 그 segment의 gate가 된다. 진입 조건은 `진입 조건:` / `개시 조건:` / `Entry condition:` / `opens when:` 중 하나로 한 줄 선언한다. 세 disposition(`NOT PROVEN` + historical 미재입증, `FAILED` + terminal failure, `BLOCKED` + 실행 dependency)의 대표 예는 `tests/fixtures/stage-gate-proof-disposition.md`를 본다.
- **프로젝트 상태**: 쓰면 `### 축 이름 — STATE` 5–8개. STATE는 `STRONG`, `PARTIAL`, `WEAK`, `UNKNOWN` 중 하나(heading 접미사 또는 본문 첫 상태 줄)다. `역할: CORE CAPABILITY` 축과 `역할: DELIVERY READINESS` 축이 각각 최소 1개 있어야 한다. `BLOCKED`를 maturity로 쓰면 FAIL이다.
- **현재 최전선**: 기본 1개. 각 항목은 `현재: A` + `목표: B`(또는 `A → B`) 둘 다 있어야 한다. 복수 primary는 전부 `[CO-PRIMARY]`일 때만 허용된다.
- **최근 실질적 변화**: 각 항목은 `이전: A` + `이후: B`(또는 `A → B`) 둘 다 있어야 한다. `변경:` 한 줄을 권장한다. 행위 나열이 아니라 capability를 움직인 전환만 둔다.
- **관계**: `관련 영역:` / `관련 단계:` / `관련 상태:` / `관련 최전선:` / `관련 변화:`(영문 `Related ...:`도 허용) 뒤의 visible title은 현재 문서의 Map/Stage/Posture/Frontier/Movement 제목과 정확히 맞아야 하며, 못 찾으면 FAIL이다. 복수는 쉼표·`및`·`and`로 구분한다. hidden ID·registry·YAML을 추가하지 않는다.
- **지평 위생**: 지평(`## 프로젝트 지평`)에 full Git SHA·PID·pytest 노드·절대경로를 두면 FAIL이다. 그런 evidence는 영역 상세·변화·Handoff에 둔다.
- **현재 집중**: 선택 사항이며 최대 1개다.
- **계약이 아닌 것**: 위 목록에 없는 heading 별칭 전부, 정규식/tone/AST/파서 내부 이름은 안정 계약이 아니다. 새 문서는 위 canonical heading을 쓰고 legacy 별칭에 의존하지 않는다.
- **최소 예제**: `tests/fixtures/canonical-minimal.md`가 위 규칙을 모두 보여주는 복사 시작점이다. 다음이 PASS해야 한다:

  ```bash
  node scripts/serve.mjs check tests/fixtures/canonical-minimal.md
  ```

### Acceptance boundary

`cockpit check`는 headings, axis 수/상태, Primary Frontier cardinality, relation target, movement transition, Map ↔ Area Detail integrity와 Horizon의 명백한 telemetry 누출만 검사합니다. Product Goal / Project Frame이나 Settled Direction이 비어 있는지, stable context가 독자에게 충분한지, authored claim이 사실인지, RECONSTRUCT synthesis가 완료되었는지는 검사하지 않습니다. `PASS`는 문서 구조와 고신뢰 presentation guardrail의 통과이지, authored claim의 사실성이나 semantic truth를 보증하지 않습니다. 구조 변경 시에는 서로 다른 두 real-project-shaped fixture(복잡한 EMR testbed snapshot과 Cockpit 자체 vocabulary)를 parse/render하고, 가능한 환경에서는 실제 viewer에서 Horizon→Stage/Posture→Frontier→Movement→Map→Inspector→Evidence를 관찰합니다.

RECONSTRUCT/full rebuild의 cold-read semantic acceptance는 구조 검사와 별도의 필수 단계입니다. repository와 이 설명을 보지 않은 실제 대상 독자에게 reader-visible output만 주고 다음을 묻습니다: 무엇을 만드는가/왜 존재하는가, 전체 여정의 어디인가, 무엇이 다음 상위 전환인가, major trajectory는 무엇인가, 어떤 durable decision이 제약하는가, 무엇이 강한가/partial인가, 왜 다음 Stage가 열리지 않는가, 무엇을 다시 열지 않아야 하는가, 어디서 evidence를 볼 수 있는가. 독립 reader가 없으면 이를 keyword 검사로 대체하지 말고 `COLD_READ_JUDGE_REQUIRED`로 남깁니다. 이 단계가 닫히지 않으면 `cockpit check` structural PASS만으로 RECONSTRUCT를 완료로 판정하지 않습니다.

---

### 하단 맥락 영역 작성 가이드라인 (Authoring Semantics)

외부 역량 에이전트가 `PROGRESS.md`의 하단 맥락 섹션을 작성/갱신할 때는 다음 기준을 따릅니다:

#### 1. 제품 목표 (Product Goal / Project Frame)
- **목적**: 저장소 이력을 모르는 외부인도 **"이 프로젝트가 왜 존재하고 무엇을 가능하게 하려는가?"**, **"어떤 사용자/시스템 필요를 충족하며 무엇이 성공의 경계인가?"**를 즉시 이해할 수 있도록 간결하고 정보 밀도 높게 설명합니다.
- **지양**: 단순 홍보 슬로건, 막연한 미션 선언문, 아키텍처 나열, 태스크 목록, 히스토리 로그.
- **원칙**: 소수의 정보 밀도 높은 문장이나 글머리 기호로 작성하며, 인위적인 파서 줄 수 제한을 두지 않습니다.
- **RECONSTRUCT 수용**: 권위/evidence가 project frame을 뒷받침하면 빈 heading으로 남기지 않습니다. 정말 목표를 알 수 없을 때만 `UNKNOWN`과 그 경계를 명시하며, evidence-rich Area Detail만으로 이 표면의 답을 생략할 수 없습니다.

#### 2. 확정된 방향 (Settled Direction)
- **목적**: 현재 프로젝트의 해석 방식이나 향후 작업 진행을 **실질적으로 제약하는 영속적(durable) 결정**만 선별 기록합니다 (예: 제품 경계, 핵심 아키텍처 방향, 권위/소유권 결정, 작업 방식 합의 등).
- **지양**: 모든 사소한 결정 목록, 시간순 ADR 색인, 완료된 작업/커밋 나열, 불확실한 미래 추측 정책.
- **원칙**: 높은 레버리지를 갖는 영속적 약속들을 간결하게 작성합니다 (일자 표기는 선택적 메타데이터).
- **RECONSTRUCT 수용**: durable direction이 실제로 있으면 채우고, 없거나 current evidence로 알 수 없으면 빈 목록/placeholder 대신 `none-with-boundary` 또는 `UNKNOWN`과 그 범위를 명시합니다.

#### 3. 최근 진척 (Recent Progress)
- **목적**: 새로운 독자나 재진입한 독자가 **"이 프로젝트가 이전 상태에서 현재 상태로 어떻게 실질적으로 도달했는가?"**를 온전히 재구성할 수 있도록 돕는 시맨틱 전환 이력입니다.
- **독서면**: Recent Progress는 끝없이 누적되는 history archive가 아니라, 현재 상태를 설명하는 **가장 최근의 material semantic transition 약 5~8개**를 담는 rolling window입니다. 새 transition이 들어오면 최신순을 유지하고, 오래되어 이제 stable context가 된 항목은 Current Situation / Area state / Product Frame / Settled Direction 등에 필요한 durable meaning이 남아 있는지 확인한 뒤 제거할 수 있습니다. 이는 고정된 `N개` 기계 규칙이 아닙니다.
- **형식**: 각 항목은 가능한 한 `이전 상태/문제 → 새로운 상태` 또는 `실질적 변경 (Material Change) → 프로젝트 상태/역량/증명/방향에 미친 결과 (Consequence)`로 한눈에 읽혀야 합니다. 전환의 두 면을 구분하기 위해 제목과 결과 사이에 `→`를 권장합니다.
  * *모범 예시*: `멀티 프론티어 시맨틱 확립 → 이제 Current Stage가 궤적 레일별 객관적 frontier를 표현하며, 증거에 기반한 복수 frontier 항목 동시 표시를 지원함.`
  * *모범 예시*: `유니버설 Handoff 완료 → 복사된 Focus/Area 컨텍스트가 자기 완결성을 갖추어 새로운 capable agent가 이전 개인 기억 없이도 즉시 문제를 검증하고 Execution Wave를 산출할 수 있음.`
- **지양**: 단순 커밋 SHA, PR 병합, 파일 수정, 테스트 개수 변동, CSS 수정 등 단순 엔지니어링 행위 나열 (기술적 증거는 뒷받침할 수 있으나 시맨틱 항목 자체가 되지 않음).
- **갱신 시점**: 외부 capable agent가 fresh repository/runtime/SSOT evidence를 reconciliation하여 material semantic delta를 인정했을 때만 보수적으로 갱신합니다. 문서가 바뀌었다는 사실이나 브라우저 새로고침 자체는 갱신 트리거가 아닙니다.

---

#### 4. Overview — Project Horizon (현재 상황 / 다음 전환 / 직면한 문제)
- **목적**: 사용자가 메인 화면을 약 10초 보고 ① 프로젝트가 전체적으로 어디까지 왔는가, ② 어떤 상위 상태로 전환하려 하는가, ③ 그 방향을 실제로 제한하는 핵심 요인은 무엇인가를 이해할 수 있게 하는 프로젝트 방향성 surface.
- **현재 상황**: 재입장·reconciliation이 끝난 admitted project model을 프로젝트 전체 수준의 위치로 압축한다 (가능하면 material category 2~4개, 예: **성과/범위**, **핵심 기반**, **검증/준비도**). 개별 최근 작업의 chronology가 아니다.
- **다음 전환**: `A 상태 → B 상태` + 완료 조건 (+ 그 이후 trajectory) 형태의 project-level state transition. Current Focus가 있으면 focus advancement를 project-level 전환으로 표현하되, command/task 수준으로 축소하지 않는다.
- **직면한 문제**: 방향이나 다음 전환을 실제로 제한하는 Blocker / Material Uncertainty / Constraint·Trade-off만 admitted한다. 과거 실패나 이미 닫힌 defect는 올리지 않는다.
- **지양 (acceptance failure)**: commit SHA, 개별 파일/함수/route/decorator, 특정 test 개수·command, 개별 CI run, 세부 verifier/gate invocation, 저수준 bug chronology, executor용 shell command가 Overview에 먼저 눈에 들어오는 작성.
- **projection 규칙**: high-resolution evidence는 수집하되 Overview에 그대로 복사하지 않는다 (`evidence → admitted project model → Project Horizon projection`). material semantic transition은 최근 진척, subsystem 상태/근거는 영역 상세, exact execution context와 proof identity는 Handoff에 두고, 이미 lower-level surface에 있는 내용을 Overview에 중복 복사하지 않는다. category 이름은 mandatory enum이 아니라 semantic guidance다.

### 컨텍스트 Handoff 액션

- **`현재 집중 컨텍스트 복사`**: `## 현재 집중`이 존재할 때 보조 context 카드에 표시되는 버튼입니다. 프로젝트 이름, 현재 집중, canonical/legacy Horizon, Frontier, Stage/Posture 맥락, 제품 목표, 확정된 방향, 프로젝트 지도, 영역 상세 전체 맥락과 Problem Framer 가이드라인을 원클릭으로 클립보드에 복사합니다. (Focus가 없는 문서에서는 버튼이 표시되지 않습니다.)
- **`이 영역 검토하기`**: 지도에서 영역 카드를 클릭하면 열리는 Universal Inspector의 버튼입니다. 선택된 영역의 세부 정보와 핵심 프로젝트 컨텍스트, fresh evidence 기반 심층 검토 및 Execution Wave(NOW/SERIAL NOW/WAIT FOR EVIDENCE) 산출 가이드라인을 자기 완결적(self-contained)으로 클립보드에 복사합니다.
- **결정론적 전송 경계**: 두 버튼 모두 AI를 직접 실행하거나 태스크를 생성하지 않으며, 외부 capable agent에 표준화된 컨텍스트와 프레이밍 계약을 전달하는 클립보드 전송 역할만 수행합니다.

### 영역 상세 시맨틱

- **`의미` (필수)**: 해당 영역의 실질적인 목적, 역할 및 경계 맥락 (저장소를 모르는 사람도 이해할 수 있는 설명)
- **`현재 수준` (필수)**: 현재 실제로 수립되었거나 증명된 구현/기능 수준 (과대평가 방지 한계 포함)
- **`근거` (필수)**: 현재 수준 및 상태 주장을 뒷받침하는 실제 코드, 테스트, 런타임, 커밋 증거
- **`남은 문제` (선택 사항)**: 기존에 적혀 있다는 사실이나 명시적 close가 없다는 이유가 아니라, current positive evidence가 material한 invariant/acceptance/workflow가 아직 충족되지 않음을 보여줄 때만 보존한다. 얕은 scan에서 구현을 찾지 못한 것, 이론적 edge case, generic technical debt, "could improve", future feature는 근거가 아니다.
  - 보존 전에는 각 항목을 적극적으로 falsify한다. `UNKNOWN != PROBLEM`, `ABSENCE OF PROOF != PROOF OF DEFECT`이며, 정확한 acceptance contract가 proof를 요구하고 그 부재가 material current blocker인 경우에만 proof 부재를 문제로 다룬다.
  - 의미상 `남은 문제`에 자연스럽게 들어가는 것은 **A. CURRENT DEFECT**(기존 필수 invariant가 위반됨)다. **B. PROOF GAP**은 capability가 있을 수 있으나 required exact proof가 없는 상태로 `현재 수준`/`근거`/acceptance frontier에 비례해 표현하고, **C. FUTURE ENHANCEMENT**는 defect로 만들지 않으며, **D. USER-OWNED PRODUCT DECISION**은 agent가 임의로 결정하지 않는다.
  - 이 구분은 재입장 추론 중의 transient 판단일 뿐 schema나 registry로 저장하지 않는다. 현재 claim은 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 임시 분류한다.
- **현재 실패 지점과 미도달 proof의 분리**: Stage가 `A → B → C → D` 순서로 proof를 요구하고 현재 `B`에서 실패했다면, `현재 결함`은 실제로 실패한 `B`만을 가리킨다. 아직 실행하지 않은 `C`/`D`가 나중에 실패할 수 있다는 이유만으로 `남은 문제`에 미리 적지 않는다. `C`/`D`는 Current Stage와 현재 수준·근거에서 stage가 아직 incomplete임을 나타내는 objective acceptance frontier로 표현하고, 정확한 contract가 지금 그 proof를 요구하여 현재 acceptance를 막는 경우에만 `PROOF GAP`으로 표현한다. `C` 또는 `D`가 실제로 실패한 뒤에야 해당 실패를 current problem으로 재입장시킬 수 있다.
- **영역-로컬과 프로젝트-전역 최전선의 소유권 분리 (Area-Local vs Project-Global Frontier Ownership)**: `남은 문제`의 `WHERE`를 `WHAT`만큼 엄격히 가린다. `AREA_LOCAL`(capability·구현·provider admission·영역 내 residual·영역의 다시 열리는 조건)은 해당 Map 항목의 Area Details(`현재 수준`/`남은 문제`/`다시 열리는 조건`)에 둔다. 예: 특정 provider의 live admission이 `NOT PROVEN`이면 그것은 그 provider 영역의 로컬 상태로 적는다. `PROJECT_GLOBAL_FRONTIER`(제품 전체 acceptance·release proof·cross-cutting 통합 closure·전역 발행/readiness 전환)는 `현재 단계`(Current Stage)·`다음 전환`·`직면한 문제` 또는 Stage Journey·Current Frontier·Project Posture 같은 project-horizon surface가 소유한다. 영역은 필요하면 `관련 최전선:`/`관련 단계:` 관계로만 문맥 참조하고, release에 참여한다는 이유만으로 전역 proof 미달을 자신의 `남은 문제` 결함으로 제시하지 않는다. 같은 전역 이슈를 영향받는 모든 영역에 기계적으로 복제하지 않는다. 예외: 특정 영역의 구체적 로컬 결함이 전역 proof 실패의 실제 원인으로 입증되면, 그 영역은 자신의 증거가 뒷받침하는 구체적 로컬 결함만을 `남은 문제`에 적고, 전역 acceptance 귀결(승인 차단·다음 전환 제한)은 project-horizon surface가 소유한다.
- **`직면한 문제`·`다음 전환`의 선행조건·material한 `현재 수준` limitation**: 모두 동일한 high-decay negative claim으로 취급하여 fresh evidence로 재입장시킨다. 현재 defect가 아니라면 문제/실행 task로 유지하지 않는다.
- **`다시 열리는 조건` (선택 사항)**: 기존에 안정화되었던 영역을 다시 검토하거나 재작업해야 하는 향후 조건/근거

### 마크다운 섹션 구성

Cockpit은 한국어와 영어 `## h2` 헤딩을 모두 지원합니다:

| 섹션 (한국어) | Section (English) | 패널 설명 |
|---|---|---|
| `## 프로젝트 지평` | `## Project Horizon` | L0 최상단 orientation: 프로젝트 전체의 현재 상태와 방향 |
| `## 단계 여정` | `## Stage Journey` | 현재/다음 Stage와 material gate families; Stage와 maturity를 분리 |
| `## 프로젝트 상태` | `## Project Posture` | 5–8개 adaptive cross-cutting axes와 STRONG/PARTIAL/WEAK/UNKNOWN maturity |
| `## 현재 최전선` | `## Current Frontier` | 기본 하나의 project-level state transition 및 완료 의미 |
| `## 전략적 흐름` | `## Strategic Threads` | 현재 전환을 소유하지 않는 durable parallel directions |
| `## 최근 실질적 변화` | `## Recent Material Movement` | project model을 움직인 BEFORE → MATERIAL CHANGE → AFTER |
| `## 현재 집중` | `## Current Focus` | 보조 context: 사용자 소유의 핵심 관심사 및 컨텍스트 복사 액션 |
| `## 프로젝트 지도` | `## Project Map` | 프로젝트 고유의 레일/그룹 구조 및 영역 카드 렌더링 |
| `## 영역 상세` / `## 영역별 상세` | `## Area Details` / `## Area Detail` | 각 영역의 세부 속성 (필수: 의미, 현재 수준, 근거 / 선택: 남은 문제, 다시 열리는 조건) |
| `## 현재 상황` / `## 지금` / `## 지금 하는 일` | `## Current Situation` | legacy Project Horizon fallback. 새 `Project Horizon`이 있으면 중복 표시하지 않음 |
| `## 다음 전환` / `## 다음` | `## Next Transition` / `## Next` | legacy Horizon fallback의 전환 문장 (canonical `Current Frontier`가 있으면 별도 중복 표시하지 않음) |
| `## 직면한 문제` / `## 막힌 것` | `## Facing Issues` / `## Blocked` | legacy Horizon fallback의 project-level constraint |
| `## 최근 진척` / `## 최근 완료` | `## Recently Completed` / `## Recent Progress` | legacy movement fallback; canonical `Recent Material Movement`가 있으면 중복 표시하지 않음 |
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
│   ├── main.ts          # 브라우저 앱 오케스트레이션/DOM 배선/렌더링 셸 (의미 해석은 투영 소유자에게 위임)
│   ├── domain.ts        # 명시적 Cockpit 의미/도메인 모델 (표현 오염 없음)
│   ├── authoring-grammar.ts   # README §5의 결정론적 구현 어휘
│   ├── markdown-structure.ts  # markdown-it 토큰 경계/원시 텍스트/문자열 렌더링
│   ├── semantic-construction.ts # 의미/도메인 구성 (문자열→문서 모델 진입점 포함)
│   ├── structural-check.ts    # 구조적 유효성 검사 (의미 진실성 검사 아님)
│   ├── inspector-projection.ts # 도메인→Universal Inspector/뷰 투영 (tone/HTML 소유)
│   ├── handoff-context.ts     # Focus/Area handoff 문맥 구성
│   ├── handoff-contract.ts    # handoff 문구 계약
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
