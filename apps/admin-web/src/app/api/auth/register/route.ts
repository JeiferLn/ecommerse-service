import { NextResponse } from "next/server";
import {
  backendAuth,
  getErrorMessage,
  setAuthCookies,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    companyName?: string;
    companyType?: string;
  };

  if (
    !body.name ||
    !body.email ||
    !body.password ||
    !body.companyName ||
    !body.companyType
  ) {
    return NextResponse.json(
      {
        message:
          "Nombre, correo, contraseña, empresa y tipo de empresa son requeridos",
      },
      { status: 400 },
    );
  }

  const { res, data } = await backendAuth("/auth/register", {
    name: body.name,
    email: body.email,
    password: body.password,
    companyName: body.companyName,
    companyType: body.companyType,
  });

  if (!res.ok || !data || !("accessToken" in data)) {
    return NextResponse.json(
      { message: getErrorMessage(data, "No se pudo registrar") },
      { status: res.status || 500 },
    );
  }

  await setAuthCookies(data.accessToken, data.refreshToken, data.user.role);

  return NextResponse.json({ user: data.user }, { status: 201 });
}
