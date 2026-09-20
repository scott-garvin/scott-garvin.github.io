import type { Draft } from "./types";

export type SentReply = { reply: string; at: string };
export type DemoSession = {
  drafts: Record<string, Draft>;
  edits: Record<string, string>;
  reviewed: string[];
  sent: Record<string, SentReply>;
};
export const emptySession = (): DemoSession => ({
  drafts: {},
  edits: {},
  reviewed: [],
  sent: {},
});
const key = (mode: string) => `harbor-session-v1:${mode}`;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
function isDraft(v: unknown): v is Draft {
  if (!record(v)) return false;
  return (
    ["draft", "escalate"].includes(String(v.status)) &&
    ["sample", "live"].includes(String(v.mode)) &&
    ["reply", "reason", "model", "retrieval"].every(
      (k) => typeof v[k] === "string",
    ) &&
    ["elapsed_ms", "input_tokens", "output_tokens", "embedding_tokens"].every(
      (k) => typeof v[k] === "number" && Number.isFinite(v[k]),
    ) &&
    strings(v.citation_ids) &&
    Array.isArray(v.sources) &&
    v.sources.every(
      (s) =>
        record(s) &&
        ["id", "title", "content"].every((k) => typeof s[k] === "string") &&
        typeof s.score === "number" &&
        Number.isFinite(s.score),
    ) &&
    Array.isArray(v.steps) &&
    v.steps.every(
      (s) =>
        record(s) && typeof s.name === "string" && typeof s.detail === "string",
    )
  );
}

// Fictional work only. Credentials are never passed to this module or persisted.
export function restoreSession(mode: string, ticketIds: string[]): DemoSession {
  const result = emptySession();
  try {
    const raw = sessionStorage.getItem(key(mode));
    if (!raw || raw.length > 1_000_000) return result;
    const data: unknown = JSON.parse(raw);
    if (!record(data)) return result;
    for (const id of ticketIds) {
      const draft = record(data.drafts) ? data.drafts[id] : undefined;
      if (!isDraft(draft) || draft.mode !== mode) continue;
      result.drafts[id] = draft;
      const edit = record(data.edits) ? data.edits[id] : undefined;
      result.edits[id] =
        typeof edit === "string" ? edit.slice(0, 10000) : draft.reply;
      if (
        strings(data.reviewed) &&
        data.reviewed.includes(id) &&
        result.edits[id].trim()
      )
        result.reviewed.push(id);
      const sent = record(data.sent) ? data.sent[id] : undefined;
      if (
        record(sent) &&
        typeof sent.reply === "string" &&
        typeof sent.at === "string" &&
        !Number.isNaN(Date.parse(sent.at)) &&
        draft.status === "draft" &&
        result.reviewed.includes(id) &&
        sent.reply === result.edits[id]
      ) {
        result.sent[id] = { reply: sent.reply, at: sent.at };
      }
    }
  } catch {
    /* Invalid/blocked browser storage must never break the workspace. */
  }
  return result;
}

export function saveSession(mode: string, session: DemoSession): boolean {
  try {
    sessionStorage.setItem(key(mode), JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
