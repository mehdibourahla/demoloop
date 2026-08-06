from demoloop_core.credits import estimate_credits


def test_the_prd_example_reproduces_its_own_figure():
    # PRD §5.4 shows "Estimated 1 min 50 s · 12 credits".
    assert estimate_credits({"requestedDurationSeconds": 110, "scenes": [1, 2, 3, 4, 5, 6]}) == 12


def test_a_scenario_without_a_requested_duration_is_estimated_from_its_scenes():
    assert estimate_credits({"scenes": [1, 2, 3, 4, 5, 6]}) == 10


def test_the_shortest_possible_demo_still_costs_something():
    assert estimate_credits({"scenes": [1]}) >= 1


def test_a_scenario_with_no_scenes_cannot_be_priced():
    import pytest

    with pytest.raises(ValueError, match="no scenes"):
        estimate_credits({"scenes": []})
