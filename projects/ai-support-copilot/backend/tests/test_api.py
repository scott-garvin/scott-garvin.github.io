import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.models import Answer, Source
from app.service import validate_answer
from app.store import SampleStore


@pytest.fixture
def client():
    return TestClient(create_app(Settings(_env_file=None)))


def test_ticket_list_excludes_other_tenants(client):
    result = client.get("/tickets").json()
    assert len(result["tickets"]) == 4
    assert all(t["tenant_id"] == "harbor-demo" for t in result["tickets"])


@pytest.mark.parametrize("ticket_id", ["OTHER-1", "missing", "' OR 1=1 --"])
def test_ticket_access_fails_closed(client, ticket_id):
    assert client.post("/drafts", json={"ticket_id": ticket_id}).status_code == 404


def test_sample_honestly_reports_no_model_calls(client):
    response = client.post("/drafts", json={"ticket_id": "HBR-1042"})
    assert response.status_code == 200
    draft = response.json()
    assert draft["mode"] == "sample"
    assert (
        draft["input_tokens"]
        == draft["output_tokens"]
        == draft["embedding_tokens"]
        == 0
    )
    assert draft["citation_ids"] == ["reporting-access-0"]
    assert "sign out" in draft["reply"]


def test_unknown_topic_escalates_without_citations(client):
    response = client.post("/drafts", json={"ticket_id": "HBR-1045"}).json()
    assert response["status"] == "escalate"
    assert response["sources"] == response["citation_ids"] == []


@pytest.mark.parametrize(
    "extra", [{"tenant_id": "other-workspace"}, {"customer_id": "cust-other"}]
)
def test_client_cannot_select_tenant_or_customer(client, extra):
    assert (
        client.post("/drafts", json={"ticket_id": "HBR-1042", **extra}).status_code
        == 422
    )


@pytest.mark.parametrize("question", [" " * 10, "x" * 2001])
def test_invalid_question_rejected(client, question):
    assert (
        client.post(
            "/drafts", json={"ticket_id": "HBR-1042", "question": question}
        ).status_code
        == 422
    )


def test_live_mode_requires_complete_configuration():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_mode="live")


def test_rate_limit():
    client = TestClient(create_app(Settings(_env_file=None, max_requests_per_minute=1)))
    assert client.post("/drafts", json={"ticket_id": "HBR-1042"}).status_code == 200
    assert client.post("/drafts", json={"ticket_id": "HBR-1042"}).status_code == 429


def test_unknown_citation_suppresses_generated_claims():
    answer = Answer(
        status="draft",
        reply="Your refund is approved",
        citation_ids=["made-up"],
        reason="",
    )
    checked = validate_answer(
        answer, [Source(id="real", title="Refunds", content="Review needed", score=1)]
    )
    assert checked.status == "escalate"
    assert "approved" not in checked.reply


def test_uncited_draft_is_rejected():
    assert (
        validate_answer(
            Answer(status="draft", reply="Unsupported", citation_ids=[], reason=""), []
        ).status
        == "escalate"
    )


def test_foreign_customer_and_corpus_are_not_exposed():
    assert SampleStore("harbor-demo").customer("cust-other") is None
    assert SampleStore("other-workspace").search("reporting dashboard") == []


class LimitedStore(SampleStore):
    def __init__(self):
        super().__init__("harbor-demo")
        self.remaining = 2

    def reserve_generation(self):
        if self.remaining <= 0:
            return False
        self.remaining -= 1
        return True


class FakeProvider:
    def __init__(self):
        self.called = False

    def embed(self, texts):
        return [[0.1] * 1536], 8

    def generate(self, question, sources, lookup):
        self.called = True
        assert lookup()["id"] == "cust-northstar"
        return (
            Answer(
                status="draft",
                reply="Try a fresh session.",
                citation_ids=[sources[0].id],
                reason="Based on retrieved policy",
            ),
            [],
            100,
            20,
        )


