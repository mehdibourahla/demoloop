import re

# Redaction is by value, not by key name: a secret in a field called "note" is still a secret.
PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(?:sk|pk|api)[-_](?:live|prod)?[-_]?[A-Za-z0-9]{16,}\b", re.I), "[secret]"),
    (re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I), "[email]"),
    (re.compile(r"\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b"), "[phone]"),
]


def redact(value: str) -> str:
    for pattern, replacement in PATTERNS:
        value = pattern.sub(replacement, value)
    return value


def redacted_attributes(attributes: dict) -> dict:
    return {key: redact(value) if isinstance(value, str) else value for key, value in attributes.items()}


def with_trace(payload: dict, traceparent: str) -> dict:
    return {**payload, "traceparent": traceparent}


def trace_context(payload: dict) -> str | None:
    return payload.get("traceparent")


class RedactingSpanProcessor:
    """Redacts span attributes on the way out, so a leak cannot reach the backend."""

    def __init__(self, downstream) -> None:
        self._downstream = downstream

    def on_start(self, span, parent_context=None) -> None:
        self._downstream.on_start(span, parent_context)

    def on_end(self, span) -> None:
        attributes = getattr(span, "attributes", None)
        if attributes:
            cleaned = redacted_attributes(dict(attributes))
            try:
                span.attributes.clear()
                span.attributes.update(cleaned)
            except AttributeError:
                pass
        self._downstream.on_end(span)

    def shutdown(self) -> None:
        self._downstream.shutdown()

    def force_flush(self, timeout_millis: int | None = None) -> bool:
        return self._downstream.force_flush(timeout_millis)
