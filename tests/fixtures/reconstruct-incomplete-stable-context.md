# Evidence-Rich but Incomplete Reconstruction

<!--
  Intentional regression fixture.
  The map and Area Details contain substantial evidence, while stable-context
  headings are empty. This must remain structurally valid so the test can prove
  that `cockpit check` is not RECONSTRUCT semantic acceptance.
-->

## 프로젝트 지도

### 핵심 제품 여정

#### 확보된 기반
- **수집 경계** — 외부 입력을 검증하고 내부 처리 경계로 넘기는 핵심 capability

#### 현재 단계
- **정합성 검증** — 저장·재처리 흐름의 상태 일관성을 확인하는 현재 frontier

#### 향후 여정
1. **운영 전환** — 검증된 흐름을 실제 운영 조건으로 확장

## 영역 상세

### 수집 경계

#### 의미
외부 입력을 받아 형식과 권한을 확인한 뒤 내부 처리로 전달하는 제품의 진입 경계.

#### 현재 수준
입력 검증과 실패 응답이 구현되어 단위 및 통합 경로에서 동작이 확인되었다.

#### 근거
- `src/intake/entry.ts`의 payload validation 및 rejection path
- `tests/intake.integration.test.ts`의 malformed-input 회귀 시나리오
- 최근 변경 이력에서 외부 입력 경계의 검증 규칙이 보강됨

### 정합성 검증

#### 의미
처리 중인 데이터의 상태 전이와 재처리를 확인하여 중복·유실을 막는 핵심 내부 capability.

#### 현재 수준
기본 상태 전이와 재처리는 구현·검증되었지만 실제 운영 조건에서의 전체 흐름 proof 범위는 이 문서만으로 닫히지 않는다.

#### 근거
- `src/workflow/reconcile.ts`의 상태 전이 구현
- `tests/workflow/reconcile.test.ts`의 재처리 회귀 검증
- runtime trace에서 정상 상태 전이와 실패 분기가 관찰됨

### 운영 전환

#### 의미
핵심 처리 흐름을 실제 운영 조건과 downstream consumer에 안전하게 연결하는 다음 제품 단계.

#### 현재 수준
전환 방향과 관련된 일부 구현·검증 증거는 있으나, 운영 전환을 완료했다고 부를 수 있는 acceptance proof는 아직 이 문서에 합성되지 않았다.

#### 근거
- `docs/operations/rollout.md`의 운영 의도
- `tests/fixtures/production-like.json`의 재현 입력
- 최근 변경 기록에서 운영 경계 관련 파일들이 변경됨

## 현재 상황

## 다음 전환

## 최근 진척

## 제품 목표

## 확정된 방향
