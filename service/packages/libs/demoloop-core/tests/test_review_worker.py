import pytest
from demoloop_core.agents.reviewer import Reviewed
from demoloop_core.db import workspace_session
from demoloop_core.jobs import enqueue
from demoloop_core.workers.review import review_once

QUALITY = {"status": "pending-agent-review", "passed": False,
           "technical": {"passed": True}, "editorial": {"passed": True},
           "review": {"moments": [0.5, 1.5]}}


class FakeReviewer:
    def __init__(self, verdict="accept", score=8.2):
        self.verdict, self.score, self.frames = verdict, score, 0

    async def watch(self, frames, transcript, context):
        self.frames = len(frames)
        return Reviewed(verdict=self.verdict, score=self.score, summary="watched")


def fetch_video(_key, path):
    import subprocess
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "testsrc=duration=3:size=320x240:rate=10", "-pix_fmt", "yuv420p", str(path)],
        check=True,
    )


async def test_the_worker_reports_idle_when_nothing_is_queued():
    assert await review_once(FakeReviewer(), fetch_video) == "idle"


async def test_a_reviewed_video_comes_back_accepted(seeded_workspaces):
    workspace, _ = seeded_workspaces
    reviewer = FakeReviewer()
    async with workspace_session(workspace) as session:
        await enqueue(session, workspace, "review", {"artifacts": {"video": "k/v"}, "quality": QUALITY})

    outcome = await review_once(reviewer, fetch_video)

    assert outcome == "reviewed"
    assert reviewer.frames == 2


async def test_a_review_job_without_a_video_fails_loudly(seeded_workspaces):
    workspace, _ = seeded_workspaces
    async with workspace_session(workspace) as session:
        await enqueue(session, workspace, "review", {"artifacts": {}, "quality": QUALITY})

    with pytest.raises(ValueError, match="no video"):
        await review_once(FakeReviewer(), fetch_video)
