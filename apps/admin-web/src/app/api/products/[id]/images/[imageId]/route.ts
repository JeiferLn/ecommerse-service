import { backendFetch } from "@/lib/backend";

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id, imageId } = await params;
  return backendFetch(`/products/${id}/images/${imageId}`, {
    method: "DELETE",
  });
}
