import { backendFetch } from "@/lib/backend";

export async function GET() {
  return backendFetch("/companies/me/invitations");
}

export async function POST(request: Request) {
  const body = await request.text();
  return backendFetch("/companies/me/invitations", {
    method: "POST",
    body,
  });
}
