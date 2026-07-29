import { NextResponse } from "next/server";
import { getErrorMessage, setAuthCookies } from "@/lib/auth";
import { API_URL } from "@/lib/backend";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    name?: string;
    password?: string;
  };

  if (!body.token || !body.name || !body.password) {
    return NextResponse.json(
      { message: "Token, nombre y contraseña son requeridos" },
      { status: 400 },
    );
  }

  const res = await fetch(`${API_URL}/auth/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as
    | {
        user: { role: string };
        accessToken: string;
        refreshToken: string;
      }
    | { message?: string | string[] }
    | null;

  if (!res.ok || !data || !("accessToken" in data)) {
    return NextResponse.json(
      { message: getErrorMessage(data, "No se pudo aceptar la invitación") },
      { status: res.status || 500 },
    );
  }

  await setAuthCookies(data.accessToken, data.refreshToken, data.user.role);
  return NextResponse.json({ user: data.user }, { status: 201 });
}
