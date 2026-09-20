"""LangChain retrieval boundary; permissions and SQL remain in the scoped store."""

from typing import Any

from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

from app.models import Source

MAX_PARENT_CHARS = 6000
MAX_CONTEXT_CHARS = 12000
MAX_SOURCES = 3


def split_article(text: str, document_id: str) -> list[dict]:
    """Index children, retain complete H2 sections (including H3 exceptions)."""
    title = text.strip().splitlines()[0].removeprefix("# ")
    sections = MarkdownHeaderTextSplitter(
        headers_to_split_on=[("#", "article"), ("##", "section")],
        strip_headers=True,
    ).split_text(text)
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    records = []
    for index, section in enumerate(sections):
        parent = section.page_content
        if len(parent) > MAX_PARENT_CHARS:
            raise ValueError(
                f"{document_id}: section {index} exceeds {MAX_PARENT_CHARS} characters; "
                "edit into self-contained H2 sections before indexing"
            )
        parent_id = f"{document_id}-{index}"
        section_title = section.metadata.get("section")
        display_title = f"{title} / {section_title}" if section_title else title
        for child_index, content in enumerate(splitter.split_text(parent)):
            records.append(
                dict(
                    id=f"{parent_id}-child-{child_index}",
                    title=display_title,
                    content=content,
                    parent_id=parent_id,
                    parent_content=parent,
                )
            )
    return records


def expand_candidates(candidates) -> list[Source]:
    """Preserve rank, deduplicate parents, and never truncate their evidence."""
    sources, seen = [], set()
    remaining = MAX_CONTEXT_CHARS
    for row in candidates:
        source_id = row.get("parent_id") or row["id"]
        content = row.get("parent_content") or row["content"]
        cost = len(content) + len(row["title"])
        if source_id in seen:
            continue
        seen.add(source_id)
        # Also protects reads from legacy/manual imports with oversized content.
        if len(content) > MAX_PARENT_CHARS or cost > remaining:
            continue
        sources.append(
            Source(
                id=source_id, title=row["title"], content=content, score=row["score"]
            )
        )
        remaining -= cost
        if len(sources) == MAX_SOURCES:
            break
    return sources


class HarborRetriever(BaseRetriever):
    """Request-local adapter; the store is already bound to the authorized tenant."""

    store: Any
    embedding: list[float] | None = None

    def _get_relevant_documents(self, query: str, *, run_manager) -> list[Document]:
        return [
            Document(
                page_content=s.content,
                metadata={
                    "source_id": s.id,
                    "title": s.title,
                    "score": s.score,
                },
            )
            for s in self.store.search(query, self.embedding)
        ]


def retrieve_sources(store, question: str, embedding=None) -> list[Source]:
    documents = HarborRetriever(store=store, embedding=embedding).invoke(question)
    return [
        Source(
            id=d.metadata["source_id"],
            title=d.metadata["title"],
            content=d.page_content,
            score=d.metadata["score"],
        )
        for d in documents
    ]
