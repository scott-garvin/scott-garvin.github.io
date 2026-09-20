# Invite-only Harbor deployment

One Railway service hosts the static frontend and Python API, with a dedicated Supabase Free database. The portfolio homepage remains on GitHub Pages. The [public demo](https://harbor-production-8e7a.up.railway.app/) was verified on September 20, 2026, including an authenticated OpenAI/Supabase draft. See validation.md for measured results.

## 1. Supabase Free

Create an organization/project for the fictional demo. Save the generated database password in your password manager. Enable the vector extension and apply `backend/schema.sql` in the SQL Editor. The `harbor_*` tables enable RLS with no public policies; the public Data API is not used. Keep these tables private.

In Connect, use the **Session pooler** PostgreSQL URL if IPv4 connectivity is needed. Use an encrypted connection (`sslmode=require`, or full certificate verification when configured). Store the URL only in backend secrets. Never place it in a NEXT_PUBLIC variable. Supabase Free can pause after inactivity; this is an availability tradeoff, not an always-on SLA.

## 2. Model credentials and invitation key

Create a dedicated provider project/key for Harbor and configure its billing controls. Choose an available model supporting the Responses API and structured outputs; validate it with the actual corpus before inviting reviewers. Keep automatic credit replenishment disabled unless deliberately wanted.

Generate a random demo access key, e.g. with `python -c "import secrets; print(secrets.token_urlsafe(32))"`, and save it privately. This is a separate credential from the provider key. Send it only to invited reviewers. It grants shared access to the fictional workspace, not a personal account. Rotating it revokes all copies after the backend restarts.

Set these locally in the ignored `backend/.env` for initial indexing, and later in Railway Variables:

```dotenv
APP_MODE=live
DATABASE_URL=<private Supabase PostgreSQL URL>
OPENAI_API_KEY=<private provider key>
OPENAI_MODEL=<validated model identifier>
API_ACCESS_KEY=<random invitation key>
EMBEDDING_MODEL=text-embedding-3-small
TENANT_ID=harbor-demo
MAX_REQUESTS_PER_MINUTE=10
MAX_LIVE_REQUESTS_PER_DAY=20
MAX_LIVE_REQUESTS_PER_MONTH=200
```

`python -m app.ingest` applies the schema and seeds/indexes the fictional corpus. It makes paid embedding calls, outside the draft quota. It replaces only harbor-demo chunks and leaves the usage ledger intact. Do not repeatedly run it on every deployment.

## 3. Railway

Connect the portfolio repository with access restricted to this repository. Configure the service in Railway Settings:

- Root directory: `/projects/ai-support-copilot`.
- Builder: Dockerfile; path: `/projects/ai-support-copilot/Dockerfile`.
- Branch: `main`; enable **Wait for CI**.
- Watch path: `/projects/ai-support-copilot/**`.
- Healthcheck: `/api/health`; restart on failure, up to three retries.
- Enable Serverless to stop the container while idle. Reviewers may experience a cold start.

Railway no longer permits new services to opt into the legacy `railway.toml` configuration. The dashboard settings above describe this deployment. The Dockerfile builds an isolated static export and serves it through Python; a separate Node service is unnecessary.

Set the backend variables above. Railway supplies PORT; startup binds to 0.0.0.0. The readiness path is `/api/health`, which checks process availability only, not database/model readiness. Generate a public HTTPS domain. Set platform spending controls too: the application's request quota does not cap hosting costs.

The initial release uses Railway's trial credit, with no paid subscription selected. Trial credit is temporary; review the account's remaining credit and plan before promising ongoing availability. Supabase Free can also pause. Live drafting is limited globally to 20 attempts per UTC day and 200 per month; failed attempts count. The deployment was verified with Supabase's session pooler and the existing indexed corpus, without reindexing at startup.

Do not authorize a paid plan until its displayed price and billing terms have been reviewed. The repository must be available to the selected Railway GitHub connection; unpublished local files are not deployable by GitHub integration.

## 4. Verification before sharing

- Visit the site without a key: sample tickets and sample drafting should work.
- Invalid/missing keys on live endpoints must return 401.
- Enter the private invite key and run one supported question: confirm live mode, real token usage, correct sources, and the usage ledger increment.
- Try an unsupported question: check escalation rather than an invented answer.
- Verify exhaustion against a disposable test configuration: 429 before model calls. Set either global limit to zero as the kill switch. Missing/broken usage storage must fail closed.
- Switch back to sample mode and reload: no retained key; only the separate sample progress is visible. Reconnecting with the demo key restores this tab's saved live progress.
- Run `python evals/run.py --live` once with an explicit paid-call budget, then record actual retrieval results. This evaluation command also sits outside the public draft quota.

One shared key plus bounded fictional data is suitable for an invited portfolio demonstration. Real customer data requires individual authentication, role/resource authorization, and a broader operational review.

## Local equivalent of the hosted service

```sh
cd frontend
pnpm build:demo
cd ../backend
# Set HARBOR_STATIC_DIR to the absolute path of frontend/.static-build/out.
python -m uvicorn app.hosted:app --host 127.0.0.1 --port 8001
```

The development frontend/proxy remains available via `pnpm dev`. Static staging excludes the proxy and dotenv files; provider/database/invite secrets are supplied only at runtime.

References: [Railway configuration](https://docs.railway.com/config-as-code/reference), [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
