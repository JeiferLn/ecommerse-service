import type { ReactNode } from "react";

export default function AdminTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
