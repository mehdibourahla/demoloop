import subprocess
from pathlib import Path

SAMPLES = 5


def moments_from(quality: dict, duration: float) -> list[float]:
    recorded = (quality.get("review") or {}).get("moments")
    if recorded:
        return list(recorded)
    step = duration / SAMPLES
    return [round(step * (index + 0.5), 3) for index in range(SAMPLES)]


def extract_frames(video: Path, moments: list[float]) -> list[bytes]:
    frames: list[bytes] = []
    for moment in moments:
        result = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-ss", str(moment), "-i", str(video),
             "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
            capture_output=True,
        )
        if result.returncode != 0 or not result.stdout:
            raise RuntimeError(f"could not extract a frame at {moment}s from {video}")
        frames.append(result.stdout)
    return frames
