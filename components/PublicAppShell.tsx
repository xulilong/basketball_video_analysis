import Link from "next/link";
export function PublicAppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between p-5">
        <Link href="/app" className="font-bold text-xl">
          球场时刻
        </Link>
        <span className="text-xs text-slate-500">每一球，都是你的时刻</span>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-12">{children}</main>
    </div>
  );
}
