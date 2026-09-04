# Cockpit

## 현재 상황

Cockpit은 사람 손으로 작성한 `PROGRESS.md`를 결정론적으로 읽어 보여주는 로컬 읽기 전용 뷰어다. 프로젝트 지도가 첫 화면의 기준이며, 현황·다음·제약은 평문 개요로 읽힌다. 의미가 다른 유효 문서에서의 이식 수용이 닫혔고 막는 제품 결함은 없었다. 다음 과제는 사용자 선택 전이다.

## 다음 전환

이식 수용이 닫힌 상태 → 다음 과제가 정해지기 전 상태. 사용자가 다음 과제를 정하면 닫힌다.

## 최근 변화

- **이식 수용 확정** → 의미가 다른 유효 문서에서 지도·상세·맥락 전달·다시 읽기가 그대로 동작함을 확인하고 막는 결함 없이 닫힘.
- **Map journey contraction** → 지도 여정 특권(trajectory/foundation/future/stage-label/이중 위치 표시)을 제거하고 프로젝트 어휘와 YOU ARE HERE 단일 표시로 수렴함.
- **독립 독자 이해 확인** → 주 화면만으로 핵심 질문이 복원됨을 확인하고 제품 결함 없이 닫힘.
- **제품 의미 수렴** → 이중 소유와 실행 어휘를 제거하고 질문당 한 섹션으로 수렴함.
- **Map-first 복원** → 지도가 첫 화면 기준이 되고 개요가 평문으로 읽힘.
- **Handoff 수렴** → 프로젝트 맥락 전달로 수렴하고 실행 절차는 저장소 계약에 위임함.

## 프로젝트 지도

### Cockpit product journey
#### 확보된 기반
- **Core viewer runtime** — Local read-only rendering and loopback serving
- **Model parser** — Human-readable semantic parsing and map matching
- **Independent comprehension proof** — Accepted fresh-reader comprehension of the rendered model
- **Portable package** — Map-first reading that holds across different valid documents

#### 현재 단계
- **Map-first renderer** — Map-anchored orientation projection
- **Area inspector** — Shared contextual drill-down shell

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
지도·영역·개요 단일 소유 구조를 표현할 수 있다.
#### 근거
- `src/parser.ts` 파사드와 parser regression fixtures.

### Map-first renderer
#### 의미
지도를 먼저 보여주고 현황·다음·제약 개요로 방향을 전달하는 화면이다.
#### 현재 수준
수렴 구조를 렌더링한다.
#### 근거
- `src/main.ts` Map-first 셸과 `index.html` 지도 우선 슬롯.

### Area inspector
#### 의미
영역의 의미·현재 수준·남은 문제·근거를 탐색하는 상세 화면이다.
#### 현재 수준
영역→근거 탐색과 영역 맥락 전달을 지원한다.
#### 근거
- `index.html`의 Inspector shell과 영역 카드 interaction path.

### Portable package
#### 의미
의미가 다른 유효 `PROGRESS.md`를 Map-first로 읽는 이식 경계.
#### 현재 수준
의미가 다른 유효 문서에서 parser·지도 투영·상세·맥락 전달·다시 읽기가 그대로 동작함이 확인되어 닫혔다. 넓은 운영 이식은 주장하지 않으며 막는 제품 결함은 없었다.
#### 근거
- 실제 프로젝트 문서·연구 문서·최소 표준 예제에서 첫 화면만으로 핵심 상태·다음·제약을 복원하고 Map-first·프로젝트 어휘·단일 YOU ARE HERE·상세 탐색·맥락 전달·다시 읽기 선택 유지를 확인함.
- 세 문서의 구조 검사가 모두 통과했고 parser·투영·화면·실행 차원의 막는 인과 결함은 없었음.
- 실제 살아 있는 저장소 확인은 한 문서였고 나머지는 유효 fixture이므로 넓은 운영 이식까지 주장하지 않음.

### Independent comprehension proof
#### 의미
화면에 보이는 내용만으로 전체 구조를 복원하는 확인이다.
#### 현재 수준
수렴된 Map-first 화면에서 통과해 확정되었다.
#### 근거
- `tests/fixtures/nextchart-emr.md`와 `tests/fixtures/cockpit-self.md`의 수렴 스키마 oracle.

## 제품 목표

신뢰 가능한 `PROGRESS.md`를 처음 보는 독자에게 짧고 결정론적으로 보여주는 초경량 로컬 뷰어다.

## 확정된 방향

- Cockpit은 읽기 전용 화면이며 `PROGRESS.md`를 추론하거나 수정하지 않는다.
- 질문 하나에 섹션 하나: 같은 질문에 답하는 겹 소유를 만들지 않는다.
- 프로젝트 지도를 기준으로 유지하며, 지도와 영역 상세 대응을 결정론적으로 보존한다.
- 상세 정보 창은 개요 → 영역 → 근거로 깊어지는 보조 화면이다.
- 우선 과제는 사용자 소유이고 실행 작업과 합치지 않는다.
- 맥락 전달은 프로젝트 내용만 소유하고, 실행·발행·Git 절차는 저장소 자체 계약에 위임한다.
