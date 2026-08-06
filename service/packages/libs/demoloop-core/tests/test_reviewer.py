import pytest
from demoloop_core.agents.reviewer import (
    NoReviewerConfigured,
    Reviewed,
    review_video,
)

QUALITY = {"status": "pending-agent-review", "technical": {"passed": True}, "editorial": {"passed": True}}


class FakeReviewer:
    def __init__(self, verdict: str, score: float) -> None:
        self.verdict, self.score = verdict, score
        self.seen: list[bytes] = []

    async def watch(self, frames, transcript, context):
        self.seen = list(frames)
        return Reviewed(verdict=self.verdict, score=self.score, summary="watched")


async def test_a_reviewer_must_actually_be_shown_the_frames():
    reviewer = FakeReviewer("accept", 8.4)

    await review_video(reviewer, frames=[b"a", b"b", b"c"], transcript=None, quality=QUALITY)

    assert len(reviewer.seen) == 3


async def test_an_accepting_review_scoring_well_accepts_the_video():
    result = await review_video(FakeReviewer("accept", 8.4), frames=[b"a"], transcript=None, quality=QUALITY)

    assert result["status"] == "accepted"
    assert result["passed"] is True


async def test_a_low_score_cannot_accept_however_it_votes():
    result = await review_video(FakeReviewer("accept", 5.0), frames=[b"a"], transcript=None, quality=QUALITY)

    assert result["status"] == "rejected"
    assert result["passed"] is False


async def test_a_rejecting_review_rejects():
    result = await review_video(FakeReviewer("reject", 9.0), frames=[b"a"], transcript=None, quality=QUALITY)

    assert result["status"] == "rejected"


async def test_a_video_that_failed_its_deterministic_checks_cannot_be_rescued():
    failed = {**QUALITY, "technical": {"passed": False}}

    result = await review_video(FakeReviewer("accept", 9.5), frames=[b"a"], transcript=None, quality=failed)

    assert result["status"] == "rejected"


async def test_reviewing_without_frames_is_refused():
    with pytest.raises(ValueError, match="no frames"):
        await review_video(FakeReviewer("accept", 9.0), frames=[], transcript=None, quality=QUALITY)


async def test_no_configured_model_refuses_rather_than_abstaining_quietly():
    from demoloop_core.agents.reviewer import reviewer_for

    with pytest.raises(NoReviewerConfigured, match="no model"):
        reviewer_for(None)
