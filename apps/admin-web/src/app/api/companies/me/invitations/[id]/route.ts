import { backendFetch } from "@/lib/backend";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return backendFetch(`/companies/me/invitations/${id}`, {
    method: "DELETE",
  });
}
