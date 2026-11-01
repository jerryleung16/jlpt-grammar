import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

export type VerifiedIdentity = { projectId: string; uid: string };
export async function verifyLearningToken(
  token: string,
  projectId: string,
  verify: (token: string, checkRevoked: boolean) => Promise<DecodedIdToken>,
): Promise<VerifiedIdentity> {
  const decoded = await verify(token, true);
  if (decoded.aud !== projectId || decoded.iss !== `https://securetoken.google.com/${projectId}` ||
    !decoded.uid || decoded.firebase.sign_in_provider !== 'google.com' || decoded.email_verified !== true) {
    throw new Error('learning_identity_invalid');
  }
  return { projectId, uid: decoded.uid };
}

export async function authenticateLearning(authorization: string | undefined): Promise<VerifiedIdentity> {
  if (process.env.LEARNING_SYNC_ENABLED !== 'true') throw new Error('learning_sync_disabled');
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('learning_auth_not_configured');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 16384) throw new Error('unauthenticated');
  const token = authorization.slice(7).trim();
  if (!token || /\s/.test(token)) throw new Error('unauthenticated');
  const app = getApps().find((entry) => entry.name === 'learning-api') ??
    initializeApp({ projectId, credential: applicationDefault() }, 'learning-api');
  if (app.options.projectId !== projectId) throw new Error('learning_auth_not_configured');
  try {
    return await verifyLearningToken(token, projectId, (value, revoked) => getAuth(app).verifyIdToken(value, revoked));
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'learning_identity_invalid') throw cause;
    const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
    if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/argument-error',
      'auth/user-disabled', 'auth/user-not-found'].includes(String(code))) throw new Error('unauthenticated');
    throw new Error('learning_auth_unavailable');
  }
}
