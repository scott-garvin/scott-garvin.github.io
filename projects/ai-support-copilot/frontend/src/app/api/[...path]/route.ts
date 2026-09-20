import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!(
    (request.method === "GET" && ["health", "tickets"].includes(path)) ||
    (request.method === "POST" && path === "drafts")
  )) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = request.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && body.length > 10000)
      return NextResponse.json(
        { detail: "Request too large" },
        { status: 413 },
      );
    const response = await fetch(
      `${process.env.API_BASE_URL || "http://127.0.0.1:8000"}/${path}${request.nextUrl.searchParams.get("sample") === "true" ? "?sample=true" : ""}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(75000),
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        detail:
          "The support API is unavailable. Start the Python backend and try again.",
      },
      { status: 503 },
    );
  }
}
export const GET = forward;
export const POST = forward;
