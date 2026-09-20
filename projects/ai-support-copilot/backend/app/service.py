from time import perf_counter

from app.models import Answer, DraftResponse, TraceStep
from app.retrieval import retrieve_sources


def validate_answer(answer: Answer, sources) -> Answer:
    available = {source.id for source in sources}
    if not set(answer.citation_ids).issubset(available) or (
        answer.status == "draft" and not answer.citation_ids
    ):
        return Answer(
            status="escalate",
            reply="A support agent needs to review the evidence before replying.",
            citation_ids=[],
            reason="The generated draft did not provide valid source references.",
        )
    return answer


def draft(settings, store, provider, ticket, question):
    started = perf_counter()
    steps = [
        TraceStep(
            name="Access checked",
            detail="Ticket and customer are scoped to the server's configured workspace.",
        )
    ]
    embedding_tokens = input_tokens = output_tokens = 0
    if settings.app_mode == "live":
        embeddings, embedding_tokens = provider.embed([question])
        sources = retrieve_sources(store, question, embeddings[0])
        retrieval = "Hybrid · vector + full-text · reciprocal rank fusion"
    else:
        sources = retrieve_sources(store, question)
        retrieval = "Sample · lexical overlap (no vectors)"
    steps.append(
        TraceStep(
            name="Evidence retrieved",
            detail=f"{len(sources)} passages selected. {retrieval}. LangChain retrieval expands matching chunks to bounded parent context and deduplicates sources. Scores measure retrieval ranking, not confidence.",
        )
    )

    if not sources:
        answer = Answer(
            status="escalate",
            reply="I couldn't find supporting information in the knowledge base. A support agent should investigate before making a recommendation.",
            citation_ids=[],
            reason="No relevant passages were retrieved.",
        )
    elif settings.app_mode == "sample":
        customer = store.customer(ticket["customer_id"])
        if customer is None:
            raise ValueError("Customer unavailable")
        steps.append(
            TraceStep(
                name="Sample account lookup",
                detail=f"Application code read {customer['company']} · {customer['plan']} plan. No model or tool call was simulated.",
            )
        )
        answer = Answer(
            status="draft",
            reply=f"Here is the relevant guidance from our help center:\n\n{sources[0].content}\n\nYour account is currently on the {customer['plan']} plan. A support agent should confirm that this guidance resolves your specific issue.",
            citation_ids=[sources[0].id],
            reason="Extractive sample: quotes the top lexical match. It does not interpret your question or infer eligibility.",
        )
    else:
        answer, tool_steps, input_tokens, output_tokens = provider.generate(
            question, sources, lambda: store.customer(ticket["customer_id"])
        )
        steps.extend(tool_steps)
    answer = validate_answer(answer, sources)
    steps.append(
        TraceStep(
            name="Citation IDs checked",
            detail="References point to retrieved passages. Semantic support still needs human review; nothing was sent to the customer.",
        )
    )
    return DraftResponse(
        **answer.model_dump(),
        sources=sources,
        steps=steps,
        mode=settings.app_mode,
        model=settings.openai_model
        if settings.app_mode == "live"
        else "Extractive sample · no LLM",
        retrieval=retrieval,
        elapsed_ms=round((perf_counter() - started) * 1000),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        embedding_tokens=embedding_tokens,
    )
