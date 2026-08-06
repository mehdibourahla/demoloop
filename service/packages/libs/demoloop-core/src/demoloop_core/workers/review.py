import tempfile
from collections.abc import Callable
from pathlib import Path

from demoloop_core.agents.frames import extract_frames, moments_from
from demoloop_core.agents.reviewer import Reviewer, review_video
from demoloop_core.db import dispatch_session
from demoloop_core.jobs import claim, finish
from demoloop_core.pipeline import advance

LEASE_SECONDS = 300


def _download(key: str, path: Path) -> None:
    from demoloop_core.settings import settings
    from demoloop_core.storage import client

    client().download_file(settings().storage_bucket, key, str(path))


async def review_once(reviewer: Reviewer, fetch: Callable[[str, Path], None] = _download) -> str:
    async with dispatch_session() as session:
        job = await claim(session, ["review"], LEASE_SECONDS)
        if job is None:
            return "idle"
        payload = job.payload
        token = job.lease_token

    video_key = (payload.get("artifacts") or {}).get("video")
    if not video_key:
        raise ValueError("a review job carried no video to watch")

    quality = payload.get("quality") or {}
    with tempfile.TemporaryDirectory() as scratch:
        video = Path(scratch) / "master.mp4"
        fetch(video_key, video)
        frames = extract_frames(video, moments_from(quality, duration=_duration(video)))
        finalized = await review_video(reviewer, frames=frames, transcript=None, quality=quality)

    async with dispatch_session() as session:
        await finish(session, job.id, token, {"passed": finalized["passed"], "quality": finalized, "artifacts": {}})
        await advance(session, job.id)
    return "reviewed"


def _duration(video: Path) -> float:
    import subprocess

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(video)],
        capture_output=True, text=True,
    )
    try:
        return float(probe.stdout.strip())
    except ValueError:
        return 0.0
