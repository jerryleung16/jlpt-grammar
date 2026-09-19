'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Edit3, MessageCircle, Plus, RotateCcw, Send, Settings2, Trash2, X } from 'lucide-react';
import {
  cancelCopilotSession,
  createCopilotAgent,
  createCopilotSession,
  deleteCopilotAgent,
  deleteCopilotSession,
  listCopilotAgents,
  listCopilotSessions,
  sendCopilotMessage,
  updateCopilotAgent,
  type AgentProfile,
  type CopilotSession,
  type CopilotTurn,
} from '@/components/copilot/copilot-api';
import { serializeGrammarCardContext, type GrammarMutationProposal } from '@/lib/copilot-context';
import type { GrammarCard } from '@/lib/grammar-data';

type CopilotPanelProps = {
  activeCard: GrammarCard;
  onApplyProposal: (proposal: GrammarMutationProposal) => void;
};

function mergeSession(current: CopilotSession | undefined, next: CopilotSession) {
  return current ? { ...current, ...next, turns: next.turns ?? current.turns } : next;
}

function ProposalPreview({
  proposal,
  activeCard,
  applied,
  onApply,
}: {
  proposal: GrammarMutationProposal;
  activeCard: GrammarCard;
  applied: boolean;
  onApply: () => void;
}) {
  const fields = proposal.type === 'edit'
    ? Object.entries(proposal.changes).map(([field, value]) => [field, activeCard[field as keyof GrammarCard], value] as const)
    : Object.entries(proposal.card).map(([field, value]) => [field, '', value] as const);

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">變更預覽</p>
        <span className="text-[10px] uppercase tracking-[0.18em]">尚未套用</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {fields.map(([field, before, after]) => (
          <div key={field} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 border-t border-amber-200/70 pt-1.5 first:border-t-0 first:pt-0 dark:border-amber-900/70">
            <span className="font-semibold">{field}</span>
            <span className="break-words"><span className="text-amber-700/70 line-through dark:text-amber-200/60">{String(before || '未填寫')}</span>{' → '}<strong>{String(after || '未填寫')}</strong></span>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={applied}
        onClick={onApply}
        className="mt-3 rounded-lg bg-amber-700 px-3 py-1.5 font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:text-amber-950"
      >
        {applied ? '已套用' : '確認套用'}
      </button>
    </div>
  );
}

function TurnView({
  turn,
  activeCard,
  appliedProposalIds,
  onApplyProposal,
  onRetry,
  onEdit,
}: {
  turn: CopilotTurn;
  activeCard: GrammarCard;
  appliedProposalIds: Set<string>;
  onApplyProposal: (proposal: GrammarMutationProposal) => void;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const tokenSummary = [
    turn.inputTokens !== null ? `輸入 ${turn.inputTokens.toLocaleString()}` : null,
    turn.outputTokens !== null ? `輸出 ${turn.outputTokens.toLocaleString()}` : null,
    turn.totalTokens !== null ? `合計 ${turn.totalTokens.toLocaleString()}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-2">
      <div className="ml-8 rounded-2xl rounded-tr-sm bg-slate-900 px-3 py-2 text-sm text-white dark:bg-blue-500">
        {turn.prompt}
      </div>
      {turn.response ? (
        <div className="mr-8 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <p className="whitespace-pre-wrap">{turn.response}</p>
          {turn.proposals.map((proposal) => (
            <ProposalPreview
              key={proposal.id}
              proposal={proposal}
              activeCard={activeCard}
              applied={appliedProposalIds.has(proposal.id)}
              onApply={() => onApplyProposal(proposal)}
            />
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              <Edit3 size={13} aria-hidden="true" />編輯後重試
            </button>
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              <RotateCcw size={13} aria-hidden="true" />重試
            </button>
            {tokenSummary ? <span className="ml-auto text-slate-400">{tokenSummary} tokens</span> : null}
          </div>
        </div>
      ) : turn.error ? (
        <div className="mr-8 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {turn.error}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold dark:border-rose-700"><RotateCcw size={13} aria-hidden="true" />重試</button>
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold dark:border-rose-700"><Edit3 size={13} aria-hidden="true" />編輯提示</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CopilotPanel({ activeCard, onApplyProposal }: CopilotPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sourceTurn, setSourceTurn] = useState<{ id: string; attemptType: 'retry' | 'edit' } | null>(null);
  const [showAgentEditor, setShowAgentEditor] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentInstructions, setAgentInstructions] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');
  const [appliedProposalIds, setAppliedProposalIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedAgent = agents.find((agent) => agent.id === (selectedAgentId ?? selectedSession?.agentId)) ?? agents[0] ?? null;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const [result, agentResult] = await Promise.all([listCopilotSessions(), listCopilotAgents()]);
        if (cancelled) return;
        setAgents(agentResult.agents);
        let nextSessions = result.sessions;
        if (nextSessions.length === 0) {
          const created = await createCopilotSession('文法助教', agentResult.agents[0]?.id);
          nextSessions = [created.session];
        }
        setSessions(nextSessions);
        setSelectedSessionId((current) => current ?? nextSessions[0]?.id ?? null);
        setSelectedAgentId((current) => current ?? nextSessions[0]?.agentId ?? agentResult.agents[0]?.id ?? null);
        setIsReady(true);
        setError('');
        inputRef.current?.focus();
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Copilot 尚未準備好。');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const sendMessage = async (currentMessage: string, options: { sourceTurnId?: string; attemptType?: 'retry' | 'edit' } = {}) => {
    if (!selectedSession || !currentMessage.trim() || isLoading) return;
    const context = serializeGrammarCardContext(activeCard);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setError('');
    setMessage('');
    setSourceTurn(null);
    try {
      const result = await sendCopilotMessage(selectedSession.id, currentMessage.trim(), context, controller.signal, options);
      setSessions((current) => current.map((session) => session.id === result.session.id ? mergeSession(session, result.session) : session));
    } catch (sendError) {
      if ((sendError as Error).name !== 'AbortError') setError(sendError instanceof Error ? sendError.message : 'Copilot 暫時無法回答。');
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    await sendMessage(message, sourceTurn ?? undefined);
  };

  const handleRetry = async (turn: CopilotTurn) => {
    await sendMessage(turn.prompt, { sourceTurnId: turn.id, attemptType: 'retry' });
  };

  const handleEdit = (turn: CopilotTurn) => {
    setMessage(turn.prompt);
    setSourceTurn({ id: turn.id, attemptType: 'edit' });
    inputRef.current?.focus();
  };

  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
    if (!selectedSession || selectedSession.agentId === agentId) return;
    setError('切換助教會套用到新對話，請按「新增對話」開始。');
  };

  const handleSaveAgent = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editingAgentId) {
        const result = await updateCopilotAgent(editingAgentId, agentName, agentInstructions);
        setAgents((current) => current.map((agent) => agent.id === result.agent.id ? result.agent : agent));
        setSelectedAgentId(result.agent.id);
      } else {
        const result = await createCopilotAgent(agentName, agentInstructions);
        const session = await createCopilotSession(`${result.agent.name} · 新對話`, result.agent.id);
        setAgents((current) => [...current, result.agent]);
        setSessions((current) => [...current, session.session]);
        setSelectedAgentId(result.agent.id);
        setSelectedSessionId(session.session.id);
        setMessage('');
        setSourceTurn(null);
      }
      setShowAgentEditor(false);
      setEditingAgentId(null);
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : '無法儲存自訂助教。');
    }
  };

  const beginCreateAgent = () => {
    setEditingAgentId(null);
    setAgentName('');
    setAgentInstructions('');
    setShowAgentEditor(true);
  };

  const beginEditAgent = () => {
    if (!selectedAgent) return;
    setEditingAgentId(selectedAgent.id);
    setAgentName(selectedAgent.name);
    setAgentInstructions(selectedAgent.instructions);
    setShowAgentEditor(true);
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgent || agents.length <= 1 || !window.confirm(`刪除「${selectedAgent.name}」？`)) return;
    try {
      await deleteCopilotAgent(selectedAgent.id);
      const remaining = agents.filter((agent) => agent.id !== selectedAgent.id);
      setAgents(remaining);
      setSelectedAgentId(remaining[0]?.id ?? null);
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : '無法刪除自訂助教。');
    }
  };

  const handleNewSession = async () => {
    const name = window.prompt('請輸入新的對話名稱', `文法助教 ${sessions.length + 1}`)?.trim();
    if (!name) return;
    try {
      const result = await createCopilotSession(name, selectedAgentId ?? undefined);
      setSessions((current) => [...current, result.session]);
      setSelectedSessionId(result.session.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '無法建立對話。');
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    await deleteCopilotSession(selectedSession.id);
    const remaining = sessions.filter((session) => session.id !== selectedSession.id);
    if (remaining.length === 0) {
      const created = await createCopilotSession('文法助教');
      setSessions([created.session]);
      setSelectedSessionId(created.session.id);
    } else {
      setSessions(remaining);
      setSelectedSessionId(remaining[0].id);
    }
  };

  const handleApplyProposal = (proposal: GrammarMutationProposal) => {
    onApplyProposal(proposal);
    setAppliedProposalIds((current) => new Set(current).add(proposal.id));
  };

  const prepareCardGeneration = () => {
    setMessage(`請詳細分析這張日語文法卡，說明接續、語感、常見錯誤、至少三個自然例句，並提出適合初學者複習的重點。如果資料不足，請明確指出；若需要新增或修正卡片，請使用提案工具。`);
    setSourceTurn(null);
    inputRef.current?.focus();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!activeCard}
        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/70"
        aria-label="開啟 Copilot 文法助教"
      >
        <MessageCircle size={16} aria-hidden="true" />
        問 Copilot
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Copilot 文法助教">
          <button type="button" className="absolute inset-0 bg-slate-950/35" onClick={() => setIsOpen(false)} aria-label="關閉 Copilot" />
          <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">Copilot 文法助教</p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">目前卡片：{activeCard.pattern}</p>
              </div>
              <button type="button" onClick={handleNewSession} disabled={!isReady || isLoading} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="新增對話" title="新增對話">
                <Plus size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={handleDeleteSession} disabled={!selectedSession || isLoading} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="刪除目前對話" title="刪除目前對話">
                <Trash2 size={17} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="關閉 Copilot" title="關閉 Copilot">
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            <div className="border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
              <select value={selectedSessionId ?? ''} onChange={(event) => { const nextSession = sessions.find((session) => session.id === event.target.value); setSelectedSessionId(event.target.value); setSelectedAgentId(nextSession?.agentId ?? selectedAgentId); }} disabled={!isReady || isLoading} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} · {session.requestCount} 次</option>)}
              </select>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400"><Bot size={14} aria-hidden="true" /><select value={selectedAgent?.id ?? ''} onChange={(event) => handleAgentChange(event.target.value)} disabled={!isReady || isLoading} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
                <button type="button" onClick={beginCreateAgent} disabled={!isReady || isLoading} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800" title="新增自訂助教" aria-label="新增自訂助教"><Plus size={16} aria-hidden="true" /></button>
                <button type="button" onClick={beginEditAgent} disabled={!selectedAgent || isLoading} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800" title="編輯目前助教" aria-label="編輯目前助教"><Settings2 size={16} aria-hidden="true" /></button>
                <button type="button" onClick={() => void handleDeleteAgent()} disabled={!selectedAgent || agents.length <= 1 || isLoading} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800" title="刪除目前助教" aria-label="刪除目前助教"><Trash2 size={15} aria-hidden="true" /></button>
              </div>
              {selectedSession ? <p className="mt-1 text-[11px] text-slate-400">本對話：{selectedSession.usage.requestCount} 次請求{selectedSession.usage.inputTokens !== null ? ` · 輸入 ${selectedSession.usage.inputTokens.toLocaleString()}` : ''}{selectedSession.usage.outputTokens !== null ? ` · 輸出 ${selectedSession.usage.outputTokens.toLocaleString()}` : ''}{selectedSession.usage.totalTokens !== null ? ` · 合計 ${selectedSession.usage.totalTokens.toLocaleString()} tokens` : ' · token 資料尚未提供'}</p> : null}
            </div>

            {showAgentEditor ? <form onSubmit={(event) => void handleSaveAgent(event)} className="border-b border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/30"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{editingAgentId ? '編輯自訂助教' : '新增自訂助教'}</p><button type="button" onClick={() => setShowAgentEditor(false)} className="text-xs font-semibold text-slate-500">取消</button></div><input value={agentName} onChange={(event) => setAgentName(event.target.value)} maxLength={80} required placeholder="助教名稱" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /><textarea value={agentInstructions} onChange={(event) => setAgentInstructions(event.target.value)} maxLength={4000} rows={3} placeholder="例如：用 N4 程度、繁體中文和表格解釋，並多給生活化例句。" className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /><button type="submit" className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">儲存助教</button></form> : null}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!isReady ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">正在載入 Copilot 對話……</p> : null}
              {isReady && selectedSession?.turns.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">可以問目前這張文法卡的意思、語感、例句，或請我提出卡片修改建議。</p> : null}
              {selectedSession?.turns.map((turn) => <TurnView key={turn.id} turn={turn} activeCard={activeCard} appliedProposalIds={appliedProposalIds} onApplyProposal={handleApplyProposal} onRetry={() => void handleRetry(turn)} onEdit={() => handleEdit(turn)} />)}
              {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
            </div>

            <form className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" onSubmit={(event) => { event.preventDefault(); void handleSend(); }}>
              {selectedAgent ? <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Bot size={14} aria-hidden="true" /><span>目前助教：{selectedAgent.name}</span>{sourceTurn ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-200">{sourceTurn.attemptType === 'edit' ? '編輯重試' : '重試'}</span> : null}</div> : null}
              <textarea ref={inputRef} value={message} onChange={(event) => setMessage(event.target.value)} disabled={!isReady || isLoading} rows={3} placeholder="問這張文法卡……" className="w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><button type="button" onClick={prepareCardGeneration} disabled={!isReady || isLoading} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"><Bot size={13} aria-hidden="true" />生成詳細解釋</button><span className="hidden sm:inline">修改會先顯示預覽。</span></div>
                {isLoading ? <button type="button" onClick={() => { abortControllerRef.current?.abort(); if (selectedSession) void cancelCopilotSession(selectedSession.id); }} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300">停止</button> : <button type="submit" disabled={!isReady || !message.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500"><Send size={15} aria-hidden="true" />送出</button>}
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
