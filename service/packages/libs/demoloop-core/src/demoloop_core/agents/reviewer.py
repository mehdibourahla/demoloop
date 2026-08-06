import base64
from dataclasses import dataclass
from typing import Protocol


class NoReviewerConfigured(Exception):
    pass


@dataclass
class Reviewed:
    verdict: str
    score: float
    summary: str


class Reviewer(Protocol):
    async def watch(self, frames: list[bytes], transcript: str | None, context: dict) -> Reviewed: ...


ACCEPT_SCORE = 7.0

WATCH_PROMPT = (
    "You are reviewing a product demonstration video frame by frame, in order. "
    "Judge the hook, narrative continuity, static sections, readability, attention guidance, "
    "overlay obstruction, transitions, audio treatment, the outcome and the closing. "
    "A video that passes every mechanical check while being a slideshow must be rejected. "
    "Answer with a verdict of accept or reject, a score from 0 to 10, and one sentence of reasoning."
)


class ModelReviewer:
    """Watches the extracted frames with a vision model routed by litellm."""

    def __init__(self, model: str) -> None:
        self.model = model

    async def watch(self, frames: list[bytes], transcript: str | None, context: dict) -> Reviewed:
        from litellm import acompletion

        content: list[dict] = [{"type": "text", "text": WATCH_PROMPT}]
        if transcript:
            content.append({"type": "text", "text": f"Transcript:\n{transcript}"})
        for frame in frames:
            encoded = base64.b64encode(frame).decode()
            content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}})

        response = await acompletion(
            model=self.model,
            messages=[{"role": "user", "content": content}],
            timeout=120,
            num_retries=2,
        )
        spoken = response.choices[0].message.content or ""
        verdict = "accept" if "accept" in spoken.lower()[:400] else "reject"
        score = _score_from(spoken)
        return Reviewed(verdict=verdict, score=score, summary=spoken.strip()[:600])


def _score_from(spoken: str) -> float:
    import re

    match = re.search(r"\b(\d{1,2}(?:\.\d)?)\s*/\s*10\b|\bscore\D{0,12}(\d{1,2}(?:\.\d)?)", spoken, re.I)
    if not match:
        return 0.0
    return float(match.group(1) or match.group(2))


def reviewer_for(model: str | None) -> Reviewer:
    if not model:
        raise NoReviewerConfigured(
            "no model is configured for editorial review; set DEMOLOOP_REVIEW_MODEL"
        )
    return ModelReviewer(model)


async def review_video(
    reviewer: Reviewer, frames: list[bytes], transcript: str | None, quality: dict
) -> dict:
    if not frames:
        raise ValueError("a review cannot be claimed with no frames to watch")

    watched = await reviewer.watch(frames, transcript, {"quality": quality})
    technical = quality.get("technical", {}).get("passed", False)
    editorial = quality.get("editorial", {}).get("passed", False)
    deterministic = technical and editorial
    accepted = deterministic and watched.verdict == "accept" and watched.score >= ACCEPT_SCORE

    return {
        **quality,
        "status": "accepted" if accepted else "rejected",
        "passed": accepted,
        "agentReview": {
            "status": "complete",
            "verdict": watched.verdict,
            "score": watched.score,
            "summary": watched.summary,
            "framesInspected": len(frames),
        },
    }
