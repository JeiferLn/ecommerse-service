import { backendFetch } from "@/lib/backend";

export async function GET() {
  return backendFetch("/companies/me");
}

export async function PATCH(request: Request) {
  const body = await request.text();
  return backendFetch("/companies/me", {
    method: "PATCH",
    body,
  });
}
