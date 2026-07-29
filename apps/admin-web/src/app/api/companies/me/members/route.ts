import { backendFetch } from "@/lib/backend";

export async function GET() {
  return backendFetch("/companies/me/members");
}
