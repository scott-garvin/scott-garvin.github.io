# Harbor validation record

Verified locally on September 20, 2026. No public deployment or remote GitHub Actions result is claimed.

## Completed checks

| Check | Result |
| --- | --- |
| Python API and PostgreSQL integration | 35 passed; no skipped database tests |
| Desktop/mobile browser workflow against Docker | 16 passed |
| TypeScript and Next.js static production export | Passed |
| Python Ruff lint | Passed |
| Deployment Docker image | Built and started as non-root user `app` |
| Container smoke | Static assets, sample tickets, retrieval, and cited draft passed |
| Frontend dependency audit | No known vulnerabilities found |
| Python locked-dependency audit | No known vulnerabilities found |
| GitHub workflow/config YAML | Parsed successfully; remote execution pending |
| Local credential scan | Current configured credentials absent from commit-eligible files and static export |
| Real OpenAI/Supabase RAG probes | 4 of 4 passed |

The local PostgreSQL tests used a disposable pgvector/pgvector:pg17 container, not the Supabase demo database. They exercise tenant filters, embedding-model mismatch, bounded parent expansion, and concurrent daily/monthly quota reservations.

The browser suite covers editing/review, search and unknown-topic handling, API failure recovery, memory-only demo keys, separate sample/live work, refresh/reload persistence, simulated sending, reopened tickets, reset confirmation, corrupted browser storage, isolation between independently opened tabs, and rejected provider-key input. Simulated sends never contact an email service. The final icon-only visual adjustment was also typechecked.

## Retrieval baseline

25 authored fixtures, measured using sample lexical retrieval:

- Relevant source in top three: 22 / 23 (95.7%).
- No-result cases correctly empty: 2 / 2.
- Combined: 24 / 25.

The missed paraphrase is “Our analytics page is blocked since paying for the better tier.” CI enforces recall@3 >= 0.95 and no-result accuracy of 1.0. These thresholds describe a small regression suite, not general retrieval accuracy or live vector quality.

## Live regression probes

Model: `gpt-4.1-mini-2025-04-14`. Embeddings: `text-embedding-3-small`, 1536 dimensions. Supabase contains 15 embedded document chunks. Four opt-in draft attempts ran through the API authorization and persistent quota path:

- Reporting access: supported draft with reporting-access citation.
- CSV export: supported draft with CSV-export citation.
- Unknown topic: escalation with no citations.
- Refund instruction override: escalation with refund-policy citation; did not claim approval or processing.

The run output was manually inspected. These four probes do not establish broad answer accuracy or prompt-injection resistance. Citation checks only establish that source IDs were retrieved, not that every generated claim follows from them. Paid probes are opt-in via `python evals/answers.py --live`; GitHub CI never needs provider credentials.

## Remaining release work

Push and observe the first GitHub checks, then enable appropriate required checks. CodeQL and Gitleaks workflow execution remain unverified until that run. Next, deploy and test real HTTPS ingress, provider connectivity, cold starts, and the public invite flow. The older three-service Compose path was not rebuilt during this pass; the tested deployment target is the single-service root Dockerfile.

Demo progress is browser session storage, not database-backed customer history. The key remains a shared invite credential, not individual user authentication. This release is for fictional portfolio demonstrations; real customer data, delivery integrations, and production user management remain outside scope.
