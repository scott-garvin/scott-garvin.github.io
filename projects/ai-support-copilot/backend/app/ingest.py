"""Explicit, idempotent seed/index command. Invoking it makes paid embedding calls."""

import json

from psycopg.types.json import Jsonb

from app.config import PROJECT_DIR, Settings
from app.provider import OpenAIProvider
from app.store import PostgresStore, load_corpus


def main():
    settings = Settings(app_mode="live")
    if settings.tenant_id != "harbor-demo":
        raise ValueError("The bundled seed belongs to harbor-demo only")
    provider = OpenAIProvider(settings)
    store = PostgresStore(settings)
    documents = load_corpus()
    embeddings, token_count = provider.embed(
        [d["title"] + "\n" + d["content"] for d in documents]
    )
    if len(embeddings) != len(documents):
        raise ValueError("Embedding count mismatch")
    data = json.loads((PROJECT_DIR / "data/seed.json").read_text(encoding="utf-8"))
    with store.connect() as conn:
        conn.execute((PROJECT_DIR / "backend/schema.sql").read_text(encoding="utf-8"))
        # Replace only this project's configured tenant, transactionally. Old chunks
        # from edited/deleted files disappear; other tenants are never touched.
        conn.execute(
            "DELETE FROM harbor_chunks WHERE tenant_id = %s", (settings.tenant_id,)
        )
        for doc, embedding in zip(documents, embeddings, strict=True):
            vector = "[" + ",".join(str(float(x)) for x in embedding) + "]"
            conn.execute(
                "INSERT INTO harbor_chunks (tenant_id,id,title,content,embedding,embedding_model,parent_id,parent_content) VALUES (%s,%s,%s,%s,%s::vector,%s,%s,%s)",
                (
                    settings.tenant_id,
                    doc["id"],
                    doc["title"],
                    doc["content"],
                    vector,
                    settings.embedding_model,
                    doc["parent_id"],
                    doc["parent_content"],
                ),
            )
        for table, key in (
            ("harbor_customers", "customers"),
            ("harbor_tickets", "tickets"),
        ):
            from psycopg import sql

            for item in data[key]:
                if item["tenant_id"] != settings.tenant_id:
                    continue
                conn.execute(
                    sql.SQL(
                        "INSERT INTO {} (tenant_id,id,payload) VALUES (%s,%s,%s) ON CONFLICT (tenant_id,id) DO UPDATE SET payload=EXCLUDED.payload"
                    ).format(sql.Identifier(table)),
                    (settings.tenant_id, item["id"], Jsonb(item)),
                )
    print(f"Indexed {len(documents)} chunks; embedding tokens: {token_count}.")


if __name__ == "__main__":
    main()
