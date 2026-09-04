# Cockpit

## 현재 상황

Cockpit은 사람 손으로 작성한 `PROGRESS.md`를 결정론적으로 읽어 프로젝트의 구조와 상태를 보여주는 로컬 읽기 전용 뷰어다. 지도·영역 근거·맥락 전달 기반은 확립되어 있고, 이번 정리로 Horizon/Stage/Posture/Frontier/Thread/Movement 이중 소유와 실행·발행 handoff 어휘를 제거해 Map-first 단일 책임으로 수렴했다. 수렴된 Map-first 뷰어는 의도된 독립 독자 이해 확인을 통과해 확정되었다.

## 다음 전환

독립 독자 확인을 마친 Map-first 뷰어 → 여러 프로젝트에서 그대로 쓰는 단계. 다른 프로젝트의 실제 문서에서도 목적·구조·위치·다음·제약이 흔들림 없이 읽히면 닫힌다.

## 최근 변화

- **독립 독자 이해 확인** → 처음 보는 독자가 주 화면만으로 목적·구조·위치·다음·제약과 근거 깊이를 복원하는 확인을 통과했고 제품 결함 없이 닫힘.
- **제품 의미 수렴** → Horizon/Stage/Posture/Frontier/Thread/Movement 이중 canonical owner와 Execution Wave·BASE·JIT·freshness handoff 어휘를 제거하고 질문당 하나의 plain-text 섹션으로 수렴함.
- **Map-first 복원** → 프로젝트 지도가 다시 첫 화면의 mental anchor가 되고, 프로젝트 현황/다음 단계/진행 제약이 ontology 학습 없이 읽히는 평문 개요가 됨.
- **Handoff 수렴** → Problem Framer handoff가 프로젝트 맥락 전달로 수렴하고, 실행·발행·Git 절차는 repository 자체 계약에 위임함.

## 프로젝트 지도

### Cockpit product journey
#### 확보된 기반
- **Core viewer runtime** — Local read-only rendering and loopback serving
- **Model parser** — Human-readable semantic parsing and map matching
- **Independent comprehension proof** — Accepted fresh-reader comprehension of the rendered model

#### 현재 단계
- **Map-first renderer** — Map-anchored orientation projection
- **Area inspector** — Shared contextual drill-down shell

#### 향후 여정
1. **Portable package** — Broader installation and project vocabulary coverage

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
사람이 작성한 Markdown을 지도/영역 모델과 평문 개요 섹션으로 변환하는 parser.
#### 현재 수준
지도·영역·개요 단일 소유 구조를 표현할 수 있다. 이중 canonical owner와 relation graph는 제거되었다.
#### 근거
- `src/parser.ts` 파사드와 parser regression fixtures.

### Map-first renderer
#### 의미
지도를 mental anchor로 먼저 보여주고 프로젝트 현황/다음 단계/진행 제약 평문 개요로 방향을 전달하는 top-level presentation.
#### 현재 수준
수렴 구조를 렌더링하고 독립 독자 확인을 통과해 확정되었다.
#### 근거
- `src/main.ts` Map-first 셸과 `index.html` 지도 우선 슬롯.

### Area inspector
#### 의미
영역의 의미·현재 수준·남은 문제·근거를 context-preserving shell에서 탐색하는 drill-down surface.
#### 현재 수준
영역→근거 탐색과 area Handoff를 지원한다. Stage/Posture/Frontier/Thread/Movement entity는 제거되었다.
#### 근거
- `index.html`의 Inspector shell과 영역 카드 interaction path.

### Portable package
#### 의미
다른 project의 `PROGRESS.md`를 표시할 수 있는 배포·실행 경계.
#### 현재 수준
package/loopback 기반은 검증되었고 여러 프로젝트에서 그대로 쓰는 단계가 다음 전환이다.
#### 근거
- package smoke 경계와 단순 스키마 fixture.

### Independent comprehension proof
#### 의미
저장소 설명이나 원본 증거 없이 화면에 보이는 Cockpit 내용만 보고 전체 구조를 복원하는 확인이다.
#### 현재 수준
수렴된 Map-first 뷰어에서 독립 판정을 통과해 확정되었다. 주 화면만으로 일곱 가지 핵심 질문이 복원되었고 제품 결함은 없었다.
#### 근거
- `tests/fixtures/nextchart-emr.md`와 `tests/fixtures/cockpit-self.md`의 수렴 스키마 oracle.

## 제품 목표

Cockpit은 외부 에이전트가 정리한 신뢰 가능한 `PROGRESS.md`를 꼭 필요한 수준까지 살리면서, 프로젝트의 전체 위치·상태·다음 전환을 처음 보는 독자에게 짧고 결정론적으로 보여주는 초경량 로컬 뷰어다.

## 확정된 방향

- Cockpit은 읽기 전용 renderer이며 project truth를 추론하거나 `PROGRESS.md`를 수정하지 않는다.
- 질문 하나에 섹션 하나: 같은 질문에 답하는 이중 canonical owner를 만들지 않는다.
- Project Map은 mental anchor로 유지하며, Map ↔ Area Detail 대응을 결정론적으로 보존한다.
- Inspector는 overview → area → evidence로 깊어지는 secondary drill-down이다.
- Current Focus는 사용자 소유이고 executor task와 합치지 않는다.
- Handoff는 프로젝트 맥락 전달만 소유하고, 실행·발행·Git 절차는 repository 자체 계약에 위임한다.
