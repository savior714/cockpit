# NextChart EMR — Mental Model Acceptance Snapshot

> Frozen testbed snapshot for Cockpit acceptance. This is not live EMR authority.

## 현재 상황

NextChart는 프로토타입을 넘어섰다. 대표 외래 진료 흐름과 핵심 회복 경계는 확립되어 있고, 현재 무게중심은 Stage 1A의 release-acceptance closure 증명에 있다. 보안과 외부 확장은 부분 상태로 남는다.

## 다음 전환

Release-proof 미확정 상태 → Stage 1A release-acceptance 확정 상태. 정확한 release 경계에서 증거가 인정되면 닫히며, 이미 닫힌 대표 진료·회복 계열을 다시 열지 않는다. 그 이후 보안 closure와 외부 확장으로 넘어간다.

## 직면한 문제

- **Release proof 미확정** — 정확한 release 경계의 증거가 아직 인정되지 않아 다음 전환을 제한한다. 핵심 진료·회복 흐름 자체의 결함이 아니다.
- **운영 보안 closure 잔여** — 기초 identity·세션은 확립되었으나 운영 보안 closure가 남아 Stage 1A 이후 과제로 제한된다.

## 최근 변화

- **Provider sentinel 인정** → 한정된 실제 provider 경계 증거가 모델에 들어와 production truth가 부분 상태가 됨.
- **저하-지속 복구 closure** → 대표 degraded-continuity 경계가 닫혀 reliability가 강한 상태가 됨.

## 프로젝트 지도

### Product and delivery trajectory
#### 확보된 기반
- **Representative outpatient workflow** — Core primary-care workflow and clinician path
- **Production truth** — Bounded provider-truth evidence
- **Reliability & recovery** — Representative degraded-continuity boundary

#### 현재 단계
- **Release proof** — Exact release-level convergence for Stage 1A

#### 향후 여정
1. **Security** — Operational security closure
2. **External breadth** — Wider provider and network coverage

## 영역 상세

### Representative outpatient workflow
#### 의미
The representative primary-care journey that makes the product useful to clinicians.
#### 현재 수준
Strong in the frozen acceptance model.
#### 근거
- Representative outpatient paths anchor the current release candidate.

### Production truth
#### 의미
The boundary where provider-facing behavior is shown to work against the real external source.
#### 현재 수준
Partial: the frozen snapshot admits a bounded sentinel, not the complete release boundary.
#### 근거
- Recent progress records the narrow provider-truth transition.

### Reliability & recovery
#### 의미
Recovery and degraded-continuity behavior that protects representative clinical use.
#### 현재 수준
Strong for the representative boundaries in this snapshot.
#### 근거
- Representative degraded-continuity boundaries are closed.

### Security
#### 의미
Identity, session, and operational security closure across the product boundary.
#### 현재 수준
Partial; foundational controls are stronger than remaining operational closure.
#### 남은 문제
- Operational security closure remains before the post-1A trajectory.
#### 근거
- Foundational identity and session controls are established.

### External breadth
#### 의미
Coverage beyond the representative primary-care and provider boundary.
#### 현재 수준
Partial and intentionally not part of the nearest transition.
#### 근거
- Wider provider and network coverage is declared as future trajectory.

### Release proof
#### 의미
The exact release-level evidence boundary required to promote Stage 1A.
#### 현재 수준
Not proven at the complete release boundary.
#### 남은 문제
- Exact release convergence remains open in the frozen acceptance model.
#### 근거
- The next transition above names this exact transition.

## 제품 목표

NextChart는 외래 진료 흐름을 검증 게이트가 걸린 5분 이내 신선도로 제공하는 근실시간 EMR 파이프라인으로, 레거시 야간 배치를 대체하는 것이 목표다.
