import { redirect } from "next/navigation";

/** Ruta desconocida → home (landing o dashboard según sesión, vía middleware). */
export default function NotFound() {
  redirect("/");
}
