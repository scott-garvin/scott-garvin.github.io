"use client";

import { useEffect, useRef, useState } from "react";
import {
  Anchor,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Copy,
  FileText,
  Inbox,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  PanelRight,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Draft, Ticket } from "@/lib/types";

import {
  restoreSession,
  saveSession,
  type SentReply,
} from "@/lib/demo-session";

type View = "inbox" | "reviewed" | "sent";
export default function Workspace() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"sample" | "live" | "unknown">("unknown");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("inbox");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [sent, setSent] = useState<Record<string, SentReply>>({});
  const [storageOk, setStorageOk] = useState(true);
  const [resetConfirm, setResetConfirm] = useState(false);
  const connection = useRef(0);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [sourceId, setSourceId] = useState("");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const ticket = tickets.find((t) => t.id === selected);
  const draft = drafts[selected];
  const filtered = tickets.filter(
    (t) =>
      (view === "sent"
        ? !!sent[t.id]
        : !sent[t.id] && (view !== "reviewed" || reviewed.includes(t.id))) &&
      `${t.subject} ${t.customer} ${t.id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const authHeaders = (): Record<string, string> =>
    accessKey ? { Authorization: `Bearer ${accessKey}` } : {};

  async function loadTickets(nextKey = accessKey) {
    if (nextKey.startsWith("sk-")) {
      setError(
        "Use Harbor’s demo access key, not an OpenAI API key. Nothing was submitted.",
      );
      setKeyInput("");
      return;
    }
    const attempt = ++connection.current;
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/tickets${nextKey ? "" : "?sample=true"}`,
        {
          headers: nextKey ? { Authorization: `Bearer ${nextKey}` } : {},
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Unable to load tickets.",
        );
      if (attempt !== connection.current) return;
      const saved = restoreSession(
        data.mode,
        data.tickets.map((t: Ticket) => t.id),
      );
      setDrafts(saved.drafts);
      setEdits(saved.edits);
      setReviewed(saved.reviewed);
      setSent(saved.sent);
      setSourceId("");
      setQuestion("");
      setNotice("");
      setAccessKey(nextKey);
      setKeyInput("");
      setTickets(data.tickets);
      setMode(data.mode);
      setSelected((current) =>
        data.tickets.some((t: Ticket) => t.id === current)
          ? current
          : data.tickets[0]?.id || "",
      );
      closeSettings();
    } catch (e) {
      if (attempt === connection.current)
        setError(e instanceof Error ? e.message : "Unable to load tickets.");
    } finally {
      if (attempt === connection.current) setLoading(false);
    }
  }
  useEffect(() => {
    void loadTickets("");
    return () => {
      connection.current++;
      controller.current?.abort();
    };
  }, []); // Initial connection only; never persist the invite credential.
  useEffect(() => {
    if (mode !== "unknown" && !loading)
      setStorageOk(saveSession(mode, { drafts, edits, reviewed, sent }));
  }, [mode, loading, drafts, edits, reviewed, sent]);

  function reopen() {
    setSent((prev) => {
      const next = { ...prev };
      delete next[selected];
      return next;
    });
    setReviewed((prev) => prev.filter((id) => id !== selected));
    setView("inbox");
    setNotice(
      "Ticket reopened. Review the draft again before simulating a send.",
    );
  }
  function resetDemo() {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setDrafts({});
    setEdits({});
    setReviewed([]);
    setSent({});
    setView("inbox");
    setQuery("");
    setQuestion("");
    setSourceId("");
    setError("");
    setResetConfirm(false);
    setNotice(
      "This demo session was reset. Your live allowance has not changed.",
    );
  }
  function selectTicket(id: string) {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setSelected(id);
    setQuestion("");
    setError("");
    setNotice("");
    setSourceId("");
    if (window.matchMedia("(max-width: 700px)").matches) {
      requestAnimationFrame(() =>
        document.getElementById("conversation")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "start",
        }),
      );
    }
  }
  async function generate() {
    if (!ticket || busy || loading || sent[ticket.id]) return;
    const id = ticket.id;
    const current = ++generation.current;
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/drafts${accessKey ? "" : "?sample=true"}`,
        {
          method: "POST",
          signal: AbortSignal.any([
            controller.current.signal,
            AbortSignal.timeout(75000),
          ]),
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            ticket_id: id,
            ...(question.trim() ? { question: question.trim() } : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "The request could not be processed.",
        );
      if (current !== generation.current) return;
      setDrafts((prev) => ({ ...prev, [id]: result }));
      setEdits((prev) => ({ ...prev, [id]: result.reply }));
      setReviewed((prev) => prev.filter((x) => x !== id));
      setSourceId(result.sources[0]?.id || "");
    } catch (e) {
      if (
        current === generation.current &&
        !(e instanceof Error && e.name === "AbortError")
      )
        setError(
          e instanceof Error ? e.message : "Something went wrong. Try again.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function copyReply() {
    try {
      await navigator.clipboard.writeText(edits[selected] || "");
      setNotice("Reply copied. Nothing has been sent.");
    } catch {
      setNotice(
        "Clipboard unavailable. Select the reply text and copy it manually.",
      );
    }
  }
  function downloadReply() {
    const blob = new Blob([edits[selected] || ""], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected}-reply.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Draft downloaded. Nothing has been sent.");
  }
  function closeSettings() {
    setSettings(false);
    settingsButton.current?.focus();
  }

  return (
    <div className="app-shell">
      <a href="#conversation" className="skip-link">
        Skip to conversation
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="/" aria-label="Harbor home">
          <span className="brand-icon">
            <Anchor size={23} />
          </span>
          harbor<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">H</span>
          <span>
            Harbor workspace<small>Support operations</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          <button
            className={`nav-item ${view === "inbox" ? "active" : ""}`}
            onClick={() => setView("inbox")}
          >
            <Inbox size={18} />
            Inbox
            <span className="count">
              {tickets.filter((t) => !sent[t.id]).length}
            </span>
          </button>
          <button
            className={`nav-item ${view === "reviewed" ? "active" : ""}`}
            onClick={() => setView("reviewed")}
          >
            <CheckCheck size={18} />
            Reviewed
            <span className="count">
              {reviewed.filter((id) => !sent[id]).length}
            </span>
          </button>
          <button
            className={`nav-item ${view === "sent" ? "active" : ""}`}
            onClick={() => setView("sent")}
          >
            <Send size={18} />
            Sent (demo)<span className="count">{Object.keys(sent).length}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sample-note">
            <ShieldCheck size={18} />
            <strong>A safe place to explore</strong>
            <p>
              Fictional customers. Human-reviewed drafts. No outbound messages.
            </p>
          </div>
          <a
            className="nav-item code-link"
            href="https://github.com/scott-garvin/scott-garvin.github.io"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={17} />
            Portfolio repository
            <ArrowRight size={14} />
          </a>
          <div className="profile">
            <span className="profile-avatar">SG</span>
            <span>
              Demo operator<small>Portfolio workspace</small>
            </span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>Support inbox</strong>
          </div>
          <div className="topbar-actions">
            <span className={`mode-pill ${mode === "live" ? "live" : ""}`}>
              <span />
              {mode === "live"
                ? "Live AI"
                : mode === "sample"
                  ? "Sample mode"
                  : "Connecting"}
            </span>
            <button
              ref={settingsButton}
              className="demo-access-button"
              aria-label="Demo access"
              aria-expanded={settings}
              onClick={() => setSettings(!settings)}
            >
              <KeyRound size={18} />
              <span>Demo access</span>
            </button>
            <span className="operator-avatar">SG</span>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">CUSTOMER EXPERIENCE</div>
            <h1>A little clarity. A better reply.</h1>
            <p>Your queue, the relevant context, and a thoughtful next step.</p>
          </div>
          <span className="heading-tag">
            <ShieldCheck size={15} />
            Human review comes first
          </span>
        </div>

        {settings && (
          <section
            className="connection-panel"
            aria-label="Connection settings"
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSettings();
            }}
          >
            <div>
              <h2>Connect to a live workspace</h2>
              <p>
                Ask Scott for a demo key to try real AI replies. Your key stays
                in memory only and must be re-entered after a reload. Use
                Harbor’s demo key, never your OpenAI key.
              </p>
            </div>
            <label>
              Demo access key
              <input
                autoFocus
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
              />
            </label>
            <Button
              disabled={loading || !keyInput.trim()}
              onClick={() => void loadTickets(keyInput.trim())}
            >
              Connect
            </Button>
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => void loadTickets("")}
            >
              Use sample mode
            </Button>
            <button
              className="icon-button"
              aria-label="Close settings"
              onClick={closeSettings}
            >
              <X size={18} />
            </button>
          </section>
        )}

        {error && (
          <div className="error-banner" role="alert">
            <TriangleAlert size={18} />
            <span>{error}</span>
            <Button
              variant="ghost"
              disabled={busy || loading}
              onClick={() =>
                settings
                  ? void loadTickets(keyInput.trim())
                  : ticket
                    ? void generate()
                    : void loadTickets()
              }
            >
              Retry
            </Button>
          </div>
        )}

        <section className="session-toolbar" aria-label="Demo session">
          <span>
            {storageOk
              ? "Drafts auto-save in this tab. Sample and live work stay separate."
              : "Browser storage is unavailable. Keep this page open to retain your work."}
          </span>
          <Button
            variant="ghost"
            disabled={loading || mode === "unknown"}
            onClick={() => setResetConfirm(true)}
          >
            Reset demo
          </Button>
          {resetConfirm && (
            <div role="group" aria-label="Confirm demo reset">
              <span>
                Clear drafts, reviews, and simulated replies in this mode?
              </span>
              <Button variant="outline" onClick={resetDemo}>
                Clear this session
              </Button>
              <Button variant="ghost" onClick={() => setResetConfirm(false)}>
                Cancel reset
              </Button>
            </div>
          )}
        </section>
        <div className="workspace-grid">
          <section className="queue" aria-label="Support tickets">
            <div className="queue-header">
              <h2>
                {view === "inbox"
                  ? "Inbox"
                  : view === "sent"
                    ? "Sent (demo)"
                    : "Reviewed"}
                <span>{filtered.length}</span>
              </h2>
              <button
                className="icon-button"
                aria-label="Refresh tickets"
                onClick={() => void loadTickets()}
                disabled={loading}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
              </button>
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search tickets"
                placeholder="Search conversations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="queue-sort">
              <span>
                {view === "inbox"
                  ? "Open conversations"
                  : view === "sent"
                    ? "Simulated delivery only"
                    : "Reviewed this session"}
              </span>
              <span>Sample tickets</span>
            </div>
            <div className="ticket-list">
              {loading ? (
                <div className="queue-empty">
                  <LoaderCircle className="spin" size={20} />
                  <p>Loading your workspace…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="queue-empty">
                  <Inbox size={24} />
                  <h3>No conversations here</h3>
                  <p>
                    {query
                      ? "Try a different name or keyword."
                      : "Completed work will appear here as you review and simulate sending replies."}
                  </p>
                </div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    className={`ticket-card ${selected === t.id ? "selected" : ""}`}
                    onClick={() => selectTicket(t.id)}
                    aria-pressed={selected === t.id}
                  >
                    <div className="ticket-top">
                      <span
                        className={`avatar ${t.initials === "AR" ? "peach" : ""}`}
                      >
                        {t.initials}
                      </span>
                      <span className="ticket-person">
                        {t.customer}
                        <small>{t.company}</small>
                      </span>
                      <span className="ticket-time">{t.time}</span>
                    </div>
                    <h3>{t.subject}</h3>
                    <p>{t.message}</p>
                    <div className="ticket-bottom">
                      <span className="ticket-category">{t.category}</span>
                      {sent[t.id] ? (
                        <span className="reviewed-label">Sent (demo)</span>
                      ) : reviewed.includes(t.id) ? (
                        <span className="reviewed-label">
                          <Check size={12} />
                          Reviewed
                        </span>
                      ) : t.priority === "High" ? (
                        <span className="priority">
                          <span />
                          High
                        </span>
                      ) : (
                        <span className="ticket-number">{t.id}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="queue-footer">
              <span className="status-dot" />
              All data in this workspace is fictional
            </div>
          </section>

          <main className="conversation" id="conversation">
            {ticket ? (
              <>
                <div className="conversation-header">
                  <div className="conversation-meta">
                    <span>{ticket.id}</span>
                    <span className="meta-dot">·</span>
                    <span>{ticket.category}</span>
                  </div>
                  <h2>{ticket.subject}</h2>
                  <div className="conversation-owner">
                    <span className="status-badge">
                      {sent[ticket.id]
                        ? "Sent (demo)"
                        : reviewed.includes(ticket.id)
                          ? "Reviewed"
                          : "Open"}
                    </span>
                    <span>Assigned to Demo operator</span>
                  </div>
                </div>
                <div className="conversation-body">
                  <div className="message-heading">
                    <span
                      className={`avatar ${ticket.initials === "AR" ? "peach" : ""}`}
                    >
                      {ticket.initials}
                    </span>
                    <div>
                      <strong>{ticket.customer}</strong>
                      <span>{ticket.company}</span>
                    </div>
                    <time>{ticket.time}</time>
                  </div>
                  <div className="customer-message">{ticket.message}</div>
                  <div className="message-channel">
                    <MessageSquare size={12} />
                    Customer message · sample ticket
                  </div>
                  <div className="draft-divider">
                    <span />
                    <span>
                      <Sparkles size={14} />
                      Harbor copilot
                    </span>
                    <span />
                  </div>
                  {!draft && !busy && (
                    <div className="draft-empty">
                      <div className="sparkle-tile">
                        <Sparkles size={24} />
                      </div>
                      <h3>A reply starts with the right context.</h3>
                      <p>
                        Find relevant help articles, check the account, and
                        prepare a reply for review.
                      </p>
                      <Button
                        disabled={loading}
                        onClick={() => void generate()}
                      >
                        <Sparkles size={16} />
                        {mode === "sample"
                          ? "Prepare sample draft"
                          : "Generate reply"}
                        <ArrowRight size={15} />
                      </Button>
                      <span className="quiet-note">
                        {mode === "sample"
                          ? "Extractive preview · no AI requests"
                          : "Nothing is sent to the customer"}
                      </span>
                    </div>
                  )}
                  {busy && (
                    <div className="draft-loading" role="status">
                      <LoaderCircle className="spin" size={24} />
                      <h3>Gathering context for your reply</h3>
                      <p>
                        Checking the available evidence and customer account…
                      </p>
                    </div>
                  )}
                  {draft && !busy && (
                    <div
                      className={`reply-card ${draft.status === "escalate" ? "escalation" : ""}`}
                    >
                      <div className="reply-header">
                        <span>
                          {draft.status === "escalate" ? (
                            <TriangleAlert size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}{" "}
                          {draft.status === "escalate"
                            ? "Needs a closer look"
                            : "Suggested reply"}
                        </span>
                        <span className="reply-status">
                          {sent[selected]
                            ? "Sent (demo)"
                            : reviewed.includes(selected)
                              ? "Reviewed"
                              : "Awaiting review"}
                        </span>
                      </div>
                      <label className="sr-only" htmlFor="reply">
                        Edit suggested reply
                      </label>
                      <textarea
                        id="reply"
                        maxLength={10000}
                        readOnly={!!sent[selected]}
                        value={edits[selected] ?? draft.reply}
                        onChange={(e) => {
                          setEdits((prev) => ({
                            ...prev,
                            [selected]: e.target.value,
                          }));
                          setReviewed((prev) =>
                            prev.filter((x) => x !== selected),
                          );
                        }}
                      />
                      <div className="citation-row">
                        {draft.citation_ids.map((id, i) => (
                          <button
                            key={id}
                            onClick={() => {
                              setSourceId(id);
                              document
                                .getElementById(`source-${id}`)
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "nearest",
                                });
                            }}
                          >
                            <FileText size={12} />
                            {i + 1}.{" "}
                            {draft.sources.find((s) => s.id === id)?.title}
                          </button>
                        ))}
                      </div>
                      <div className="reply-reason">
                        <CircleHelp size={14} />
                        <span>{draft.reason}</span>
                      </div>
                      <div className="reply-actions">
                        <Button variant="outline" onClick={copyReply}>
                          <Copy size={14} />
                          Copy
                        </Button>
                        <button
                          className="icon-button"
                          aria-label="Download reply"
                          onClick={downloadReply}
                        >
                          <ArrowDownToLine size={16} />
                        </button>
                        <Button
                          className="review-button"
                          disabled={
                            reviewed.includes(selected) ||
                            !(edits[selected] || "").trim()
                          }
                          onClick={() => {
                            setReviewed((prev) => [...prev, selected]);
                            setNotice(
                              "Marked reviewed for this session. No reply was sent.",
                            );
                          }}
                        >
                          <Check size={15} />
                          {reviewed.includes(selected)
                            ? "Reviewed"
                            : "Mark reviewed"}
                        </Button>
                      </div>
                      <div className="demo-workflow">
                        {sent[selected] ? (
                          <>
                            <p role="status">
                              Simulated reply recorded at{" "}
                              {new Date(sent[selected].at).toLocaleTimeString()}
                              . No email was sent.
                            </p>
                            <Button variant="outline" onClick={reopen}>
                              Reopen ticket
                            </Button>
                          </>
                        ) : (
                          <>
                            <p>
                              {draft.status === "escalate"
                                ? "Escalated drafts need investigation and cannot be sent in this demo."
                                : "Review the final wording, then simulate delivery. No email leaves Harbor."}
                            </p>
                            <Button
                              disabled={
                                loading ||
                                !reviewed.includes(selected) ||
                                draft.status !== "draft" ||
                                !(edits[selected] || "").trim()
                              }
                              onClick={() => {
                                if (
                                  !reviewed.includes(selected) ||
                                  draft.status !== "draft" ||
                                  !(edits[selected] || "").trim()
                                )
                                  return;
                                setSent((prev) => ({
                                  ...prev,
                                  [selected]: {
                                    reply: edits[selected],
                                    at: new Date().toISOString(),
                                  },
                                }));
                                setNotice(
                                  "Simulated send complete. No email was sent.",
                                );
                                setView("sent");
                              }}
                            >
                              Simulate send
                            </Button>
                            {reviewed.includes(selected) && (
                              <Button variant="ghost" onClick={reopen}>
                                Reopen ticket
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="notice" aria-live="polite">
                    {notice}
                  </div>
                  <details className="question-options">
                    <summary>
                      Try a different question
                      <ChevronDown size={14} />
                    </summary>
                    <label htmlFor="question">
                      Use this ticket’s customer account with a custom question.
                    </label>
                    <textarea
                      id="question"
                      placeholder="Ask something the help center can answer…"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      maxLength={2000}
                    />
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        loading ||
                        !!sent[selected] ||
                        question.trim().length < 3
                      }
                      onClick={() => void generate()}
                    >
                      <RefreshCw size={14} />
                      Prepare another draft
                    </Button>
                  </details>
                </div>
                <footer className="conversation-footer">
                  <ShieldCheck size={14} />
                  {mode === "sample"
                    ? "Sample mode uses keyword matching and quoted passages. No LLM is running."
                    : "Review facts and citations before using this draft. No automated sending."}
                </footer>
              </>
            ) : (
              <div className="no-ticket">
                <Inbox size={30} />
                <h2>Your support workspace</h2>
                <p>
                  {loading
                    ? "Connecting to the support API…"
                    : "Connect to the API to load the sample conversations."}
                </p>
              </div>
            )}
          </main>

          <aside className="evidence" aria-label="Evidence and activity">
            <div className="evidence-header">
              <PanelRight size={17} />
              <h2>Behind the reply</h2>
            </div>
            <div className="evidence-content">
              <div className="evidence-section-title">
                <BookOpen size={15} />
                <h3>Knowledge sources</h3>
                <span>{draft?.sources.length ?? 0}</span>
              </div>
              {draft?.sources.length ? (
                <div className="source-list">
                  {draft.sources.map((source, i) => (
                    <details
                      id={`source-${source.id}`}
                      key={source.id}
                      open={sourceId === source.id}
                      onToggle={(e) => {
                        if (e.currentTarget.open) setSourceId(source.id);
                      }}
                    >
                      <summary>
                        <span className="source-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{source.title}</span>
                        <ChevronDown size={13} />
                      </summary>
                      <p>{source.content}</p>
                      <small>
                        {draft.citation_ids.includes(source.id)
                          ? "Cited in original draft"
                          : "Retrieved context"}{" "}
                        · rank score {source.score.toFixed(3)}
                      </small>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="evidence-placeholder">
                  <FileText size={25} />
                  <p>
                    {draft
                      ? "No supporting passages found."
                      : "Supporting articles will appear here when you prepare a draft."}
                  </p>
                </div>
              )}
              <div className="evidence-rule" />
              <div className="evidence-section-title">
                <Clock3 size={15} />
                <h3>Activity</h3>
              </div>
              {draft ? (
                <ol className="activity-list">
                  {draft.steps.map((step, index) => (
                    <li key={step.name}>
                      <span className="activity-node">{index + 1}</span>
                      <div>
                        <strong>{step.name}</strong>
                        <p>{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="activity-placeholder">
                  Follow the evidence from retrieval to review. Actual
                  operations appear here.
                </p>
              )}
              {draft && (
                <details className="run-details">
                  <summary>
                    Run details
                    <ChevronDown size={13} />
                  </summary>
                  <dl>
                    <dt>Mode</dt>
                    <dd>{draft.mode}</dd>
                    <dt>Model</dt>
                    <dd>{draft.model}</dd>
                    <dt>Duration</dt>
                    <dd>{draft.elapsed_ms} ms</dd>
                    <dt>Input / output tokens</dt>
                    <dd>
                      {draft.input_tokens} / {draft.output_tokens}
                    </dd>
                    <dt>Embedding tokens</dt>
                    <dd>{draft.embedding_tokens}</dd>
                  </dl>
                  <p>
                    Retrieval scores are not answer-confidence percentages.
                    Edited replies require a fresh citation review.
                  </p>
                </details>
              )}
              <div className="review-note">
                <ShieldCheck size={18} />
                <p>
                  <strong>You’re in control.</strong>Every reply is a draft.
                  Check the evidence, edit the wording, and choose the next
                  step.
                </p>
              </div>
            </div>
          </aside>
        </div>
        <footer className="app-footer">
          <span>
            HARBOR <span className="footer-dot">/</span> SUPPORT, WITH CONTEXT
          </span>
          <span>A portfolio project by Scott Garvin</span>
        </footer>
      </div>
    </div>
  );
}
