# Demo security and operating boundaries

Harbor demonstrates a support workflow using fictional records. It is not configured to accept real customer data or deliver messages.

## Boundaries implemented

- Every live API request checks the server's demo bearer key. Tenant and customer IDs come from server-owned ticket records.
- OpenAI and PostgreSQL credentials stay on the server. The browser only receives a Harbor demo key, held in page memory. Provider-key-shaped input is rejected before a request is sent.
- Database queries scope records to the configured tenant. Supabase RLS is enabled; no anonymous table policies or public Data API are required.
- Paid attempts reserve quota transactionally in PostgreSQL before embeddings or generation. Failed/aborted requests still count. Browser reset cannot refill the quota.
- Retrieval limits parent context and source count. Generated citation IDs are checked against retrieved sources. Unknown/unsupported cases escalate; human review remains necessary.
- UI edits invalidate review. Simulated sends require review and are blocked for escalated drafts. These are browser demo transitions, not authorization for external actions.
- POST bodies are bounded at the Python API, including the direct container path. API responses use no-store caching and nosniff headers. The deployment image runs as a non-root user.

## Known limits

A shared key can be redistributed. Rotate API_ACCESS_KEY and restart to revoke access. Burst limits are per process; the paid daily/monthly allowance is shared in the database. Request-count limits are not dollar caps. Embedding ingestion and explicit evaluation runs must also be budgeted.

Session storage retains fictional work per browser tab and mode, and can be changed by its owner. It is not a trusted audit trail, user authentication, or durable server storage. Separately opened tabs do not share progress; browser duplicate-tab behavior may copy an initial session. Closing the tab or clearing browser data may erase work.

Citation validation does not verify semantic truth. Retrieved documents and user prompts are untrusted inputs. Instructions reduce prompt-injection risk but do not eliminate it. No model-accessible sending or account-mutation tools are configured.

## Repository checks

Harbor checks runs deterministic tests with a disposable database and no paid provider credentials. Harbor security configures CodeQL, Gitleaks, and dependency audits. Dependabot opens update proposals; review lockfile consistency and run the suite before merging. The current pip lock is requirements.lock; dependency updates must keep it synchronized with pyproject.toml.

Before accepting real users/data, add verified user identities, server-owned per-user workspaces, least-privilege database roles, durable state and audit events, stronger ingress controls, and documented retention/recovery procedures.
