import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouterModel = {
  id?: unknown;
};

export async function GET() {
  const apiKey = process.env.ROUTER_API_KEY;
  const baseUrl = (process.env.ROUTER_BASE_URL ?? "https://9router.com/v1").replace(
    /\/$/,
    "",
  );

  if (!apiKey) {
    return NextResponse.json(
      { error: "ROUTER_API_KEY belum dikonfigurasi." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(baseUrl + "/models", {
      headers: {
        Authorization: "Bearer " + apiKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("9Router models error:", response.status, detail);

      return NextResponse.json(
        { error: "Gagal mengambil daftar model dari 9Router." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as { data?: RouterModel[] };

    const models = Array.isArray(payload.data)
      ? payload.data
          .map((model) => model.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .sort((a, b) => a.localeCompare(b))
      : [];

    return NextResponse.json({
      data: models,
      defaultModel: process.env.ROUTER_MODEL ?? null,
    });
  } catch (error) {
    console.error("Models proxy error:", error);

    return NextResponse.json(
      { error: "Gagal terhubung ke 9Router." },
      { status: 502 },
    );
  }
}
