from collections import deque
from secrets import compare_digest
from threading import Lock
from time import monotonic

from fastapi import Depends, FastAPI, Header, HTTPException

from app.config import Settings
from app.http_safety import RequestBodyLimit
from app.models import DraftRequest, DraftResponse
from app.service import draft
from app.store import PostgresStore, SampleStore


def create_app(settings=None, store=None, provider=None):
    settings = settings or Settings()
    store = store or (
        SampleStore(settings.tenant_id)
        if settings.app_mode == "sample"
        else PostgresStore(settings)
    )
    if settings.app_mode == "live" and provider is None:
        from app.provider import OpenAIProvider

        provider = OpenAIProvider(settings)
    api = FastAPI(title="Harbor Support API", version="0.1.0")
    api.add_middleware(RequestBodyLimit)

    @api.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
    requests = {"sample": deque(), "live": deque()}
    lock = Lock()

    sample_store = SampleStore(settings.tenant_id)
    sample_settings = Settings(
        _env_file=None, app_mode="sample", tenant_id=settings.tenant_id
    )

    def authorize(sample: bool = False, authorization: str = Header(default="")):
        if settings.app_mode == "live" and not sample:
            expected = "Bearer " + settings.api_access_key
            if not compare_digest(authorization.encode(), expected.encode()):
                raise HTTPException(401, "A valid demo access key is required.")

    @api.get("/health")
    def health():
        return {"status": "ok", "mode": settings.app_mode}

    @api.get("/tickets", dependencies=[Depends(authorize)])
    def tickets(sample: bool = False):
        try:
            active_store = sample_store if sample else store
            return {
                "mode": "sample" if sample else settings.app_mode,
                "tickets": active_store.tickets(),
            }
        except Exception:
            raise HTTPException(
                503, "The data store is unavailable. Check the server configuration."
            ) from None

    @api.post(
        "/drafts", response_model=DraftResponse, dependencies=[Depends(authorize)]
    )
    def create_draft(body: DraftRequest, sample: bool = False):
        with lock:
            queue = requests[
                "sample" if sample or settings.app_mode == "sample" else "live"
            ]
            now = monotonic()
            while queue and queue[0] < now - 60:
                queue.popleft()
            if len(queue) >= settings.max_requests_per_minute:
                raise HTTPException(
                    429, "Demo request limit reached. Try again in one minute."
                )
            queue.append(now)
        try:
            active_store = sample_store if sample else store
            active_settings = sample_settings if sample else settings
            ticket = active_store.ticket(body.ticket_id)
            if ticket is None:
                raise HTTPException(404, "Ticket not found.")
            question = (
                body.question.strip()
                if body.question
                else ticket["subject"] + "\n" + ticket["message"]
            )
            if len(question) < 3:
                raise HTTPException(
                    422, "Question must contain at least three non-space characters."
                )
            if len(question) > 2000:
                raise HTTPException(422, "Question exceeds the demo input limit.")
            if active_settings.app_mode == "live" and not store.reserve_generation():
                raise HTTPException(
                    429,
                    "Live demo allowance reached. Return to sample mode or contact Scott for access.",
                )
            return draft(
                active_settings,
                active_store,
                None if sample else provider,
                ticket,
                question,
            )
        except HTTPException:
            raise
        except Exception:
            # Never return provider error bodies, credentials, or connection strings.
            raise HTTPException(
                502,
                "Draft generation failed. Check database readiness, model access, and server configuration. No reply was sent.",
            ) from None

    return api


app = create_app()
