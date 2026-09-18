import path from 'node:path';
import express, { type Request, type Response } from 'express';
import next from 'next';
import { currentUser, exchangeGithubHandoff, githubCallback, githubLogin, logout, publicUser } from '@/lib/hosted-auth';
import { corsHeaders } from '@/lib/hosted-cors';
import {
  databaseHealth,
  getGrammarCards,
  hasDatabase,
  replaceGrammarCards,
  validateGrammarCards,
} from '@/lib/hosted-store';
import {
  cancelAgentSession,
  createAgentProfile,
  createAgentSession,
  deleteAgentProfile,
  deleteAgentSession,
  getCopilotQuota,
  listAgentProfiles,
  listAgentSessions,
  sendAgentMessage,
  stopCopilot,
  updateAgentProfile,
} from '@/lib/copilot-server';

const port = Number(process.env.PORT || 3000);
const isDevelopment = process.env.NODE_ENV !== 'production';

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'unknown_error';
  const status = {
    database_unavailable: 503,
    oauth_not_configured: 503,
    oauth_challenge_invalid: 400,
    oauth_verifier_invalid: 400,
    oauth_handoff_invalid: 400,
    session_not_found: 404,
    duplicate_name: 409,
    agent_limit: 409,
    last_agent: 409,
    agent_not_found: 404,
    turn_not_found: 404,
    session_busy: 409,
    concurrency_limit: 429,
    unauthenticated: 401,
    invalid_cards: 400,
  }[code] || 400;
  const messages: Record<string, string> = {
    database_unavailable: '資料庫尚未設定，請聯絡管理員。',
    oauth_not_configured: 'GitHub OAuth 尚未設定，請聯絡管理員。',
    oauth_state_invalid: '登入狀態已失效，請重新登入。',
    oauth_code_missing: 'GitHub 登入未完成，請重試。',
    oauth_challenge_invalid: '登入請求無效，請重新登入。',
    oauth_verifier_invalid: '登入驗證無效，請重新登入。',
    oauth_handoff_invalid: '登入連結已失效，請重新登入。',
    invalid_name: '對話名稱不可為空，且不能超過 80 個字元。',
    duplicate_name: '這個對話名稱已經存在，請換一個名稱。',
    agent_limit: '已達到自訂助教數量上限。',
    last_agent: '至少需要保留一個助教。',
    agent_not_found: '找不到這個自訂助教。',
    invalid_instructions: '助教指示不可超過 4000 字元。',
    turn_not_found: '找不到要重試的訊息。',
    invalid_message: '請提供不超過 1000 字元的問題。',
    invalid_context: '目前文法卡片內容無效或過長。',
    session_not_found: '找不到這個對話，請重新建立。',
    session_busy: '這個對話正在回答，請稍後再試。',
    concurrency_limit: '目前有太多回答正在處理，請稍後再試。',
    unauthenticated: '請先使用 GitHub 登入。',
    invalid_cards: '文法卡片資料格式無效。',
  };
  return { status, body: { error: messages[code] || '服務暫時無法使用，請稍後再試。', code } };
}

async function authenticated(request: Request) {
  const user = await currentUser(request);
  if (!user) throw new Error('unauthenticated');
  return user;
}

function routeError(error: unknown, response: Response) {
  const result = errorResponse(error);
  response.status(result.status).json(result.body);
}