def live_settings():
    return Settings(
        _env_file=None,
        app_mode="live",
        openai_api_key="test-only",
        openai_model="test-model",
        database_url="postgresql://test",
        api_access_key="a" * 32,
    )


def test_live_auth_and_usage_with_injected_provider():
    fake = FakeProvider()
    client = TestClient(create_app(live_settings(), LimitedStore(), fake))
    assert client.get("/tickets").status_code == 401
    assert client.post("/drafts", json={"ticket_id": "HBR-1042"}).status_code == 401
    assert not fake.called
    result = client.post(
        "/drafts",
        json={"ticket_id": "HBR-1042"},
        headers={"Authorization": "Bearer " + "a" * 32},
    )
    assert result.status_code == 200
    assert result.json()["embedding_tokens"] == 8
    assert result.json()["input_tokens"] == 100
    assert fake.called


def test_provider_errors_do_not_leak_secrets():
    class BrokenProvider(FakeProvider):
        def embed(self, texts):
            raise RuntimeError("secret-token-and-private-database-url")

    client = TestClient(create_app(live_settings(), LimitedStore(), BrokenProvider()))
    result = client.post(
        "/drafts",
        json={"ticket_id": "HBR-1042"},
        headers={"Authorization": "Bearer " + "a" * 32},
    )
    assert result.status_code == 502
    assert "secret-token" not in result.text


def test_public_sample_never_calls_paid_provider_or_spends_allowance():
    store, provider = LimitedStore(), FakeProvider()
    store.remaining = 0
    client = TestClient(create_app(live_settings(), store, provider))
    assert client.get("/tickets?sample=true").status_code == 200
    result = client.post("/drafts?sample=true", json={"ticket_id": "HBR-1042"})
    assert result.status_code == 200
    assert result.json()["mode"] == "sample"
    assert not provider.called
    assert store.remaining == 0


def test_invite_key_and_quota_checked_before_paid_calls():
    store, provider = LimitedStore(), FakeProvider()
    client = TestClient(create_app(live_settings(), store, provider))
    body = {"ticket_id": "HBR-1042"}
    assert (
        client.post(
            "/drafts", json=body, headers={"Authorization": "Bearer wrong"}
        ).status_code
        == 401
    )
    assert store.remaining == 2
    store.remaining = 0
    assert (
        client.post(
            "/drafts", json=body, headers={"Authorization": "Bearer " + "a" * 32}
        ).status_code
        == 429
    )
    assert not provider.called


def test_budget_store_failure_fails_closed():
    store, provider = LimitedStore(), FakeProvider()

    def broken():
        raise RuntimeError("private connection error")

    store.reserve_generation = broken
    client = TestClient(create_app(live_settings(), store, provider))
    result = client.post(
        "/drafts",
        json={"ticket_id": "HBR-1042"},
        headers={"Authorization": "Bearer " + "a" * 32},
    )
    assert result.status_code == 502
    assert not provider.called
    assert "private" not in result.text


def test_oversized_body_rejected_before_provider():
    provider = FakeProvider()
    client = TestClient(create_app(live_settings(), LimitedStore(), provider))
    result = client.post("/drafts", content=b"x" * 16385)
    assert result.status_code == 413
    assert not provider.called
    assert result.headers["cache-control"] == "no-store"


def test_streamed_oversized_body_rejected(client):
    result = client.post("/drafts", content=iter([b"x" * 9000, b"y" * 9000]))
    assert result.status_code == 413


def test_private_api_responses_are_not_cached(client):
    result = client.get("/tickets")
    assert result.headers["cache-control"] == "no-store"
    assert result.headers["x-content-type-options"] == "nosniff"


def test_no_sending_or_account_mutation_endpoint(client):
    for path in ("/send", "/customers/cust-northstar", "/tickets/HBR-1042"):
        assert client.post(path, json={}).status_code == 404
