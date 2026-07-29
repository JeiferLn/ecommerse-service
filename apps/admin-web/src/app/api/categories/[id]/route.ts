import { backendFetch } from "@/lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.text();
  return backendFetch(`/categories/${id}`, {
    method: "PATCH",
    body,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return backendFetch(`/categories/${id}`, { method: "DELETE" });
}
