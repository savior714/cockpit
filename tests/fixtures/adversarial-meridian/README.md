# Meridian Clinic Operations Ledger

Meridian은 외래 접수·진료·수납을 하나의 운영 원장(single operations ledger)으로
잇는 clinic operations 시스템이다.

- 환자가 오면 접수 대기열에 올리고 진료 기록을 남긴 뒤 수납까지 하나의 원장에 기록한다.
- 정산은 검증된 야간 배치(nightly batch)로 매일 02:00에 집계한다.
- 외부 연동으로 청구 클리어링과 지역 HIE에 진료 정보를 전달한다.

빠르게 보려면 이 README와 최근 커밋 요약만으로 전체 그림을 파악할 수 있다.
