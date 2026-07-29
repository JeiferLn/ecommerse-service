export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-soft)_0%,_transparent_55%),linear-gradient(160deg,_var(--background)_0%,_var(--background-accent)_100%)]"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[0_20px_50px_-28px_rgba(16,36,31,0.35)]">
        <p className="mb-6 text-sm font-semibold tracking-wide text-primary">
          Commerce AI
        </p>
        {children}
      </div>
    </main>
  );
}
