import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from ledger import enqueue_walk_in, open_visit
from orders import schedule_order, start_order


def test_walk_in_reception_opens_visit():
    queue, ledger = [], []
    enqueue_walk_in(queue, "P-001")
    visit = open_visit(ledger, "P-001")
    assert queue[0]["route"] == "walk-in"
    assert visit["status"] == "open"


def test_scheduled_orders_happy_path_only():
    orders = []
    order = schedule_order(orders, "P-002", "ultrasound", "10:30")
    assert order["state"] == "scheduled"
    assert start_order(order)["state"] == "in-progress"
    # NOTE: cancellation / reschedule paths have no tests (partial proof).
