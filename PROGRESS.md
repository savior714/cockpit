# Cockpit

## 현재 상황

Cockpit은 사람 손으로 작성한 `PROGRESS.md`를 결정론적으로 읽어 프로젝트의 구조와 상태를 보여주는 로컬 읽기 전용 뷰어다. 지도·영역 근거·Handoff 기반은 확립되어 있고, 이번 contraction으로 Horizon/Stage/Posture/Frontier/Thread/Movement 이중 소유와 실행·발행 handoff 어휘를 제거해 Map-first 단일 책임으로 수렴했다. 현재 무게중심은 수렴된 뷰어의 독립 reader 수용 증명에 있다.

## 다음 전환

수렴된 Map-first 뷰어 → 독립 reader 수용 확정 상태. 처음 보는 독자가 primary surface만으로 목적·구조·위치·다음·제약을 복원하면 닫힌다. 그 이후에는 portable multi-project adoption으로 넘어간다.

## 직면한 문제

- **독립 reader proof 잔여** — 수렴 구조의 fixture·브라우저 검증은 이번 작업에서 닫지만, 저장소 설명 없는 fresh-reader 판정은 다음 전환의 열린 검증으로 남는다.

## 최근 변화

- **제품 의미 수렴** → Horizon/Stage/Posture/Frontier/Thread/Movement 이중 canonical owner와 Execution Wave·BASE·JIT·freshness handoff 어휘를 제거하고 질문당 하나의 plain-text 섹션으로 수렴함.
- **Map-first 복원** → 프로젝트 지도가 다시 첫 화면의 mental anchor가 되고, 프로젝트 현황/다음 단계/진행 제약이 ontology 학습 없이 읽히는 평문 개요가 됨.
- **Handoff 수렴** → Problem Framer handoff가 프로젝트 맥락 전달로 수렴하고, 실행·발행·Git 절차는 repository 자체 계약에 위임함.

## 프로젝트 지도

### Cockpit product journey
#### 확보된 기반
- **Core viewer runtime** — Local read-only rendering and loopback serving
- **Model parser** — Human-readable semantic parsing and map matching

#### 현재 단계
- **Map-first renderer** — Map-anchored orientation projection
- **Area inspector** — Shared contextual drill-down shell

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
사람이 작성한 Markdown을 지도/영역 모델과 평문 개요 섹션으로 변환하는 parser.
#### 현재 수준
지도·영역·개요 단일 소유 구조를 표현할 수 있다. 이중 canonical owner와 relation graph는 제거되었다.
#### 근거
- `src/parser.ts` 파사드와 parser regression fixtures.

### Map-first renderer
#### 의미
지도를 mental anchor로 먼저 보여주고 프로젝트 현황/다음 단계/진행 제약 평문 개요로 방향을 전달하는 top-level presentation.
#### 현재 수준
수렴 구조를 렌더링한다. 독립 reader 수용은 다음 전환의 열린 검증이다.
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
package/loopback 기반은 검증되었지만 다중 외부 project의 실제 adoption은 부분 상태다.
#### 근거
- package smoke 경계와 단순 스키마 fixture.

### Independent comprehension proof
#### 의미
repository 설명이나 raw evidence 없이 reader-visible Cockpit output만 보고 mental model을 복원하는 acceptance.
#### 현재 수준
다음 전환의 열린 검증으로 정의되었고 수렴된 뷰어에서의 독립 판정은 아직 수행되지 않았다.
#### 근거
- `tests/fixtures/nextchart-emr.md`와 `tests/fixtures/cockpit-self.md`의 수렴 스키마 oracle.

## 제품 목표

Cockpit은 외부 capable agent가 정리한 신뢰 가능한 `PROGRESS.md`를 가장 낮은 적절한 evidence 해상도까지 보존하면서, 프로젝트의 전체 위치·상태·다음 전환을 처음 보는 독자에게 짧고 결정론적으로 보여주는 초경량 로컬 viewer다.

## 확정된 방향

- Cockpit은 읽기 전용 renderer이며 project truth를 추론하거나 `PROGRESS.md`를 수정하지 않는다.
- 질문 하나에 섹션 하나: 같은 질문에 답하는 이중 canonical owner를 만들지 않는다.
- Project Map은 mental anchor로 유지하며, Map ↔ Area Detail 대응을 결정론적으로 보존한다.
- Inspector는 overview → area → evidence로 깊어지는 secondary drill-down이다.
- Current Focus는 사용자 소유이고 executor task와 합치지 않는다.
- Handoff는 프로젝트 맥락 전달만 소유하고, 실행·발행·Git 절차는 repository 자체 계약에 위임한다.
