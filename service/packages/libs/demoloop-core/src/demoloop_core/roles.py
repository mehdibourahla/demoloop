class Forbidden(Exception):
    pass


# A reviewer approves but cannot produce, because production consumes credits (PRD §12).
ROLES: dict[str, set[str]] = {
    "owner": {"produce", "approve", "publish", "share", "watch", "manage_members"},
    "editor": {"produce", "publish", "share", "watch"},
    "reviewer": {"approve", "watch"},
    "viewer": {"watch"},
}


def require(role: str, action: str) -> None:
    if action not in ROLES.get(role, set()):
        raise Forbidden(f"a {role} may not {action}")
