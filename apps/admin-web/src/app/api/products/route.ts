import { backendFetch } from "@/lib/backend";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  return backendFetch(`/products${qs ? `?${qs}` : ""}`);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  return backendFetch("/products", {
    method: "POST",
    body: formData,
  });
}
