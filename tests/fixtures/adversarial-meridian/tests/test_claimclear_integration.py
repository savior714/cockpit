import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from billing_claimclear import submit_claimclear


def test_claimclear_sandbox_accept_codes():
    # Integration proof against the ClaimClear sandbox contract
    # (see contracts/claimclear.md): accept codes 00/01 recorded 2026-08.
    claim = {"patient_id": "P-020", "amount": 45000}
    result = submit_claimclear(claim)
    assert result["clearinghouse"] == "ClaimClear"
    assert result["state"] == "submitted"
