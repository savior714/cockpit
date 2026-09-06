import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from orders import schedule_order, start_order
from pharmacy import dispense


def test_orders_happy_path():
    orders = []
    order = schedule_order(orders, "P-010", "xray", "11:00")
    assert start_order(order)["state"] == "in-progress"


def test_dispense_requires_in_progress_order():
    pharmacy_log = []
    orders = []
    scheduled = schedule_order(orders, "P-011", "blood-test", "11:30")
    try:
        dispense(pharmacy_log, scheduled, "aspirin")
    except ValueError:
        pass
    else:
        raise AssertionError("scheduled (not started) orders must not dispense")
    assert dispense(pharmacy_log, start_order(scheduled), "aspirin")["state"] == "dispensed"
