"""Integration tests against a dedicated disposable database only."""

import os
from uuid import uuid4

import pytest
from psycopg.types.json import Jsonb

from app.config import PROJECT_DIR, Settings
from app.store import PostgresStore


@pytest.fixture
def store():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable pgvector test database")
    tenant = "test-" + uuid4().hex
    settings = Settings(_env_file=None, database_url=url, tenant_id=tenant)
    store = PostgresStore(settings)
    with store.connect() as conn:
        conn.execute((PROJECT_DIR / "backend/schema.sql").read_text())
        for tenant_id in (tenant, tenant + "-foreign"):
            conn.execute(
                "INSERT INTO harbor_tickets VALUES (%s,%s,%s)",
                (tenant_id, "ticket", Jsonb({"id": "ticket", "tenant_id": tenant_id})),
            )
            conn.execute(
                "INSERT INTO harbor_customers VALUES (%s,%s,%s)",
                (
                    tenant_id,
                    "customer",
                    Jsonb({"id": "customer", "tenant_id": tenant_id}),
                ),
            )
            conn.execute(
                "INSERT INTO harbor_chunks (tenant_id,id,title,content,embedding,embedding_model) VALUES (%s,%s,%s,%s,%s::vector,%s)",
                (
                    tenant_id,
                    "doc",
                    "Reporting access",
                    "Reporting dashboard on Team plan",
                    "[" + ",".join(["1"] + ["0"] * 1535) + "]",
                    settings.embedding_model,
                ),
            )
    yield store
    with store.connect() as conn:
        from psycopg import sql

        for table in (
            "harbor_chunks",
            "harbor_customers",
            "harbor_tickets",
            "harbor_demo_usage",
        ):
            conn.execute(
                sql.SQL("DELETE FROM {} WHERE tenant_id IN (%s,%s)").format(
                    sql.Identifier(table)
                ),
                (tenant, tenant + "-foreign"),
            )


def test_postgres_hybrid_search_and_tenant_filters(store):
    assert len(store.tickets()) == 1
    assert store.ticket("ticket")["tenant_id"] == store.settings.tenant_id
    assert store.customer("customer")["tenant_id"] == store.settings.tenant_id
    sources = store.search("reporting dashboard", [1] + [0] * 1535)
    assert len(sources) == 1
    assert sources[0].id == "doc"
    assert sources[0].score > 0


def test_embedding_model_mismatch_returns_no_results(store):
    store.settings.embedding_model = "different-model"
    assert store.search("reporting dashboard", [1] + [0] * 1535) == []


def test_parent_expansion_keeps_exception_and_tenant_boundary(store):
    with store.connect() as conn:
        for tenant, content in (
            (
                store.settings.tenant_id,
                "Reporting access. Annual plans require review.",
            ),
            (store.settings.tenant_id + "-foreign", "PRIVATE FOREIGN POLICY"),
        ):
            conn.execute(
                "UPDATE harbor_chunks SET parent_id = %s, parent_content = %s WHERE tenant_id = %s",
                ("shared-parent-id", content, tenant),
            )
    sources = store.search("reporting dashboard", [1] + [0] * 1535)
    assert len(sources) == 1
    assert sources[0].id == "shared-parent-id"
    assert "Annual plans require review" in sources[0].content
    assert "PRIVATE" not in sources[0].content


def test_paid_allowance_is_atomic_and_persists_between_store_instances(store):
    from concurrent.futures import ThreadPoolExecutor

    store.settings.max_live_requests_per_day = 3
    store.settings.max_live_requests_per_month = 3
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: store.reserve_generation(), range(10)))
    assert sum(results) == 3
    assert PostgresStore(store.settings).reserve_generation() is False
    store.settings.max_live_requests_per_day = 10
    assert store.reserve_generation() is False  # Monthly cap remains effective.
