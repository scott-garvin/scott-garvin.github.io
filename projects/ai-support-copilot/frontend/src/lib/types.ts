export type Ticket = {
  id: string;
  customer: string;
  company: string;
  initials: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  time: string;
};
export type Draft = {
  status: "draft" | "escalate";
  reply: string;
  citation_ids: string[];
  reason: string;
  sources: { id: string; title: string; content: string; score: number }[];
  steps: { name: string; detail: string }[];
  mode: "sample" | "live";
  model: string;
  retrieval: string;
  elapsed_ms: number;
  input_tokens: number;
  output_tokens: number;
  embedding_tokens: number;
};
