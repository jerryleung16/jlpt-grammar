import Link from "next/link";
import ReviewQueue from "@/components/srs/ReviewQueue";

export default function PracticePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ← 回首頁
          </Link>
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">
          專注模式
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          JLPT 文法 SRS 練習
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          點擊或滑動即可複習文法點，使用現代化的 FSRS 式循環。
        </p>
      </div>

      <ReviewQueue />
    </main>
  );
}
