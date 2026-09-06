"""Realtime visit pipeline. CURRENT TRUTH: replaces the nightly batch."""


def publish_visit_event(bus, visit):
    event = {"type": "visit.opened", "visit": visit}
    bus.append(event)
    return event
