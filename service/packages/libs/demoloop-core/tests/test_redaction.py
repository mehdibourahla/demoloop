from demoloop_core.observability import redact, redacted_attributes

SECRET = "sk-live-12345678901234567890"


def test_a_credential_never_reaches_a_span():
    assert SECRET not in redact(f"connecting with {SECRET} now")


def test_an_email_is_masked_but_the_shape_survives_for_debugging():
    masked = redact("failed for real.person@example.com")

    assert "real.person@example.com" not in masked
    assert "[email]" in masked


def test_a_url_query_token_is_stripped_without_losing_the_route():
    masked = redact("GET https://app.test/api/orders?token=sk-live-12345678901234567890&page=2")

    assert "sk-live-12345678901234567890" not in masked
    assert "/api/orders" in masked


def test_attributes_are_redacted_by_value_not_by_key_name():
    attributes = redacted_attributes({"http.url": f"https://x/?k={SECRET}", "note": SECRET, "count": 3})

    assert SECRET not in str(attributes)
    assert attributes["count"] == 3


def test_plain_text_is_left_alone():
    assert redact("capture finished in 4.2s") == "capture finished in 4.2s"


def test_trace_context_travels_with_a_job_so_two_languages_share_one_trace():
    from demoloop_core.observability import trace_context, with_trace

    payload = with_trace({"scenario": {"id": "d"}}, traceparent="00-abc123-def456-01")

    assert payload["scenario"] == {"id": "d"}
    assert trace_context(payload) == "00-abc123-def456-01"


def test_a_job_with_no_trace_context_is_not_an_error():
    from demoloop_core.observability import trace_context

    assert trace_context({"scenario": {}}) is None


def test_a_span_processor_redacts_before_export():
    from demoloop_core.observability import RedactingSpanProcessor

    exported: list[dict] = []

    class Span:
        def __init__(self):
            self.attributes = {"note": SECRET, "count": 1}

    class Downstream:
        def on_end(self, span):
            exported.append(dict(span.attributes))

        def shutdown(self):
            pass

        def force_flush(self, timeout_millis=None):
            return True

        def on_start(self, span, parent_context=None):
            pass

    RedactingSpanProcessor(Downstream()).on_end(Span())

    assert SECRET not in str(exported)
    assert exported[0]["count"] == 1
