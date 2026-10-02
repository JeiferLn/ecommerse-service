import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const STORE_CODE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/i;

function notAvailable(): NextResponse {
  return new NextResponse(
    "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Enlace no disponible</title>" +
      "<body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#333\">" +
      "<h1 style=\"font-size:1.25rem\">Este enlace de WhatsApp no está disponible</h1>" +
      "<p>Puede que la tienda lo haya cambiado. Pídele su enlace actualizado.</p></body></html>",
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!STORE_CODE.test(code)) {
    return notAvailable();
  }

  try {
    const response = await fetch(
      `${API_URL}/api/v1/whatsapp/store-links/${encodeURIComponent(code.toLowerCase())}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return notAvailable();
    }
    const payload = (await response.json()) as { data?: { url?: string } };
    const url = payload.data?.url;
    if (!url?.startsWith("https://wa.me/")) {
      return notAvailable();
    }
    return NextResponse.redirect(url, 302);
  } catch {
    return notAvailable();
  }
}
