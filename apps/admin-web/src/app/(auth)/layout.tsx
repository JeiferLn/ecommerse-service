export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8">
        <p className="mb-6 text-sm font-semibold tracking-tight text-foreground">
          Commerce AI
        </p>
        {children}
      </div>
    </main>
  );
}
