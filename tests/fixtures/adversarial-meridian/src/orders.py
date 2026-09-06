"""Scheduled procedure orders. Implemented; partially proven (happy path only)."""


def schedule_order(orders, patient_id, procedure, slot):
    order = {"patient_id": patient_id, "procedure": procedure, "slot": slot, "state": "scheduled"}
    orders.append(order)
    return order


def start_order(order):
    # Cancellation / reschedule paths are NOT covered by tests yet.
    order["state"] = "in-progress"
    return order
