"""After-hours on-call messaging. Implemented but UNPROVEN: no tests exercise it."""


def page_on_call(roster, severity, message):
    targets = [c for c in roster if c["on_duty"] and severity in c["handles"]]
    return [{"to": c["pager"], "message": message} for c in targets]
