import pytest

from app.retrieval import (
    MAX_CONTEXT_CHARS,
    MAX_PARENT_CHARS,
    expand_candidates,
    retrieve_sources,
    split_article,
)
from app.store import SampleStore


def test_retrieved_child_expands_to_exception_and_not_unrelated_section():
    text = (
        "# Billing\n\n## Refunds\n\nCustomers can request refunds within 30 days.\n\n"
        + "Processing details for the billing team. " * 25
        + "\n\n### Exceptions\n\nAnnual plans are excluded.\n\n"
        "## Passwords\n\nPassword reset instructions belong elsewhere."
    )
    records = split_article(text, "billing")
    child = next(r for r in records if "within 30 days" in r["content"])
    assert "Annual plans are excluded" not in child["content"]
    store = SampleStore("harbor-demo")
    store.documents = records
    sources = retrieve_sources(store, "refunds within 30 days")
    assert len(sources) == 1
    assert "Annual plans are excluded" in sources[0].content
    assert "Password reset" not in sources[0].content


def test_expansion_deduplicates_parents_and_keeps_rank():
    rows = [
        dict(
            id=str(i),
            title="Policy",
            content="match",
            parent_id=p,
            parent_content="Complete " + p,
            score=1 / (i + 1),
        )
        for i, p in enumerate(["first", "first", "second", "third", "fourth"])
    ]
    sources = expand_candidates(rows)
    assert [s.id for s in sources] == ["first", "second", "third"]
    assert sources[0].score == 1


def test_budget_omits_whole_sections_instead_of_truncating_exceptions():
    content = "x" * (MAX_PARENT_CHARS - 20) + " EXCEPTION"
    rows = [dict(id=str(i), title="Policy", content=content, score=1) for i in range(3)]
    sources = expand_candidates(rows)
    assert len(sources) == 2
    assert all(s.content == content for s in sources)
    assert sum(len(s.content) + len(s.title) for s in sources) <= MAX_CONTEXT_CHARS


def test_oversized_sections_fail_ingestion_and_are_not_served():
    with pytest.raises(ValueError, match="self-contained H2"):
        split_article("# Big\n\n" + "x" * (MAX_PARENT_CHARS + 1), "big")
    assert (
        expand_candidates(
            [dict(id="bad", title="Bad", content="x" * (MAX_PARENT_CHARS + 1), score=1)]
        )
        == []
    )


def test_langchain_retriever_cannot_expand_foreign_tenant():
    assert retrieve_sources(SampleStore("foreign"), "reporting dashboard") == []
