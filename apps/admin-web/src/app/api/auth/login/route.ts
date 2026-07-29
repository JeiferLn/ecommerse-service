import { NextResponse } from "next/server";
import {
  backendAuth,
  getErrorMessage,
  setAuthCookies,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json(
      { message: "Correo y contraseña son requeridos" },
      { status: 400 },
    );
  }

  const { res, data } = await backendAuth("/auth/login", {
    email: body.email,
    password: body.password,
  });

  if (!res.ok || !data || !("accessToken" in data)) {
    return NextResponse.json(
      { message: getErrorMessage(data, "No se pudo iniciar sesión") },
      { status: res.status || 500 },
    );
  }

  await setAuthCookies(data.accessToken, data.refreshToken);

  return NextResponse.json({ user: data.user });
}
