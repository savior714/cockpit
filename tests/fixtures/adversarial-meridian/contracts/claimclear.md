# ClaimClear clearinghouse contract

- Transport: HTTPS submit with accept codes 00/01.
- State: IMPLEMENTED + INTEGRATION-PROVEN (sandbox replay 2026-08,
  see tests/test_claimclear_integration.py).
- Dependency: only dispensed pharmacy entries are billable
  (orders -> pharmacy -> billing chain).
