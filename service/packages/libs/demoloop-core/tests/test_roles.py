import pytest
from demoloop_core.roles import ROLES, Forbidden, require


def test_the_prd_names_four_roles():
    assert set(ROLES) == {"owner", "editor", "reviewer", "viewer"}


def test_a_reviewer_may_approve_but_never_produce():
    require("reviewer", "approve")
    with pytest.raises(Forbidden, match="produce"):
        require("reviewer", "produce")


def test_a_viewer_may_only_watch():
    require("viewer", "watch")
    for action in ("produce", "approve", "publish", "share"):
        with pytest.raises(Forbidden):
            require("viewer", action)


def test_an_editor_produces_but_does_not_govern():
    require("editor", "produce")
    require("editor", "publish")
    with pytest.raises(Forbidden, match="manage_members"):
        require("editor", "manage_members")


def test_an_owner_may_do_everything_the_product_defines():
    for action in ("produce", "approve", "publish", "share", "watch", "manage_members"):
        require("owner", action)


def test_an_unknown_role_is_denied_rather_than_defaulted():
    with pytest.raises(Forbidden):
        require("superuser", "produce")
