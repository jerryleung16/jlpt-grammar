'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, Download, GraduationCap, Layers, Moon, Settings, Sun, Upload } from 'lucide-react';
import { MAX_BACKUP_BYTES, levels, titleOf, type LearningItem, type LearningSnapshot, type ReviewEvent } from '@/lib/learning/model';
import { downloadBackup, learningEvent, loadLearning, updateLearning } from '@/lib/learning/store';
import { dueQueue, ratingPreviews, recordReview, scheduleItem } from '@/lib/learning/scheduler';
import { importSummary, mergeImport, parseImport, readLegacyBrowser } from '@/lib/learning/migration';
import { answerQuiz, createQuiz, scoreQuiz, wrongQuestions } from '@/lib/learning/quiz';
import { previewItems, previewQuestions } from '@/lib/learning/preview-content';
import type { LearningScope } from '@/lib/learning/identity';
import { LearningAccountControls, useLearningAuth, type LearningIdentity } from './LearningAccount';
import { LearningCloud, useCloudSync, type LearningSync } from './LearningCloud';
import './learning-preview.css';

type Section = 'today' | 'learn' | 'quiz' | 'library' | 'settings';
const sections: { id: Section; title: string; icon: typeof BookOpen }[] = [
  { id: 'today', title: '今日', icon: Sun }, { id: 'learn', title: '學習', icon: BookOpen },
  { id: 'quiz', title: '測驗', icon: GraduationCap }, { id: 'library', title: '學習庫', icon: Layers },
  { id: 'settings', title: '設定', icon: Settings },
];
const labelText = { untagged: '未標籤', easy: '已掌握', difficult: '未掌握' };
const ratings = [
  { rating: 1, text: '再學一次' }, { rating: 2, text: '困難' },
  { rating: 3, text: '良好' }, { rating: 4, text: '容易' },
] as const;
type Commit = (update: (current: LearningSnapshot) => LearningSnapshot) => Promise<boolean>;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="lp-panel"><h2>{title}</h2>{children}</section>;
}

export default function LearningPreview() {
  const identity = useLearningAuth();
  const [section, setSection] = useState<Section>('today');
  const scope = identity.account?.scope ?? 'guest';
  return <LearningWorkspace key={scope} scope={scope} identity={identity} section={section} setSection={setSection} />;
}

