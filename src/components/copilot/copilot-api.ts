import type { GrammarMutationProposal } from '@/lib/copilot-context';
import type { GrammarCard } from '@/lib/grammar-data';

const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'https://jlpt-grammar-api.onrender.com';
const apiPath = (path: string) => `${apiOrigin}${path}`;
const copilotEndpoint = apiPath('/api/copilot');

export type CopilotTurn = {
  id: string;
  prompt: string;
  context: string;
  sourceTurnId: string | null;
  attemptType: 'initial' | 'retry' | 'edit';
  response: string | null;
  proposals: GrammarMutationProposal[];
  status: 'pending' | 'success' | 'error';
  error: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  totalNanoAiu: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
};

export type CopilotUsage = {
  status: 'unavailable' | 'available';
  requestCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  totalNanoAiu: number | null;
};

export type CopilotSession = {
  id: string;
  agentId: string | null;
  name: string;
  busy: boolean;
  requestCount: number;
  usage: CopilotUsage;
  turns: CopilotTurn[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Copilot 暫時無法回答。');
  }
  return payload;
}

export function getGithubLoginUrl() {
  return apiPath('/api/auth/github');
}

export async function getAuthUser() {
  const response = await fetch(apiPath('/api/auth/me'), { credentials: 'include', cache: 'no-store' });
  if (response.status === 401) return null;
  return parseResponse<{ user: { id: string; login: string; avatarUrl: string | null } | null }>(response);
}

export async function logoutGithub() {
  return parseResponse<void>(await fetch(apiPath('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
  }));
}

export async function getRemoteGrammarCards() {
  const response = await fetch(apiPath('/api/cards'), { credentials: 'include', cache: 'no-store' });
  if (response.status === 401) return null;
  return parseResponse<{ cards: GrammarCard[] }>(response);
}

export async function saveRemoteGrammarCards(cards: GrammarCard[]) {
  const response = await fetch(apiPath('/api/cards'), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  });
  if (response.status === 401) return null;
  return parseResponse<{ cards: GrammarCard[] }>(response);
}

export async function listCopilotSessions() {
  return parseResponse<{ sessions: CopilotSession[] }>(await fetch(copilotEndpoint, { credentials: 'include', cache: 'no-store' }));
}

export async function listCopilotAgents() {
  return parseResponse<{ agents: AgentProfile[] }>(await fetch(apiPath('/api/copilot/agents'), { credentials: 'include', cache: 'no-store' }));
}

export async function createCopilotAgent(name: string, instructions: string) {
  return parseResponse<{ agent: AgentProfile }>(await fetch(apiPath('/api/copilot/agents'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, instructions }),
  }));
}

export async function updateCopilotAgent(agentId: string, name: string, instructions: string) {
  return parseResponse<{ agent: AgentProfile }>(await fetch(apiPath(`/api/copilot/agents/${agentId}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, instructions }),
  }));
}

export async function deleteCopilotAgent(agentId: string) {
  return parseResponse<{ deleted: true }>(await fetch(apiPath(`/api/copilot/agents/${agentId}`), {
    method: 'DELETE',
    credentials: 'include',
  }));
}

export async function createCopilotSession(name: string, agentId?: string) {
  return parseResponse<{ session: CopilotSession }>(await fetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'create', name, agentId }),
  }));
}

export async function sendCopilotMessage(
  sessionId: string,
  message: string,
  context: string,
  signal: AbortSignal,
  options: { sourceTurnId?: string; attemptType?: 'initial' | 'retry' | 'edit' } = {},
) {
  return parseResponse<{ content: string; turn: CopilotTurn; session: CopilotSession }>(await fetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'send', sessionId, message, context, ...options }),
    signal,
  }));
}

export async function cancelCopilotSession(sessionId: string) {
  return parseResponse<{ session: CopilotSession }>(await fetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'cancel', sessionId }),
  }));
}

export async function deleteCopilotSession(sessionId: string) {
  return parseResponse<{ deleted: true }>(await fetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'delete', sessionId }),
  }));
}

export async function getCopilotQuota() {
  return parseResponse<{ status: 'available' | 'unavailable'; quotaSnapshots: Record<string, unknown> }>(await fetch(apiPath('/api/copilot/quota'), {
    credentials: 'include',
    cache: 'no-store',
  }));
}