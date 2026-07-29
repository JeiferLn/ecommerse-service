import { backendFetch } from "@/lib/backend";

export async function GET() {
  return backendFetch("/admin/users");
}
