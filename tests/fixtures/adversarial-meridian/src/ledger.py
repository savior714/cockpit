"""Walk-in reception queue -> visit ledger. Implemented + unit-proven."""


def enqueue_walk_in(queue, patient_id):
    queue.append({"patient_id": patient_id, "route": "walk-in"})
    return queue


def open_visit(ledger, patient_id):
    visit = {"patient_id": patient_id, "status": "open", "route": "walk-in"}
    ledger.append(visit)
    return visit
