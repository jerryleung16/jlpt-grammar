import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  createAuthSession,
  createOAuthHandoff,
  consumeOAuthHandoff,
  deleteAuthSession,
  getUserBySessionHash,
  initializeDefaultGrammarCards,
  type HostedUser,
  upsertUser,
} from '@/lib/hosted-store';
import { getDefaultGrammarCards } from '@/lib/grammar-data';

const sessionCookie = 'jlpt_session';
const stateCookie = 'jlpt_oauth_state';
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const handoffLifetimeMs = 5 * 60 * 1000;
const oauthStateLifetimeMs = 10 * 60 * 1000;
const verifierPattern = /^[A-Za-z0-9_-]{43,128}$/;

type GithubProfile = {
  id: number;
  login: string;
  avatar_url?: string;
};

function config() {
  const apiUrl = process.env.API_PUBLIC_URL || process.env.APP_URL || 'http://localhost:3000';
  const frontendUrl = process.env.FRONTEND_URL || apiUrl;
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-secret-change-me');
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET || !secret) {
    throw new Error('oauth_not_configured');
  }
  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL || `${apiUrl.replace(/\/$/, '')}/api/auth/github/callback`,
    frontendUrl,
    secret,
  };
}

function cookieOptions(maxAge: number) {
  const secure = process.env.NODE_ENV === 'production';
  return `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}${secure ? '; Secure' : ''}`;
}

function setCookie(response: Response, name: string, value: string, options: string) {
  response.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; ${options}`);
}

function clearCookie(response: Response, name: string) {
  setCookie(response, name, '', cookieOptions(0));
}

function readCookie(request: Request, name: string) {
  const header = request.headers.cookie || '';
  const pair = header.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

type OAuthState = {
  nonce: string;
  expiresAt: number;
  mode: 'handoff' | 'cookie';
  challenge?: string;
};

function signOAuthState(state: OAuthState, secret: string) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyOAuthState(value: string, secret: string) {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) throw new Error('oauth_state_invalid');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('oauth_state_invalid');
  let state: OAuthState;
  try {
    state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
  } catch {
    throw new Error('oauth_state_invalid');
  }
  if (!state || typeof state.nonce !== 'string' || typeof state.expiresAt !== 'number' || state.expiresAt <= Date.now()) {
    throw new Error('oauth_state_invalid');
  }
  if (state.mode === 'handoff' && (!state.challenge || !verifierPattern.test(state.challenge))) {
    throw new Error('oauth_state_invalid');
  }
  if (state.mode !== 'handoff' && state.mode !== 'cookie') throw new Error('oauth_state_invalid');
  return state;
}

function verifierChallenge(verifier: string) {
  if (!verifierPattern.test(verifier)) throw new Error('oauth_verifier_invalid');
  return createHash('sha256').update(verifier).digest('base64url');
}

function bearerToken(request: Request) {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token || null;
}

function encryptionKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

function encrypt(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decrypt(value: string, secret: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

export function githubLogin(request: Request, response: Response) {
  const oauth = config();
  const challenge = typeof request.query.challenge === 'string' ? request.query.challenge : undefined;
  if (challenge && !verifierPattern.test(challenge)) throw new Error('oauth_challenge_invalid');
  const state = signOAuthState({
    nonce: randomBytes(24).toString('base64url'),
    expiresAt: Date.now() + oauthStateLifetimeMs,
    mode: challenge ? 'handoff' : 'cookie',
    challenge,
  }, oauth.secret);
  if (!challenge) setCookie(response, stateCookie, state, cookieOptions(600));
  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: oauth.callbackUrl,
    scope: 'read:user user:email',
    state,
  });
  response.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

export async function githubCallback(request: Request, response: Response) {
  const oauth = config();
  const state = request.query.state;
  if (typeof state !== 'string') throw new Error('oauth_state_invalid');
  const oauthState = verifyOAuthState(state, oauth.secret);
  if (oauthState.mode === 'cookie' && readCookie(request, stateCookie) !== state) {
    throw new Error('oauth_state_invalid');
  }
  if (typeof request.query.code !== 'string') throw new Error('oauth_code_missing');

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: oauth.clientId, client_secret: oauth.clientSecret, code: request.query.code, redirect_uri: oauth.callbackUrl }),
  });
  const tokenPayload = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error || 'oauth_token_failed');

  const profileResponse = await fetch('https://api.github.com/user', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenPayload.access_token}`, 'User-Agent': 'jlpt-grammar' },
  });
  if (!profileResponse.ok) throw new Error('github_profile_failed');
  const profile = await profileResponse.json() as GithubProfile;
  const user: HostedUser = {
    id: `github-${profile.id}`,
    githubId: String(profile.id),
    login: profile.login,
    avatarUrl: profile.avatar_url || null,
    encryptedAccessToken: encrypt(tokenPayload.access_token, oauth.secret),
  };
  await upsertUser(user);
  await initializeDefaultGrammarCards(user.id, getDefaultGrammarCards());

  if (oauthState.mode === 'handoff' && oauthState.challenge) {
    const handoffCode = randomBytes(32).toString('base64url');
    await createOAuthHandoff(hash(handoffCode), user.id, oauthState.challenge, new Date(Date.now() + handoffLifetimeMs));
    const redirectUrl = new URL(oauth.frontendUrl);
    redirectUrl.hash = new URLSearchParams({ oauth_code: handoffCode }).toString();
    response.redirect(redirectUrl.toString());
    return;
  }
  const sessionToken = randomUUID() + randomUUID();
  await createAuthSession(hash(sessionToken), user.id, new Date(Date.now() + sessionLifetimeMs));
  setCookie(response, sessionCookie, sessionToken, cookieOptions(sessionLifetimeMs / 1000));
  clearCookie(response, stateCookie);
  response.redirect(oauth.frontendUrl);
}

export async function currentUser(request: Request) {
  const token = bearerToken(request) || readCookie(request, sessionCookie);
  if (!token) return null;
  const oauth = config();
  const user = await getUserBySessionHash(hash(token));
  if (!user) return null;
  return { ...user, accessToken: decrypt(user.encryptedAccessToken, oauth.secret) };
}

export async function exchangeGithubHandoff(code: string, verifier: string) {
  if (!code || code.length > 256) throw new Error('oauth_handoff_invalid');
  const challenge = verifierChallenge(verifier);
  const sessionToken = randomUUID() + randomUUID();
  await consumeOAuthHandoff(
    hash(code),
    challenge,
    hash(sessionToken),
    new Date(Date.now() + sessionLifetimeMs),
  );
  const user = await getUserBySessionHash(hash(sessionToken));
  if (!user) throw new Error('oauth_handoff_invalid');
  return { token: sessionToken, user: publicUser(user) };
}

export async function logout(request: Request, response: Response) {
  const tokens = [bearerToken(request), readCookie(request, sessionCookie)].filter((token): token is string => Boolean(token));
  await Promise.all([...new Set(tokens)].map((token) => deleteAuthSession(hash(token))));
  clearCookie(response, sessionCookie);
  response.status(204).end();
}

export function publicUser(user: { id: string; login: string; avatarUrl: string | null } | null) {
  return user ? { id: user.id, login: user.login, avatarUrl: user.avatarUrl } : null;
}
