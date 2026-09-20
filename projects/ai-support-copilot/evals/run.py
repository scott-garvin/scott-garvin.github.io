"""Run from project root after installing backend: python evals/run.py [--live]."""

import argparse
import json
import sys
from pathlib import Path

from app.config import Settings
from app.retrieval import retrieve_sources
from app.store import PostgresStore, SampleStore

parser = argparse.ArgumentParser()
parser.add_argument(
    "--live",
    action="store_true",
    help="Makes paid embedding calls; requires configured live database",
)
args = parser.parse_args()
settings = Settings(app_mode="live" if args.live else "sample")
cases = json.loads(Path(__file__).with_name("cases.json").read_text())
provider = None
if args.live:
    from app.provider import OpenAIProvider

    provider = OpenAIProvider(settings)
    store = PostgresStore(settings)
else:
    store = SampleStore(settings.tenant_id)
rows = []
for case in cases:
    embedding = provider.embed([case["question"]])[0][0] if provider else None
    sources = retrieve_sources(store, case["question"], embedding)
    ids = [s.id for s in sources]
    passed = case["source"] in ids if case["source"] else not ids
    rows.append({**case, "retrieved": ids, "passed": passed})
positive = [r for r in rows if r["source"]]
negative = [r for r in rows if not r["source"]]
result = {
    "mode": "live" if args.live else "sample",
    "metric": "retrieval only; not answer accuracy",
    "recall_at_3": sum(r["passed"] for r in positive) / len(positive),
    "no_result_accuracy": sum(r["passed"] for r in negative) / len(negative),
    "passed": sum(r["passed"] for r in rows),
    "total": len(rows),
    "cases": rows,
}
Path("eval-results.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "cases"}, indent=2))
for row in rows:
    if not row["passed"]:
        print("MISS:", row["question"], "->", row["retrieved"])
# The lexical baseline misses one paraphrase; prevent regressions without
# misrepresenting the deterministic suite as an LLM answer-quality evaluation.
if result["recall_at_3"] < 0.95 or result["no_result_accuracy"] < 1.0:
    sys.exit(1)
