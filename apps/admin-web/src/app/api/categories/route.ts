import { backendFetch } from "@/lib/backend";

export async function GET() {
  return backendFetch("/categories");
}

export async function POST(request: Request) {
  const body = await request.text();
  return backendFetch("/categories", {
    method: "POST",
    body,
  });
}
