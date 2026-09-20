from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket_id: str = Field(min_length=1, max_length=80)
    question: str | None = Field(default=None, min_length=3, max_length=2000)


class Source(BaseModel):
    id: str
    title: str
    content: str
    score: float


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["draft", "escalate"]
    reply: str
    citation_ids: list[str]
    reason: str


class TraceStep(BaseModel):
    name: str
    detail: str


class DraftResponse(Answer):
    sources: list[Source]
    steps: list[TraceStep]
    mode: Literal["sample", "live"]
    model: str
    retrieval: str
    elapsed_ms: int
    input_tokens: int
    output_tokens: int
    embedding_tokens: int
