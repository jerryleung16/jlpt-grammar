import type { GrammarMutationProposal } from '@/lib/copilot-context';
import type { GrammarCard } from '@/lib/grammar-data';

const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'https://jlpt-grammar-api.onrender.com';
const apiPath = (path: string) => `${apiOrigin}${path}`;
const copilotEndpoint = apiPath('/api/copilot');

export type CopilotTurn = {
  id: string;
  prompt: string;
  context: string;
  response: string | null;
  proposals: GrammarMutationProposal[];
  status: 'pending' | 'success' | 'error';
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CopilotSession = {
  id: string;
  name: string;
  busy: boolean;
  requestCount: number;
  usage: { status: 'unavailable' | 'available' };
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

export async function createCopilotSession(name: string) {
  return parseResponse<{ session: CopilotSession }>(await fetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'create', name }),
  }));
}

export async function sendCopilotMessage(
  sessionId: string,
  message: string,
  context: string,
  signal: AbortSignal,
) {
  return parseResponse<{ content: string; turn: CopilotTurn; session: CopilotSession }>(await fetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'send', sessionId, message, context }),
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