export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="border-b border-border bg-surface px-6 py-4">
        <p className="text-sm font-semibold tracking-wide text-primary">
          Commerce AI
        </p>
      </header>
      <div className="flex flex-1 flex-col px-6 py-8 text-foreground">
        {children}
      </div>
    </div>
  );
}
