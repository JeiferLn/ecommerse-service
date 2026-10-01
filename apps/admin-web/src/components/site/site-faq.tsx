import { Plus } from "lucide-react";

export type FaqItem = { question: string; answer: string };

export function SiteFaq({ items }: { items: FaqItem[] }) {
  return (
    <div className="border-t border-border">
      {items.map((item) => (
        <details key={item.question} className="group border-b border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-medium focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            {item.question}
            <Plus
              className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <p className="max-w-2xl pb-6 text-base leading-relaxed text-muted-foreground">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
