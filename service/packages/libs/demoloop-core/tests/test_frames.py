import subprocess
from pathlib import Path

import pytest
from demoloop_core.agents.frames import extract_frames, moments_from


def make_video(directory: Path) -> Path:
    path = directory / "clip.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "testsrc=duration=3:size=320x240:rate=10", "-pix_fmt", "yuv420p", str(path)],
        check=True,
    )
    return path


def test_frames_are_taken_at_the_moments_evaluation_already_chose(tmp_path):
    video = make_video(tmp_path)

    frames = extract_frames(video, [0.5, 1.5, 2.5])

    assert len(frames) == 3
    assert all(frame[:8] == b"\x89PNG\r\n\x1a\n" for frame in frames)
    assert len({bytes(frame) for frame in frames}) == 3


def test_a_video_with_no_chosen_moments_is_sampled_across_its_length():
    assert moments_from({}, duration=10) == [1.0, 3.0, 5.0, 7.0, 9.0]


def test_the_moments_evaluation_recorded_are_preferred():
    quality = {"review": {"moments": [0.4, 2.2]}}

    assert moments_from(quality, duration=10) == [0.4, 2.2]


def test_extracting_from_a_missing_file_fails_loudly(tmp_path):
    with pytest.raises(RuntimeError, match="could not extract"):
        extract_frames(tmp_path / "absent.mp4", [0.5])
