export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-center text-4xl font-bold text-primary">
        Cookless
      </h1>
      <div className="rounded-2xl bg-card p-6 shadow-lg">{children}</div>
    </div>
  );
}
