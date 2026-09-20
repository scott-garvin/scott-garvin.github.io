CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS harbor_chunks (
    tenant_id text NOT NULL,
    id text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    embedding vector(1536) NOT NULL,
    embedding_model text NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS harbor_customers (
    tenant_id text NOT NULL, id text NOT NULL, payload jsonb NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS harbor_tickets (
    tenant_id text NOT NULL, id text NOT NULL, payload jsonb NOT NULL,
    PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS harbor_chunks_fts
ON harbor_chunks USING gin (to_tsvector('english', title || ' ' || content));
-- Exact nearest-neighbor search deliberately avoids an ANN index for this tiny corpus.
-- Keep these tables private to the backend; do not expose them through Supabase's API.
ALTER TABLE harbor_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE harbor_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE harbor_tickets ENABLE ROW LEVEL SECURITY;
-- No public policies: anonymous/authenticated Data API access is denied by default.
-- The backend uses a server-only owner connection and explicit tenant predicates.

-- Additive migration for existing indexes. Legacy rows retain child-only context
-- until the explicit ingestion command replaces this tenant's index.
ALTER TABLE harbor_chunks ADD COLUMN IF NOT EXISTS parent_id text;
ALTER TABLE harbor_chunks ADD COLUMN IF NOT EXISTS parent_content text;

-- Persistent global allowance for paid requests. Never cleared by ingestion.
CREATE TABLE IF NOT EXISTS harbor_demo_usage (
    tenant_id text NOT NULL,
    day date NOT NULL,
    attempts integer NOT NULL CHECK (attempts >= 0),
    PRIMARY KEY (tenant_id, day)
);
ALTER TABLE harbor_demo_usage ENABLE ROW LEVEL SECURITY;
