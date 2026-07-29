import { NextResponse } from "next/server";
import { API_URL } from "@/lib/backend";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const upstream = await fetch(`${API_URL}/companies/invitations/${token}`);
  const text = await upstream.text();
  return new NextResponse(text || null, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