function LearningWorkspace({ scope, identity, section, setSection }: {
  scope: LearningScope; identity: LearningIdentity; section: Section; setSection: (section: Section) => void;
}) {
  const sync = useCloudSync(scope, identity.getToken);
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(() => {
    void loadLearning(scope).then(setSnapshot).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : '無法開啟本機資料庫，請檢查瀏覽器儲存權限。');
    });
  }, [scope]);
  useEffect(() => {
    refresh();
    window.addEventListener(learningEvent, refresh);
    window.addEventListener('focus', refresh);
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => {
      window.removeEventListener(learningEvent, refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(interval);
    };
  }, [refresh]);

  const commit: Commit = async (update) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      setSnapshot(await updateLearning(update, scope));
      setNow(new Date());
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '儲存失敗，請先備份資料再重試。');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const go = (next: Section) => {
    setSection(next);
    requestAnimationFrame(() => heading.current?.focus());
  };
  const installPreview = async () => {
    if (await commit((current) => {
      const existing = new Set(current.items.map((item) => item.id));
      return { ...current, items: [...current.items, ...previewItems.filter((item) => !existing.has(item.id))],
        settings: { ...current.settings, level: 'N5' } };
    })) go('learn');
  };
  const queue = useMemo(() => snapshot ? dueQueue(snapshot, now) : [], [snapshot, now]);
  const wrong = useMemo(() => snapshot ? wrongQuestions(snapshot.attempts) : [], [snapshot]);
  const reviewed = snapshot ? new Set(snapshot.reviews.filter((event) => !event.undone).map((event) => event.itemId)).size : 0;
  const theme = snapshot?.settings.theme ?? 'system';
  const setTheme = (theme: 'system' | 'light' | 'dark') => {
    void commit((current) => ({ ...current, settings: { ...current.settings, theme } }));
  };

  return (
    <div className="learning-preview" data-theme={theme}>
      <a className="lp-skip" href="#learning-main">跳至主要內容</a>
      <aside className="lp-sidebar">
        <a href="/jlpt-grammar/preview/" className="lp-brand"><span lang="ja">学</span><div>日和學習<small>詞彙與文法，一起累積</small></div></a>
        <nav aria-label="學習平台">{sections.map(({ id, title, icon: Icon }) =>
          <button type="button" key={id} className={section === id ? 'active' : ''} aria-current={section === id ? 'page' : undefined}
            onClick={() => go(id)}><Icon size={20} aria-hidden="true" /><span>{title}</span></button>)}</nav>
        <div className="lp-side-note"><span className="lp-dot" /> {identity.account ? '帳戶分區' : '訪客模式'}
          <p>{sync.status}</p><button type="button" className="lp-text-button" onClick={() => go('settings')}>帳戶與備份設定</button>
          <a href={process.env.NEXT_PUBLIC_LEARNING_ONLY === 'true' ? 'https://jerryleung16.github.io/jlpt-grammar/' : '/jlpt-grammar/'}>返回原文法站</a>
          <a href="https://jerryleung16.github.io/Japanese-Vocab-Reviser/">開啟原詞彙站</a></div>
      </aside>
      <main id="learning-main" className="lp-main">
        <header className="lp-topbar"><span className="lp-preview-badge">功能預覽 · 教材建置中</span>
          <span className="lp-preview-badge" role="status" aria-label="同步狀態">{sync.status}</span>
          <button type="button" disabled={!snapshot || busy} className="lp-icon-button" onClick={() => {
            const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            setTheme(dark ? 'light' : 'dark');
          }} aria-label="切換深淺色模式">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button></header>
        <div className="lp-page-title"><p className="lp-eyebrow">每天一點，讓日語更自然</p>
          <h1 ref={heading} tabIndex={-1}>{sections.find((entry) => entry.id === section)?.title === '今日' ? '今天，也往前一步。' : sections.find((entry) => entry.id === section)?.title}</h1>
          <p>不用註冊，不用設定 Token。從一張卡片開始。</p></div>
        {error && <div role="alert" className="lp-error">{error}<button type="button" onClick={refresh}>重新讀取</button></div>}
        {identity.error && section !== 'settings' && <div role="alert" className="lp-error">{identity.error}
          <button type="button" onClick={() => go('settings')}>查看帳戶設定</button></div>}
        {!snapshot ? <Panel title="開啟本機學習資料"><p role="status">正在讀取；若讀取失敗，上方會顯示原因，既有資料不會被重設。</p></Panel> : <>
          {section === 'today' && <>
            <section className="lp-hero"><div><p className="lp-eyebrow">你的日語小習慣</p><h2>不必一次記住全部。<br />先學會今天這一點。</h2>
              <p>{snapshot.items.length ? '到期複習優先，再慢慢認識新內容。' : '試用 8 張原創 N5 示範卡，或帶入你原本的詞彙與文法。'}</p>
              <button type="button" className="lp-button primary" disabled={busy} onClick={() => snapshot.items.length ? go('learn') : void installPreview()}>
                {snapshot.items.length ? '開始今日複習' : '不用註冊，立即開始'}<ArrowRight size={18} /></button>
              <button type="button" className="lp-text-button" onClick={() => go('settings')}>匯入舊站資料</button></div>
              <div className="lp-hero-art" aria-hidden="true"><div className="lp-orbit" /><span lang="ja">あ</span><small>一日、一歩。</small></div>
            </section>
            <div className="lp-stats"><div><span>目前可複習</span><strong>{queue.length}<small>張</small></strong></div>
              <div><span>已開始 SRS</span><strong>{reviewed}<small>張</small></strong></div>
              <div><span>待重練錯題</span><strong>{wrong.length}<small>題</small></strong></div></div>
            <div className="lp-two-columns"><Panel title="選擇今天的節奏">
              <label className="lp-field">學習級別<select value={snapshot.settings.level ?? 'all'} onChange={(event) => {
                const level = levels.find((level) => level === event.target.value) ?? null;
                void commit((current) => ({ ...current, settings: { ...current.settings, level } }));
              }}>{levels.map((level) => <option key={level}>{level}</option>)}<option value="all">全部（含未分級）</option></select></label>
              <p className="lp-muted">預覽教材只有 N5。N1–N4 可匯入自己的卡片；完整教材尚未發布。</p>
              <button type="button" className="lp-button" onClick={() => go('quiz')}>練習小測驗<ChevronRight size={18} /></button>
            </Panel><Panel title="資料由你掌握"><p>本機學習無需登入。清除瀏覽器資料會失去未備份的進度。</p>
              <button type="button" className="lp-button" onClick={() => downloadBackup(snapshot)}><Download size={18} />下載完整備份</button>
              <p className="lp-muted">登入後可到設定查看同步預覽。此功能不會覆蓋舊站資料，請繼續定期備份。</p></Panel></div>
          </>}
          {section === 'learn' && <Study key={queue[0]?.id ?? 'empty'} snapshot={snapshot} now={now} queue={queue} busy={busy} commit={commit} go={go} />}
          {section === 'quiz' && <Quiz snapshot={snapshot} busy={busy} commit={commit} />}
          {section === 'library' && <Library snapshot={snapshot} busy={busy} commit={commit} />}
          {section === 'settings' && <Preferences snapshot={snapshot} theme={theme} setTheme={setTheme} busy={busy} commit={commit} identity={identity} sync={sync} />}
          <footer className="lp-footer"><span>日和學習 · 功能預覽</span><span>此版本只有示範內容，不是完整 JLPT 教材或模擬考。</span></footer>
        </>}
      </main>
    </div>
  );
}

