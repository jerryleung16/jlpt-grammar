import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  createAuthSession,
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
  const state = randomBytes(24).toString('base64url');
  setCookie(response, stateCookie, state, cookieOptions(600));
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
  const savedState = readCookie(request, stateCookie);
  if (typeof state !== 'string' || !savedState || state !== savedState) {
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

  const sessionToken = randomUUID() + randomUUID();
  await createAuthSession(hash(sessionToken), user.id, new Date(Date.now() + sessionLifetimeMs));
  setCookie(response, sessionCookie, sessionToken, cookieOptions(sessionLifetimeMs / 1000));
  clearCookie(response, stateCookie);
  response.redirect(oauth.frontendUrl);
}

export async function currentUser(request: Request) {
  const token = readCookie(request, sessionCookie);
  if (!token) return null;
  const oauth = config();
  const user = await getUserBySessionHash(hash(token));
  if (!user) return null;
  return { ...user, accessToken: decrypt(user.encryptedAccessToken, oauth.secret) };
}

export async function logout(request: Request, response: Response) {
  const token = readCookie(request, sessionCookie);
  if (token) await deleteAuthSession(hash(token));
  clearCookie(response, sessionCookie);
  response.status(204).end();
}

export function publicUser(user: Awaited<ReturnType<typeof currentUser>>) {
  return user ? { id: user.id, login: user.login, avatarUrl: user.avatarUrl } : null;
}
