# JLPT 文法複習工具

以間隔重複複習為核心的 JLPT 文法學習工具。

## 本機執行

```bash
npm install
npm run dev
```

本機 API 由 Express 提供，前端仍由 Next.js 開發伺服器提供。登入與資料庫設定請參考 `.env.example`。Hosted 模式使用 GitHub OAuth，不再依賴部署機器上的 Copilot CLI 登入狀態。

```text
http://localhost:3000/jlpt-grammar/
```

使用 GitHub 登入後，文法卡片會同步至 Postgres，Copilot 對話也會儲存並在伺服器重啟後恢復。未登入時仍可使用本機瀏覽器的 `localStorage` 卡片，但無法使用 Hosted Copilot 或跨裝置同步。

助教會在右側抽屜中回答目前文法卡的問題，也可以提出修改或新增卡片的預覽。只有按下「確認套用」後，變更才會寫入卡片資料。助教不會刪除檔案或設定。

## 路由

- `/` — 緊湊首頁，包含滑動式卡片複習、卡片管理與同步工具
- `/practice` — 相容性轉址，會前往首頁的複習區

## 技術架構

- Next.js App Router
- Express Node API
- TypeScript
- Tailwind CSS
- Framer Motion
- ts-fsrs
- GitHub Copilot SDK
- GitHub OAuth
- Postgres
- 可搭配 TinaCMS 的內容結構

## 部署備註

這個專案現在分成兩個部署：

1. GitHub Pages 提供 `next build` 產生的 `out/` 靜態前端。
2. Render Web Service 執行 `npm run start`，提供 OAuth、CORS、Postgres、卡片 API 與 Copilot API。

### GitHub OAuth App

在 GitHub Developer Settings 建立 OAuth App：

- Authorization callback URL：`https://YOUR-RENDER-SERVICE.onrender.com/api/auth/github/callback`
- Render `GITHUB_CLIENT_ID`：OAuth App 的 Client ID
- Render `GITHUB_CLIENT_SECRET`：OAuth App 的 Client Secret
- Render `API_PUBLIC_URL`：Render 服務公開 URL
- Render `FRONTEND_URL`：GitHub Pages 網址，例如 `https://USER.github.io/jlpt-grammar/`
- Render `CORS_ORIGINS`：同一個 GitHub Pages origin，例如 `https://USER.github.io`

### Render

`render.yaml` 會建立 Web Service 與 Postgres。設定 OAuth 的兩個 secret，以及 `API_PUBLIC_URL`、`FRONTEND_URL`、`CORS_ORIGINS`；`SESSION_SECRET` 由 Render 自動產生。Render 的健康檢查為 `/api/health`。

### GitHub Pages

在 repository Variables 或 Secrets 設定 `RENDER_API_URL`，值為 Render 公開 URL，不要加最後的 `/`。Pages workflow 會把它注入 `NEXT_PUBLIC_API_BASE_URL`。如果 repository 名稱不是 `jlpt-grammar`，請同步調整 `next.config.ts` 的 `basePath` 與 `assetPrefix`。
