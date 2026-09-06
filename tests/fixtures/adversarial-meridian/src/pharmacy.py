"""Pharmacy dispense. Depends on orders: only in-progress orders dispense."""


def dispense(pharmacy_log, order, drug):
    if order["state"] != "in-progress":
        raise ValueError("dispense requires an in-progress order (orders -> pharmacy)")
    entry = {"order": order, "drug": drug, "state": "dispensed"}
    pharmacy_log.append(entry)
    return entry
