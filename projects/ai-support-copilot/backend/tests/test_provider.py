import json
from types import SimpleNamespace as NS

import pytest

from app.config import Settings
from app.models import Answer, Source
from app.provider import OpenAIProvider


class Responses:
    def __init__(self):
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return NS(
            output_parsed=Answer(
                status="draft", reply="Draft", citation_ids=["doc-0"], reason="Evidence"
            ),
            usage=NS(input_tokens=20, output_tokens=7),
        )


def provider(responses):
    obj = OpenAIProvider.__new__(OpenAIProvider)
    obj.settings = Settings(_env_file=None)
    obj.client = NS(responses=responses)
    return obj


def test_one_generation_request_contains_evidence_and_minimal_account():
    responses = Responses()
    result = provider(responses).generate(
        "Question",
        [Source(id="doc-0", title="Doc", content="Fact", score=1)],
        lambda: {
            "company": "Demo",
            "plan": "Team",
            "id": "private-id",
            "name": "Private Name",
        },
    )
    assert result[2:] == (20, 7)
    assert len(responses.calls) == 1
    call = responses.calls[0]
    assert call["store"] is False
    assert call["max_output_tokens"] == 1000
    payload = json.loads(call["input"][0]["content"])
    assert payload["customer"] == {"company": "Demo", "plan": "Team"}
    assert payload["sources"][0]["content"] == "Fact"
    assert "score" not in payload["sources"][0]
    assert "tools" not in call


def test_missing_account_prevents_model_call():
    responses = Responses()
    with pytest.raises(ValueError):
        provider(responses).generate("Question", [], lambda: None)
    assert not responses.calls
