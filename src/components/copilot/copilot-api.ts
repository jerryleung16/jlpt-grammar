import type { GrammarMutationProposal } from '@/lib/copilot-context';
import type { GrammarCard } from '@/lib/grammar-data';

const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'https://jlpt-grammar-api.onrender.com';
const apiPath = (path: string) => `${apiOrigin}${path}`;
const copilotEndpoint = apiPath('/api/copilot');
const sessionTokenKey = 'jlpt_app_session';
const oauthVerifierKey = 'jlpt_oauth_verifier';
const oauthReturnPathKey = 'jlpt_oauth_return_path';

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
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Copilot 暫時無法回答。');
  }
  return payload;
}

export function getGithubLoginUrl() {
  return apiPath('/api/auth/github');
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readSessionToken() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(sessionTokenKey);
  } catch {
    return null;
  }
}

function writeSessionToken(token: string) {
  window.localStorage.setItem(sessionTokenKey, token);
}

export function clearSessionToken() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(sessionTokenKey);
  } catch {
  }
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = readSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers, credentials: init.credentials || 'include' });
  if (response.status === 401) clearSessionToken();
  return response;
}

export async function startGithubLogin() {
  if (typeof window === 'undefined') throw new Error('登入只能在瀏覽器中開始。');
  const verifierBytes = new Uint8Array(32);
  window.crypto.getRandomValues(verifierBytes);
  const verifier = encodeBase64Url(verifierBytes);
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = encodeBase64Url(new Uint8Array(digest));
  window.sessionStorage.setItem(oauthVerifierKey, verifier);
  window.sessionStorage.setItem(oauthReturnPathKey, window.location.hash || '');
  return `${getGithubLoginUrl()}?challenge=${encodeURIComponent(challenge)}`;
}

export function consumeGithubLoginReturnPath() {
  if (typeof window === 'undefined') return '';
  const returnPath = window.sessionStorage.getItem(oauthReturnPathKey) || '';
  window.sessionStorage.removeItem(oauthReturnPathKey);
  return returnPath;
}

export async function completeGithubLogin(code: string) {
  if (typeof window === 'undefined') throw new Error('登入只能在瀏覽器中完成。');
  const verifier = window.sessionStorage.getItem(oauthVerifierKey);
  if (!verifier) throw new Error('登入驗證已失效，請重新登入。');
  const result = await parseResponse<{
    token: string;
    user: { id: string; login: string; avatarUrl: string | null };
  }>(await fetch(apiPath('/api/auth/exchange'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, verifier }),
  }));
  writeSessionToken(result.token);
  window.sessionStorage.removeItem(oauthVerifierKey);
  return result;
}

export async function getAuthUser() {
  const response = await apiFetch(apiPath('/api/auth/me'), { cache: 'no-store' });
  if (response.status === 401) return null;
  return parseResponse<{ user: { id: string; login: string; avatarUrl: string | null } | null }>(response);
}

export async function logoutGithub() {
  try {
    return await parseResponse<void>(await apiFetch(apiPath('/api/auth/logout'), {
      method: 'POST',
    }));
  } finally {
    clearSessionToken();
  }
}

export async function getRemoteGrammarCards() {
  const response = await apiFetch(apiPath('/api/cards'), { cache: 'no-store' });
  if (response.status === 401) return null;
  return parseResponse<{ cards: GrammarCard[] }>(response);
}

export async function saveRemoteGrammarCards(cards: GrammarCard[]) {
  const response = await apiFetch(apiPath('/api/cards'), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  });
  if (response.status === 401) return null;
  return parseResponse<{ cards: GrammarCard[] }>(response);
}

export async function listCopilotSessions() {
  return parseResponse<{ sessions: CopilotSession[] }>(await apiFetch(copilotEndpoint, { cache: 'no-store' }));
}

export async function listCopilotAgents() {
  return parseResponse<{ agents: AgentProfile[] }>(await apiFetch(apiPath('/api/copilot/agents'), { cache: 'no-store' }));
}

export async function createCopilotAgent(name: string, instructions: string) {
  return parseResponse<{ agent: AgentProfile }>(await apiFetch(apiPath('/api/copilot/agents'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, instructions }),
  }));
}

export async function updateCopilotAgent(agentId: string, name: string, instructions: string) {
  return parseResponse<{ agent: AgentProfile }>(await apiFetch(apiPath(`/api/copilot/agents/${agentId}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, instructions }),
  }));
}

export async function deleteCopilotAgent(agentId: string) {
  return parseResponse<{ deleted: true }>(await apiFetch(apiPath(`/api/copilot/agents/${agentId}`), {
    method: 'DELETE',
    credentials: 'include',
  }));
}

export async function createCopilotSession(name: string, agentId?: string) {
  return parseResponse<{ session: CopilotSession }>(await apiFetch(copilotEndpoint, {
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
  return parseResponse<{ content: string; turn: CopilotTurn; session: CopilotSession }>(await apiFetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'send', sessionId, message, context, ...options }),
    signal,
  }));
}

export async function cancelCopilotSession(sessionId: string) {
  return parseResponse<{ session: CopilotSession }>(await apiFetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'cancel', sessionId }),
  }));
}

export async function deleteCopilotSession(sessionId: string) {
  return parseResponse<{ deleted: true }>(await apiFetch(copilotEndpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'delete', sessionId }),
  }));
}

export async function getCopilotQuota() {
  return parseResponse<{ status: 'available' | 'unavailable'; quotaSnapshots: Record<string, unknown> }>(await apiFetch(apiPath('/api/copilot/quota'), {
    cache: 'no-store',
  }));
}