function Study({ snapshot, now, queue, busy, commit, go }: {
  snapshot: LearningSnapshot; now: Date; queue: LearningItem[]; busy: boolean; commit: Commit; go: (section: Section) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const item = queue[0];
  const last = snapshot.reviews.filter((event) => !event.undone)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).at(-1);
  const undo = () => {
    if (last) void commit((current) => ({ ...current, reviews: current.reviews.map((event) => event.id === last.id ? { ...event, undone: true } : event) }));
  };
  if (!item) return <Panel title={snapshot.items.length ? '這個範圍暫時沒有到期卡片' : '還沒有學習卡'}>
    <p>可以更改級別、等待短期複習到期，或到學習庫自由閱讀。這不代表已完成所有課綱。</p>
    <button type="button" className="lp-button" onClick={() => go('today')}>返回今日</button>
    {last && <button type="button" className="lp-text-button" disabled={busy} onClick={undo}>撤銷最近一次評分</button>}
  </Panel>;
  const previews = ratingPreviews(item.id, snapshot.reviews, now);
  const rate = (rating: ReviewEvent['rating']) => {
    if (!revealed) return;
    const event: ReviewEvent = { id: crypto.randomUUID(), itemId: item.id, at: new Date().toISOString(), rating, undone: false };
    void commit((current) => recordReview(current, event));
  };
  return <div className="lp-study">
    <div className="lp-study-heading"><span>{item.level ?? '未分級'} · {item.kind === 'vocabulary' ? '詞彙' : '文法'} · {labelText[item.label]}</span>
      <span>目前隊列 {queue.length} 張</span></div>
    <section className="lp-flashcard"><span className="lp-eyebrow">先試著回想，再看答案</span>
      <h2 lang="ja">{titleOf(item)}</h2>
      {!revealed ? <button type="button" className="lp-button primary" onClick={() => setRevealed(true)}>顯示答案</button> :
        <div className="lp-answer" aria-live="polite">{item.kind === 'vocabulary' && <p lang="ja" className="lp-reading">{item.reading}</p>}
          <h3>{item.meaning}</h3>{item.kind === 'grammar' && <p>{item.connection}</p>}
          <blockquote><p lang="ja">{item.example || '尚未加入例句'}</p><p className="lp-muted">{item.translation}</p></blockquote>
          {item.note && <p className="lp-muted">{item.note}</p>}</div>}
    </section>
    {revealed && <div className="lp-ratings">{ratings.map(({ rating, text }) =>
      <button type="button" key={rating} disabled={busy} onClick={() => rate(rating)}><strong>{text}</strong>
        <small>{previews[rating].card.due.toLocaleString('zh-Hant', { timeZone: snapshot.settings.timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></button>)}</div>}
    <p className="lp-muted">四級評分會由 FSRS 安排下次複習。手動「掌握」標籤不會被改動。</p>
    {last && <button type="button" className="lp-text-button" disabled={busy} onClick={undo}>撤銷最近一次評分</button>}
  </div>;
}

function Quiz({ snapshot, busy, commit }: { snapshot: LearningSnapshot; busy: boolean; commit: Commit }) {
  const [count, setCount] = useState(10);
  const [feedback, setFeedback] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const availableIds = new Set(snapshot.items.filter((item) => !snapshot.settings.level || item.level === snapshot.settings.level).map((item) => item.id));
  const unfinished = snapshot.attempts.findLast((attempt) => attempt.answers.length < attempt.questions.length);
  const attempt = snapshot.attempts.find((entry) => entry.id === selectedAttempt) ?? unfinished ?? snapshot.attempts.at(-1);
  const start = (wrongOnly: boolean) => {
    try {
      const candidates = (wrongOnly ? wrongQuestions(snapshot.attempts) : previewQuestions).filter((question) => availableIds.has(question.itemId));
      const next = createQuiz(candidates, count, crypto.randomUUID(), new Date());
      void commit((current) => ({ ...current, attempts: [...current.attempts, next] })).then((saved) => {
        if (saved) { setSelectedAttempt(next.id); setFeedback(false); setMessage(`已開始 ${next.questions.length} 題${next.questions.length < count ? `（可用題庫少於 ${count} 題，不重複湊數）` : ''}。`); }
      });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '無法建立測驗。'); }
  };
  const complete = attempt && attempt.answers.length === attempt.questions.length;
  const index = attempt ? attempt.answers.length - (feedback ? 1 : 0) : 0;
  const question = attempt?.questions[index];
  const answer = (choice: number) => {
    if (!attempt || feedback) return;
    void commit((current) => ({ ...current, attempts: current.attempts.map((entry) => entry.id === attempt.id ? answerQuiz(entry, index, choice) : entry) }))
      .then((saved) => { if (saved) setFeedback(true); });
  };
  return <div className="lp-section-stack">
    <Panel title="小測驗，找出還不熟悉的地方">
      <p>目前提供原創示範題，不依賴 AI。匯入的自訂卡片不會自動生成未驗證題目。</p>
      <div className="lp-actions"><label className="lp-field">題數<input aria-label="題數" type="number" min={1} max={100} value={count} onChange={(event) => setCount(Number(event.target.value))} /></label>
        <button type="button" className="lp-button primary" disabled={busy || Boolean(unfinished)} onClick={() => start(false)}>開始測驗</button>
        <button type="button" className="lp-button" disabled={busy || Boolean(unfinished)} onClick={() => start(true)}>只練錯題</button></div>
      {unfinished && <p className="lp-muted">先完成進行中的測驗；重新整理後會從尚未作答的題目繼續。</p>}
      <p role="status">{message}</p>
    </Panel>
    {attempt && complete && !feedback ? <Panel title="這次練習完成了"><p className="lp-result">{scoreQuiz(attempt)} / {attempt.questions.length}</p>
      <p>這是本次練習結果，不是 JLPT 換算分數。測驗不會直接改動 FSRS 排程或掌握標籤。</p></Panel> : question && attempt ?
      <Panel title={`第 ${index + 1} / ${attempt.questions.length} 題`}><h3 className="lp-question">{question.prompt}</h3>
        <div className="lp-options">{question.options.map((option, choice) =>
          <button type="button" key={option} disabled={busy || feedback} className={feedback && choice === question.answer ? 'correct' : ''} onClick={() => answer(choice)}>
            <span>{String.fromCharCode(65 + choice)}</span>{option}{feedback && choice === question.answer && <Check size={18} />}</button>)}</div>
        {feedback && <div className="lp-feedback" role="status"><strong>{attempt.answers[index] === question.answer ? '答對了！' : '再看一下這個用法。'}</strong>
          <p>{question.explanation}</p><button type="button" className="lp-button primary" onClick={() => setFeedback(false)}>{complete ? '查看結果' : '下一題'}<ArrowRight size={18} /></button></div>}
      </Panel> : null}
  </div>;
}

function Library({ snapshot, busy, commit }: { snapshot: LearningSnapshot; busy: boolean; commit: Commit }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'vocabulary' | 'grammar'>('all');
  const [editing, setEditing] = useState<LearningItem | null>(null);
  const originalItem = useRef<LearningItem | null>(null);
  const filtered = snapshot.items.filter((item) => (kind === 'all' || item.kind === kind)
    && `${titleOf(item)} ${item.meaning} ${item.kind === 'vocabulary' ? item.reading : item.connection}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const saved = editing;
    void commit((current) => {
      const latest = current.items.find((item) => item.id === saved.id) ?? null;
      if (JSON.stringify(latest) !== JSON.stringify(originalItem.current)) throw new Error('這張卡片已在其他操作中更新。請取消編輯後重新開啟，避免覆蓋新資料。');
      return { ...current, items: [...current.items.filter((item) => item.id !== saved.id), saved] };
    }).then((success) => {
      if (success) setEditing(null);
    });
  };
  const add = (kind: LearningItem['kind']) => {
    originalItem.current = null;
    const common = { id: crypto.randomUUID(), level: snapshot.settings.level, meaning: '', example: '', translation: '', note: '', label: 'untagged' as const, source: 'custom' as const };
    setEditing(kind === 'vocabulary' ? { ...common, kind, word: '', reading: '' } : { ...common, kind, pattern: '', connection: '' });
  };
  return <div className="lp-section-stack">
    <Panel title="你的詞彙與文法"><div className="lp-actions">
      <label className="lp-field">搜尋<input value={search} placeholder="日文、讀音或繁中意思" onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="lp-field">類別<select value={kind} onChange={(event) => setKind(event.target.value === 'grammar' ? 'grammar' : event.target.value === 'vocabulary' ? 'vocabulary' : 'all')}>
        <option value="all">全部</option><option value="vocabulary">詞彙</option><option value="grammar">文法</option></select></label>
      <button type="button" className="lp-button" onClick={() => add('vocabulary')}>新增詞彙</button>
      <button type="button" className="lp-button" onClick={() => add('grammar')}>新增文法</button></div>
      <p className="lp-muted">自由閱讀不改變複習排程。共 {filtered.length} 張；掌握標籤仍可手動設定。</p></Panel>
    {editing && <Panel title="編輯學習卡"><form onSubmit={save} className="lp-editor">
      <label className="lp-field">{editing.kind === 'vocabulary' ? '日文詞彙' : '文法句型'}<input required maxLength={10000} value={titleOf(editing)} onChange={(event) => setEditing(editing.kind === 'vocabulary' ? { ...editing, word: event.target.value } : { ...editing, pattern: event.target.value })} /></label>
      <label className="lp-field">{editing.kind === 'vocabulary' ? '讀音' : '接續'}<input required={editing.kind === 'vocabulary'} maxLength={10000} value={editing.kind === 'vocabulary' ? editing.reading : editing.connection} onChange={(event) => setEditing(editing.kind === 'vocabulary' ? { ...editing, reading: event.target.value } : { ...editing, connection: event.target.value })} /></label>
      <label className="lp-field">級別<select value={editing.level ?? 'none'} onChange={(event) => setEditing({ ...editing, level: levels.find((level) => level === event.target.value) ?? null })}><option value="none">未分級</option>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
      {(['meaning', 'example', 'translation', 'note'] as const).map((field) => <label className="lp-field" key={field}>{{ meaning: '繁中解釋', example: '日文例句', translation: '例句翻譯', note: '筆記' }[field]}<textarea required={field === 'meaning'} maxLength={10000} value={editing[field]} onChange={(event) => setEditing({ ...editing, [field]: event.target.value })} /></label>)}
      <div className="lp-actions"><button type="submit" className="lp-button primary" disabled={busy}>儲存</button><button type="button" className="lp-button" onClick={() => setEditing(null)}>取消</button></div>
    </form></Panel>}
    {filtered.length === 0 && <Panel title="沒有符合的卡片"><p>可調整搜尋、新增內容，或到設定匯入舊資料。</p></Panel>}
    {filtered.slice(0, 100).map((item) => <article key={item.id} className="lp-library-card"><div><span className="lp-chip">{item.level ?? '未分級'} · {item.kind === 'vocabulary' ? '詞彙' : '文法'}</span><h2 lang="ja">{titleOf(item)}</h2>
      <p>{item.meaning}</p><details><summary>例句與筆記</summary>{item.kind === 'vocabulary' ? <p lang="ja">{item.reading}</p> : <p>{item.connection}</p>}<p lang="ja">{item.example}</p><p>{item.translation}</p><p>{item.note}</p></details></div>
      <div className="lp-card-actions"><label className="lp-field">掌握標籤<select aria-label={`${titleOf(item)}掌握標籤`} value={item.label} disabled={busy} onChange={(event) => {
        const label = event.target.value === 'easy' ? 'easy' : event.target.value === 'difficult' ? 'difficult' : 'untagged';
        void commit((current) => ({ ...current, items: current.items.map((card) => card.id === item.id ? { ...card, label } : card) }));
      }}><option value="untagged">未標籤</option><option value="easy">已掌握</option><option value="difficult">未掌握</option></select></label>
        <button type="button" className="lp-button" onClick={() => { originalItem.current = item; setEditing(item); }}>編輯</button></div></article>)}
    {filtered.length > 100 && <p className="lp-muted">顯示前 100 張，請用搜尋縮小範圍。所有資料仍完整保留。</p>}
  </div>;
}

function Preferences({ snapshot, theme, setTheme, busy, commit, identity, sync }: {
  snapshot: LearningSnapshot; theme: 'system' | 'light' | 'dark'; setTheme: (theme: 'system' | 'light' | 'dark') => void; busy: boolean; commit: Commit;
  identity: LearningIdentity;
  sync: LearningSync;
}) {
  const [incoming, setIncoming] = useState<LearningSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const summary = incoming ? importSummary(snapshot, incoming) : null;
  const inspect = (value: unknown) => {
    setIncoming(parseImport(value));
    setBackupConfirmed(false);
    setMessage('預覽完成；尚未寫入資料。');
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('單一檔案上限為 20 MB；請勿選擇資料庫 dump 或含密鑰設定檔。');
      inspect(JSON.parse(await file.text()));
    } catch (cause) {
      setIncoming(null);
      setMessage(cause instanceof Error ? cause.message : '讀取檔案失敗。');
    }
  };
  const importBrowser = () => {
    try { inspect(readLegacyBrowser(window.localStorage)); }
    catch (cause) { setIncoming(null); setMessage(cause instanceof Error ? cause.message : '讀取舊資料失敗。'); }
  };
  const importGuest = async () => {
    try { inspect(await loadLearning('guest')); }
    catch (cause) { setIncoming(null); setMessage(cause instanceof Error ? cause.message : '讀取訪客資料失敗，未有匯入。'); }
  };
  const merge = async () => {
    if (!incoming || !backupConfirmed) return;
    if (await commit((current) => ({
      ...mergeImport(current, incoming), settings: { ...current.settings, level: null },
    }))) { setIncoming(null); setMessage('匯入完成；已切換全部級別。舊站資料及 Token 均未修改。'); }
  };
  const nextDue = snapshot.items.filter((item) => snapshot.reviews.some((event) => event.itemId === item.id && !event.undone))
    .map((item) => scheduleItem(item.id, snapshot.reviews, new Date()).due).sort((a, b) => a.getTime() - b.getTime())[0];
  return <div className="lp-section-stack"><LearningAccountControls identity={identity} saving={busy} />
    <LearningCloud sync={sync} snapshot={snapshot} guest={!identity.account} saving={busy} /><Panel title="閱讀與複習">
    <div className="lp-two-columns"><label className="lp-field">顯示主題<select value={theme} onChange={(event) => setTheme(event.target.value === 'dark' ? 'dark' : event.target.value === 'light' ? 'light' : 'system')}><option value="system">跟隨系統</option><option value="light">淺色</option><option value="dark">深色</option></select></label>
      <label className="lp-field">每日新卡上限<input type="number" min={0} max={100} value={snapshot.settings.newPerDay} disabled={busy} onChange={(event) => {
        const limit = Number(event.target.value);
        void commit((current) => ({ ...current, settings: { ...current.settings, newPerDay: limit } }));
      }} /></label></div>
    <p className="lp-muted">使用時區：{snapshot.settings.timeZone}。新卡上限不會隱藏已到期的複習卡。</p>
    {nextDue && <p>最近到期：{nextDue.toLocaleString('zh-Hant', { timeZone: snapshot.settings.timeZone })}</p>}
  </Panel><Panel title="備份與舊站遷移"><p>Token 是存取鑰匙，不是資料。此入口只讀取學習卡及標籤，不會讀取或匯出 Token。</p>
    <div className="lp-actions"><button type="button" className="lp-button" onClick={() => downloadBackup(snapshot)}><Download size={18} />下載本機完整備份</button>
      <label className="lp-file-button"><Upload size={18} />選擇同步檔<input type="file" accept=".json,application/json" aria-label="選擇同步檔" onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button type="button" className="lp-button" onClick={importBrowser}>偵測此瀏覽器的舊資料</button>
      {identity.account && <button type="button" className="lp-button" onClick={() => void importGuest()}>預覽訪客資料匯入</button>}</div>
    <p className="lp-muted">支援詞彙 v1、文法 Gist v1 及新平台備份。相同 ID 的衝突會中止匯入，不會猜測覆蓋。</p>
    <p role="status">{message}</p>
    {incoming && summary && <div className="lp-import-preview"><h3>匯入預覽</h3><p>新增 {summary.added} · 相同 {summary.identical} · 衝突 {summary.conflicts}</p>
      <p>{incoming.reviews.length} 筆複習紀錄 · {incoming.attempts.length} 次測驗</p>
      <div className="lp-actions">
        <button type="button" className="lp-button" onClick={() => downloadBackup(snapshot, 'nihongo-before-import.json')}>下載目前資料備份</button>
        <button type="button" className="lp-button" onClick={() => downloadBackup(incoming, 'nihongo-incoming.json')}>下載匯入來源備份</button>
      </div>
      <label className="lp-checkbox"><input type="checkbox" checked={backupConfirmed} onChange={(event) => setBackupConfirmed(event.target.checked)} />我已確認兩份備份檔下載完成</label>
      <button type="button" className="lp-button primary" disabled={busy || !backupConfirmed || summary.conflicts > 0} onClick={() => void merge()}>確認合併匯入</button></div>}
  </Panel><Panel title="個人 AI"><p>Google 登入唔會自動授予個人 Copilot 使用權。學習同步亦唔會將卡片送去 AI。</p>
    <p>原有文法站的 GitHub 登入、同步及個人 Copilot 保持原樣；目前不會把預覽卡片送至舊 AI。</p>
    <a className="lp-button" href="/jlpt-grammar/">使用原文法站與個人 Copilot<ArrowRight size={18} /></a>
  </Panel><Panel title="教材來源與正式版門檻"><p>目前八張示範卡及練習是本次開發的原創功能範例，尚待獨立語文校對。N1–N5 完整教材未發布。</p>
    <p>正式版本須先確認可計數的課綱、來源及授權，再達到逐項教材、練習與校對 100% 覆蓋。</p>
    <a href="https://www.jlpt.jp/e/faq/#anchor28" target="_blank" rel="noreferrer">JLPT 官方：不公開現行完整出題清單</a>
  </Panel></div>;
}
