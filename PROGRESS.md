# Cockpit

## 프로젝트 지평

Cockpit은 사람 손으로 작성한 `PROGRESS.md`를 결정론적으로 읽어 프로젝트의 구조와 상태를 보여주는 로컬 읽기 전용 뷰어다. 현재 핵심 파싱·지도·영역 근거·Handoff 기반은 확립되어 있으며, 다음 무게중심은 세부 증거를 보존하면서도 처음 보는 독자가 프로젝트의 위치·자세·다음 전환을 한 번에 이해하는 mental-model-first presentation을 수용하는 데 있다.

## 단계 여정

### 현재 — Stage 0.3: Mental Model Cockpit
- **CLOSED — Human-readable source contract**
- **CLOSED — Deterministic map and area integrity**
- **CLOSED — Local read-only runtime**
- **IN PROOF — Reader-level comprehension**

### 다음 — Stage 0.4: Portable multi-project adoption
NOT OPEN

## 프로젝트 상태

### Core Viewer — STRONG
역할: CORE CAPABILITY
PROGRESS.md를 읽고 지도와 개요를 보여주는 핵심 viewer capability가 현재 코드와 기존 회귀 검증으로 확립되어 있다.
관련 영역: Core viewer runtime

### Model Fidelity — STRONG
사람이 읽는 Markdown의 지도·Area Detail·Handoff 의미를 보존하는 파싱과 1:1 구조 검사가 확립되어 있다.
관련 영역: Model parser, Project map

### Presentation Synthesis — PARTIAL
새로운 Horizon/Stage/Posture/Frontier/Movement 해상도 계층은 구현되었지만, 독립적인 zero-context reader가 이를 이해하는 acceptance는 아직 남아 있다.
관련 최전선: Reader comprehension closure

### Universal Inspection — PARTIAL
하나의 Inspector shell이 posture·stage gate·frontier·movement·area·evidence를 연결하지만 실제 브라우저 상호작용 수용은 별도 확인 범위다.
관련 영역: Universal inspector

### Operational Simplicity — STRONG
런타임은 로컬·읽기 전용·결정론적이며 AI, 데이터베이스, queue, scheduler 없이 현재 문서를 다시 렌더링한다.
관련 영역: Core viewer runtime

### Adoption Readiness — PARTIAL
역할: DELIVERY READINESS
다른 프로젝트가 자체 vocabulary로 같은 mental model을 표현하는 범용성은 fixture 수준에서 확인 중이며 독립 reader proof가 다음 단계 진입을 제한한다.
관련 최전선: Reader comprehension closure
관련 단계: Stage 0.3: Mental Model Cockpit

## 현재 최전선

### Reader comprehension closure
현재: DRAFT
목표: INDEPENDENTLY ACCEPTED

#### 왜 지금
Model fidelity와 구조적 기반은 강해졌으므로, 가장 가까운 consequential transition은 세부 evidence를 읽지 않고도 처음 보는 독자가 프로젝트의 전체 의미를 복원하는지 확인하는 것이다.

#### 완료 의미
독자가 제품 목표, 전체 여정의 위치, 강하게 닫힌 부분, partial/unknown posture, Primary Frontier, 다음 Stage를 막는 제약, 닫힌 항목, evidence drill-down 경로를 한 번에 설명할 수 있다.

#### 이미 닫힌 것
- Human-readable source contract
- Deterministic Project Map ↔ Area Detail correspondence
- Local read-only rendering boundary

관련 단계: Stage 0.3: Mental Model Cockpit
관련 상태: Presentation Synthesis, Adoption Readiness
관련 영역: Mental-model renderer, Universal inspector

#### 근거
- EMR 및 Cockpit의 서로 다른 project-model acceptance fixture가 동일 parser/guardrail 경계를 통과한다.
- 독립 cold-read 판정은 이 문서의 현재 release boundary에서 아직 수행되지 않았다.

## 전략적 흐름

### Portable package — PARTIAL
로컬 package와 loopback 실행 경계는 단순하지만, 여러 외부 project model에서의 설치·운영 루프는 아직 별도 proof다.
관련 상태: Adoption Readiness

### Handoff fidelity — STRONG
Problem Framer Handoff는 fresh evidence 대조와 evidence assimilation과 reader-level projection의 분리를 전달하며 Cockpit runtime의 판단 범위를 확장하지 않는다.
관련 상태: Model Fidelity

## 최근 실질적 변화

### Presentation synthesis
이전: MAP-FIRST
변경: Project Horizon과 Stage/Posture joint view를 Project Map보다 앞에 둔 presentation synthesis 계층을 도입했다.
이후: HORIZON-FIRST
관련 최전선: Reader comprehension closure
관련 영역: Mental-model renderer
#### 근거
- Canonical mental-model sections와 legacy fallback parser가 함께 구현되었다.

