export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-center text-4xl font-bold">
        <span className="text-primary">Cook</span>
        <span className="text-blue-500">less</span>
      </h1>
      <div className="rounded-2xl bg-card p-6 shadow-lg shadow-orange-900/5 ring-1 ring-border">
        {children}
      </div>
    </div>
  );
}
