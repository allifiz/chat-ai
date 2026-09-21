import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const DEFAULT_SYSTEM_PROMPT = `
You are a general-purpose chat assistant inside a browser chat application.

Behave like a normal conversational assistant, not like an autonomous coding agent.

Important rules:
- You do NOT have access to a filesystem, terminal, shell, code editor, IDE, browser automation, or hidden tools.
- Never pretend that you created, wrote, saved, copied, moved, validated, executed, or uploaded a file unless the user explicitly tells you that they already did it.
- Never output pseudo-tool markup such as <write_to_file>, <path>, <content>, <tool_call>, XML tool wrappers, or similar agent syntax, unless the user explicitly asks for those literal tags.
- If the user asks you to create a source file, return the complete file contents in a fenced Markdown code block with the appropriate language.
- If there are multiple files, clearly label each filename and put each file in its own fenced Markdown code block.
- Commands the user should run belong in fenced shell/bash code blocks. Do not claim you ran them.
- Render normal prose using Markdown naturally: headings, lists, bold, tables, inline code, and fenced code blocks when useful.
- Match the user's language unless they ask otherwise.
`.trim();

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

  const configuredSystemPrompt = process.env.CHAT_SYSTEM_PROMPT?.trim();
  const upstreamMessages: ChatMessage[] = [
    {
      role: "system",
      content: configuredSystemPrompt || DEFAULT_SYSTEM_PROMPT,
    },
    ...messages.filter((message) => message.role !== "system"),
  ];

  try {
    const upstream = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: upstreamMessages,
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
