import json
import re
from pathlib import Path

from app.config import PROJECT_DIR, Settings
from app.retrieval import expand_candidates, split_article

STOP_WORDS = set(
    "a an and are as at be but by can could do does for from has have how i in is it me my of on or our please the this to was we what when why will with you your harbor support help center question".split()
)


def tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower())) - STOP_WORDS


def load_corpus(directory: Path = PROJECT_DIR / "data/articles") -> list[dict]:
    records = []
    for file in sorted(directory.glob("*.md")):
        text = file.read_text(encoding="utf-8").strip()
        if text:
            records.extend(split_article(text, file.stem))
    return records


class SampleStore:
    """Offline lexical baseline. Does not simulate embeddings or model calls."""

    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.data = json.loads(
            (PROJECT_DIR / "data/seed.json").read_text(encoding="utf-8")
        )
        self.documents = load_corpus()

    def tickets(self):
        return [x for x in self.data["tickets"] if x["tenant_id"] == self.tenant_id]

    def ticket(self, ticket_id: str):
        return next((x for x in self.tickets() if x["id"] == ticket_id), None)

    def customer(self, customer_id: str):
        return next(
            (
                x
                for x in self.data["customers"]
                if x["id"] == customer_id and x["tenant_id"] == self.tenant_id
            ),
            None,
        )

    def search(self, query: str, embedding=None):
        # The sample corpus belongs only to harbor-demo, never to other tenants.
        if self.tenant_id != "harbor-demo":
            return []
        query_tokens = tokens(query)
        matches = []
        for doc in self.documents:
            overlap = query_tokens & tokens(doc["title"] + " " + doc["content"])
            if len(overlap) >= 2:
                matches.append(
                    {**doc, "score": round(len(overlap) / max(len(query_tokens), 1), 4)}
                )
        return expand_candidates(sorted(matches, key=lambda d: (-d["score"], d["id"])))


class PostgresStore:
    def __init__(self, settings: Settings):
        self.settings = settings

    def connect(self):
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(
            self.settings.database_url,
            row_factory=dict_row,
            connect_timeout=5,
            options="-c statement_timeout=10000",
        )

    def tickets(self):
        with self.connect() as conn:
            return [
                row["payload"]
                for row in conn.execute(
                    "SELECT payload FROM harbor_tickets WHERE tenant_id = %s ORDER BY id",
                    (self.settings.tenant_id,),
                )
            ]

    def ticket(self, ticket_id: str):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM harbor_tickets WHERE tenant_id = %s AND id = %s",
                (self.settings.tenant_id, ticket_id),
            ).fetchone()
            return row["payload"] if row else None

    def customer(self, customer_id: str):
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload FROM harbor_customers WHERE tenant_id = %s AND id = %s",
                (self.settings.tenant_id, customer_id),
            ).fetchone()
            return row["payload"] if row else None

    def reserve_generation(self):
        """Atomically reserve one paid attempt across workers; failures stay charged."""
        with self.connect() as conn:
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                ("harbor-budget:" + self.settings.tenant_id,),
            )
            today = conn.execute(
                "SELECT (now() AT TIME ZONE 'UTC')::date AS day"
            ).fetchone()["day"]
            counts = conn.execute(
                "SELECT COALESCE(sum(attempts), 0) AS month, "
                "COALESCE(sum(attempts) FILTER (WHERE day = %s), 0) AS day "
                "FROM harbor_demo_usage WHERE tenant_id = %s AND day >= %s AND day <= %s",
                (today, self.settings.tenant_id, today.replace(day=1), today),
            ).fetchone()
            if (
                counts["day"] >= self.settings.max_live_requests_per_day
                or counts["month"] >= self.settings.max_live_requests_per_month
            ):
                return False
            conn.execute(
                "INSERT INTO harbor_demo_usage (tenant_id,day,attempts) VALUES (%s,%s,1) "
                "ON CONFLICT (tenant_id,day) DO UPDATE SET attempts = harbor_demo_usage.attempts + 1",
                (self.settings.tenant_id, today),
            )
        return True

    def search(self, query: str, embedding):
        # Exact vector search is sufficient for this small corpus. RRF combines ranks,
        # rather than adding incompatible vector and full-text scores.
        vector = "[" + ",".join(str(float(x)) for x in embedding) + "]"
        sql = """
        WITH eligible AS (
          SELECT *, embedding <=> %s::vector AS distance,
            ts_rank_cd(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', %s)) AS lexical
          FROM harbor_chunks WHERE tenant_id = %s AND embedding_model = %s
        ), semantic AS (
          SELECT id, row_number() OVER (ORDER BY distance, id) AS rank FROM eligible
          WHERE distance < 0.65 ORDER BY distance, id LIMIT 12
        ), keyword AS (
          SELECT id, row_number() OVER (ORDER BY lexical DESC, id) AS rank FROM eligible
          WHERE lexical > 0 ORDER BY lexical DESC, id LIMIT 12
        ), scores AS (
          SELECT id, sum(score) AS score FROM (
            SELECT id, 1.0 / (60 + rank) AS score FROM semantic
            UNION ALL SELECT id, 1.0 / (60 + rank) AS score FROM keyword
          ) ranks GROUP BY id
        ) SELECT e.id, e.title, e.content, e.parent_id, e.parent_content, s.score
          FROM scores s JOIN eligible e USING (id) ORDER BY s.score DESC, e.id LIMIT 24
        """
        with self.connect() as conn:
            return expand_candidates(
                conn.execute(
                    sql,
                    (
                        vector,
                        query,
                        self.settings.tenant_id,
                        self.settings.embedding_model,
                    ),
                ).fetchall()
            )
