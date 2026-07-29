import { backendFetch } from "@/lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return backendFetch(`/products/${id}`);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const formData = await request.formData();
  return backendFetch(`/products/${id}`, {
    method: "PATCH",
    body: formData,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return backendFetch(`/products/${id}`, { method: "DELETE" });
}
