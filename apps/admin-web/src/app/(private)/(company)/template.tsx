import type { ReactNode } from "react";

export default function CompanyTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
