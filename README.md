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

Copilot 抽屜支援建立自訂助教，每個助教有名稱與教學指示；指示只會影響回答風格，不能覆蓋唯讀、提案預覽或秘密資料限制。每個對話會顯示請求次數與 SDK 回報的 token 使用量（若模型沒有回報，會標示資料尚未提供）。回答可編輯後重試，或直接重試；新的嘗試會保留與原訊息的關聯。

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

`FRONTEND_URL` 應設定為完整的 GitHub Pages 網址，例如 `https://USER.github.io/jlpt-grammar/`；OAuth 完成後會回到這個網址。`CORS_ORIGINS` 建議填不含 path 的 origin。API 必須使用 HTTPS。

### Render

`render.yaml` 會建立 Web Service 與 Postgres。設定 OAuth 的兩個 secret，以及 `API_PUBLIC_URL`、`FRONTEND_URL`、`CORS_ORIGINS`；`SESSION_SECRET` 由 Render 自動產生。Render 的健康檢查為 `/api/health`。

### GitHub Pages

在 repository Variables 或 Secrets 設定 `RENDER_API_URL`，值為 Render 公開 URL，不要加最後的 `/`。Pages workflow 會把它注入 `NEXT_PUBLIC_API_BASE_URL`。如果 repository 名稱不是 `jlpt-grammar`，請同步調整 `next.config.ts` 的 `basePath` 與 `assetPrefix`。

### 同頁登入與手機

GitHub Pages 的登入按鈕會先在瀏覽器產生一次性驗證碼，然後前往 Render 的 OAuth API。OAuth 完成後，Render 只會將短效、單次使用的 handoff code 放在 callback fragment，並返回 GitHub Pages；Pages 會立即交換它，將不可讀的應用程式 session token 儲存在瀏覽器，最後網址仍然是 `https://USER.github.io/jlpt-grammar/`。GitHub access token 永遠只保存在 Render 伺服器。

這個流程不依賴 GitHub Pages 到 Render 的第三方 session cookie，因此適合手機瀏覽器。Render 仍然掛載 `/jlpt-grammar/` 的 static export 作為維運備援；舊的 Render cookie session 也會在相容期內繼續有效。若網路暫時失敗，頁面會顯示「重試」而不是靜默隱藏錯誤。