### Universal inspector
이전: AREA-ONLY
변경: authored relation을 따라 posture·stage·frontier·movement·area에서 evidence까지 이동하는 하나의 Inspector shell을 도입했다.
이후: UNIVERSAL INSPECTOR
관련 상태: Universal Inspection
관련 영역: Universal inspector
#### 근거
- Breadcrumb/back navigation과 evidence-depth action이 공통 Inspector surface에 연결되어 있다.

## 프로젝트 지도

### Cockpit product journey
#### 확보된 기반
- **Core viewer runtime** — Local read-only rendering and loopback serving
- **Model parser** — Human-readable semantic parsing and legacy aliases
- **Project map** — Deterministic structural map and Area Detail matching

#### 현재 단계
- **Mental-model renderer** — Horizon, Stage, Posture, Frontier, Threads, and Movement synthesis
- **Universal inspector** — Shared contextual drill-down shell

#### 향후 여정
1. **Portable package** — Broader installation and project vocabulary coverage
2. **Independent comprehension proof** — Fresh-reader acceptance of the rendered model

## 영역 상세

### Core viewer runtime
#### 의미
단일 `PROGRESS.md`와 built viewer를 로컬 loopback에서 읽고 렌더링하는 실행 경계.
#### 현재 수준
로컬·읽기 전용·결정론적 runtime으로 확립되어 있다.
#### 근거
- `scripts/serve.mjs`의 단일 문서 서빙과 SSE 재렌더링 경계.

### Model parser
#### 의미
사람이 작성한 Markdown을 semantic sections와 map/detail 모델로 변환하는 parser.
#### 현재 수준
새 mental-model sections, 한·영 aliases, legacy fallback, relation/guardrail 모델을 표현할 수 있다.
#### 근거
- `src/parser.ts`와 parser regression fixtures.

### Project map
#### 의미
프로젝트가 무엇으로 구성되고 어떻게 조직되는지를 보여주는 구조적 지도.
#### 현재 수준
목록 문법의 순차/대등 의미와 map item ↔ Area Detail 대응을 보존한다.
#### 근거
- `renderNativeMap` 및 deterministic structural check.

### Mental-model renderer
#### 의미
세부 evidence를 제거하지 않고 Horizon→Stage/Posture→Frontier→Movement→Map 해상도로 독자에게 투영하는 top-level presentation.
#### 현재 수준
canonical fixture에서 선언된 model을 읽고 joint Stage/Posture hierarchy로 렌더링한다. 독립 reader comprehension은 아직 proof gap이다.
#### 근거
- `src/main.ts`, `src/style.css`, EMR/Cockpit acceptance fixtures.

### Universal inspector
#### 의미
Posture, Stage Gate, Frontier, Strategic Thread, Material Movement, Area, Evidence를 하나의 context-preserving shell에서 탐색하는 drill-down surface.
#### 현재 수준
relation navigation, breadcrumb/back, area Handoff, evidence depth를 지원한다.
#### 근거
- `index.html`의 Universal Inspector shell과 semantic-card interaction path.

### Portable package
#### 의미
다른 project의 `PROGRESS.md`를 자체 vocabulary로 표시할 수 있는 배포·실행 경계.
#### 현재 수준
package/loopback 기반은 검증되었지만 다중 외부 project의 실제 adoption은 부분 상태다.
#### 근거
- package smoke 경계와 Cockpit 자체 fixture의 비-EMR posture vocabulary.

### Independent comprehension proof
#### 의미
repository 설명이나 raw evidence 없이 reader-visible Cockpit output만 보고 mental model을 복원하는 acceptance.
#### 현재 수준
다음 stage를 여는 proof boundary로 정의되었고 현재 독립 판정은 수행되지 않았다.
#### 근거
- `tests/fixtures/nextchart-emr.md`와 `tests/fixtures/cockpit-self.md`의 oracle contract.

## 제품 목표

Cockpit은 외부 capable agent가 정리한 신뢰 가능한 `PROGRESS.md`를 가장 낮은 적절한 evidence 해상도까지 보존하면서, 프로젝트의 전체 위치·상태·다음 전환을 처음 보는 독자에게 짧고 결정론적으로 보여주는 초경량 로컬 viewer다.

## 확정된 방향

- Cockpit은 읽기 전용 renderer이며 project truth를 추론하거나 `PROGRESS.md`를 수정하지 않는다.
- `Evidence Assimilation != Presentation Abstraction`: 외부 capable agent가 evidence를 재구성·재입장한 뒤, 각 surface의 해상도에 맞게 별도로 투영한다.
- Stage는 maturity가 아니며, Posture의 `STRONG | PARTIAL | WEAK | UNKNOWN`과 Stage Blocker 관계를 분리한다.
- Current Focus는 사용자 소유이고 Current Stage, Current Frontier, Current Executor Task와 합치지 않는다.
- Project Map과 Area Detail은 유지한다. Posture는 Map Area의 복제본이 아니라 cross-cutting 상태를 표현한다.
