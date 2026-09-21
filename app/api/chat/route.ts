import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;

  const message = value as Record<string, unknown>;

  return (
    (message.role === "system" ||
      message.role === "user" ||
      message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.length > 0 &&
    message.content.length <= 550_000
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.ROUTER_API_KEY;
  const baseUrl = (process.env.ROUTER_BASE_URL ?? "https://9router.com/v1").replace(
    /\/$/,
    "",
  );

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Server belum dikonfigurasi. Isi ROUTER_API_KEY di .env.local.",
      },
      { status: 500 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body harus berupa JSON yang valid." },
      { status: 400 },
    );
  }

  const record =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;

  const messages = record?.messages;
  const requestedModel =
    typeof record?.model === "string" ? record.model.trim() : "";
  const model = requestedModel || process.env.ROUTER_MODEL?.trim();

  if (!model || model.length > 200) {
    return NextResponse.json(
      { error: "Pilih model 9Router yang valid sebelum mengirim pesan." },
      { status: 400 },
    );
  }

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 100 ||
    !messages.every(isValidMessage)
  ) {
    return NextResponse.json(
      { error: "Format messages tidak valid." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal: request.signal,
      cache: "no-store",
    });

    if (!upstream.ok) {
      const detail = await upstream.text();

      console.error("9Router error:", upstream.status, detail);

      return NextResponse.json(
        {
          error: "9Router menolak request. Cek API key, model, atau saldo/quota.",
        },
        {
          status:
            upstream.status >= 400 && upstream.status < 500
              ? upstream.status
              : 502,
        },
      );
    }

    if (!upstream.body) {
      return NextResponse.json(
        { error: "9Router tidak mengembalikan response stream." },
        { status: 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ??
          "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    console.error("Chat proxy error:", error);

    return NextResponse.json(
      { error: "Gagal terhubung ke 9Router." },
      { status: 502 },
    );
  }
}