export async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(corsHeaders);
  app.use(express.json({ limit: '128kb' }));

  const api = express.Router();

  api.get('/health', async (_request, response) => {
    const database = await databaseHealth();
    response.json({ ok: database.reachable || !hasDatabase(), database });
  });

  api.get('/auth/github', (request, response) => {
    try {
      response.setHeader('Cache-Control', 'no-store');
      githubLogin(request, response);
    } catch (error) {
      routeError(error, response);
    }
  });

  api.get('/auth/github/callback', async (request, response) => {
    try {
      response.setHeader('Cache-Control', 'no-store');
      await githubCallback(request, response);
    } catch (error) {
      routeError(error, response);
    }
  });

  api.post('/auth/exchange', async (request, response) => {
    try {
      response.setHeader('Cache-Control', 'no-store');
      const result = await exchangeGithubHandoff(request.body?.code, request.body?.verifier);
      response.json(result);
    } catch (error) {
      routeError(error, response);
    }
  });

  api.get('/auth/me', async (request, response) => {
    try {
      const user = await currentUser(request);
      response.json({ user: publicUser(user) });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.post('/auth/logout', async (request, response) => {
    try {
      await logout(request, response);
    } catch (error) {
      routeError(error, response);
    }
  });

  api.get('/cards', async (request, response) => {
    try {
      const user = await authenticated(request);
      response.json({ cards: await getGrammarCards(user.id) });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.put('/cards', async (request, response) => {
    try {
      const user = await authenticated(request);
      if (!validateGrammarCards(request.body?.cards)) throw new Error('invalid_cards');
      await replaceGrammarCards(user.id, request.body.cards);
      response.json({ cards: request.body.cards });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.get('/copilot', async (request, response) => {
    try {
      const user = await authenticated(request);
      response.json({ sessions: await listAgentSessions(user.id, user.accessToken) });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.get('/copilot/agents', async (request, response) => {
    try {
      const user = await authenticated(request);
      response.json({ agents: await listAgentProfiles(user.id) });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.post('/copilot/agents', async (request, response) => {
    try {
      const user = await authenticated(request);
      response.status(201).json({ agent: await createAgentProfile(user.id, request.body?.name, request.body?.instructions) });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.put('/copilot/agents/:agentId', async (request, response) => {
    try {
      const user = await authenticated(request);
      response.json({ agent: await updateAgentProfile(user.id, request.params.agentId, request.body?.name, request.body?.instructions) });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.delete('/copilot/agents/:agentId', async (request, response) => {
    try {
      const user = await authenticated(request);
      await deleteAgentProfile(user.id, request.params.agentId);
      response.json({ deleted: true });
    } catch (error) {
      routeError(error, response);
    }
  });

  api.get('/copilot/quota', async (request, response) => {
    try {
      const user = await authenticated(request);
      response.json(await getCopilotQuota(user.id, user.accessToken));
    } catch (error) {
      routeError(error, response);
    }
  });

  api.post('/copilot', async (request, response) => {
    try {
      const user = await authenticated(request);
      const payload = request.body as {
        operation?: string;
        sessionId?: string;
        name?: string;
        agentId?: string;
        message?: string;
        context?: string;
        turnId?: string;
        sourceTurnId?: string;
        attemptType?: 'initial' | 'retry' | 'edit';
      };
      switch (payload.operation || 'send') {
        case 'create':
          response.status(201).json({ session: await createAgentSession(user.id, user.accessToken, payload.name || '我的文法對話', payload.agentId) });
          return;
        case 'send':
          if (!payload.sessionId) throw new Error('session_not_found');
          response.json(await sendAgentMessage(user.id, user.accessToken, payload.sessionId, payload.message, payload.context, payload.sourceTurnId || payload.turnId, payload.attemptType || 'initial'));
          return;
        case 'cancel':
          if (!payload.sessionId) throw new Error('session_not_found');
          response.json({ session: await cancelAgentSession(user.id, user.accessToken, payload.sessionId) });
          return;
        case 'delete':
          if (!payload.sessionId) throw new Error('session_not_found');
          await deleteAgentSession(user.id, user.accessToken, payload.sessionId);
          response.json({ deleted: true });
          return;
        default:
          throw new Error('unknown_operation');
      }
    } catch (error) {
      routeError(error, response);
    }
  });

  app.use('/api', api);
  app.use('/jlpt-grammar/api', api);

  if (isDevelopment) {
    const nextApp = next({ dev: true, hostname: 'localhost', port });
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();
    app.use((request, response) => handle(request, response));
  } else {
    const staticDirectory = path.join(process.cwd(), 'out');
    app.use('/jlpt-grammar', express.static(staticDirectory));
    app.use(express.static(staticDirectory));
  }

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createServer().then((app) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`JLPT grammar server listening on ${port}`);
    });
    const shutdown = async () => {
      await stopCopilot();
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
