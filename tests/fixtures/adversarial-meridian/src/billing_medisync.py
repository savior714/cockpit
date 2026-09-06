"""MediSync HIE forwarding. CLAIMED ONLY: config stub, no implementation."""


MEDISYNC_CONFIG = {"endpoint": "https://hie.example.invalid/forward", "enabled": False}


def forward_medisync(payload):
    # No transport, no auth, no retry: intentionally unwired.
    raise NotImplementedError("MediSync forwarding is claimed-only; stub")
