import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence, browserPopupRedirectResolver, GoogleAuthProvider,
  initializeAuth, onAuthStateChanged, signInWithPopup, signOut,
} from 'firebase/auth';
import { accountScope, type LearningFirebaseConfig, type LearningScope } from './identity';

export type LearningAccount = { scope: LearningScope; name: string };
const appName = 'nihongo-learning';

export function createLearningAuth(config: LearningFirebaseConfig) {
  const app = getApps().find((entry) => entry.name === appName) ?? initializeApp(config, appName);
  const auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  auth.languageCode = 'zh-HK';
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return {
    subscribe(onChange: (account: LearningAccount | null) => void, onError: (cause: unknown) => void) {
      return onAuthStateChanged(auth, (user) => {
        onChange(user ? { scope: accountScope(config.projectId, user.uid), name: user.displayName || 'Google 使用者' } : null);
      }, onError);
    },
    signIn() { return signInWithPopup(auth, provider); },
    signOut() { return signOut(auth); },
    async token(scope: LearningScope) {
      const user = auth.currentUser;
      if (!user || accountScope(config.projectId, user.uid) !== scope) throw new Error('帳戶已切換或登出，同步已停止。');
      const token = await user.getIdToken();
      if (auth.currentUser?.uid !== user.uid) throw new Error('帳戶已切換或登出，同步已停止。');
      return token;
    },
  };
}
export type LearningAuth = ReturnType<typeof createLearningAuth>;
