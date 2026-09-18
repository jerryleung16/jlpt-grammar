import AddGrammarForm from "@/components/grammar/AddGrammarForm";
import GrammarBank from "@/components/grammar/GrammarBank";
import GithubSyncPanel from "@/components/grammar/GithubSyncPanel";
import ReviewQueue from "@/components/srs/ReviewQueue";
import AuthStatus from "@/components/auth/AuthStatus";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-2 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">JLPT 文法</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            文法練習
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            先複習，再整理；所有卡片都在同一個工作區內。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <AuthStatus />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            先複習，再整理
          </p>
        </div>
      </header>

      <section id="practice" className="scroll-mt-6">
        <ReviewQueue />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <AddGrammarForm />
        <GithubSyncPanel />
      </div>
      <GrammarBank />
    </main>
  );
}
