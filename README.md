# JLPT 文法複習工具

以間隔重複複習為核心的 JLPT 文法學習工具。

## 詞彙與文法整合預覽

`/jlpt-grammar/preview/` 是隔離的功能預覽，原首頁、GitHub 同步及 Copilot 流程保持不變，尚未取代正式站。

- 免登入學習庫：詞彙／文法、自訂卡片、搜尋、編輯及手動掌握標籤。
- 真正的 `ts-fsrs` 排程：四級評分、到期優先、每日新卡限制及撤銷；手動標籤與測驗不會冒充 SRS 歷史。
- 八張原創 N5 示範卡與八道題目，支援題目解析、錯題重練、重新整理後繼續答題。
- 獨立 IndexedDB 本機資料，不自動讀取、刪除或覆蓋舊站儲存。提供可選 Google 登入及需另外啟用的雲端同步預覽；後端尚未部署或配置正式憑證，請定期下載備份。
- 訪客與每個 Firebase 專案／帳戶各用獨立分區；切換帳戶重建學習畫面，未完成的本機寫入仍只寫入原本分區。登入不會自動匯入訪客資料；可在設定預覽、備份雙方，再明確合併。
- 登出返回訪客資料，不刪除帳戶本機副本；重新登入同一帳戶可重新讀取。副本未加密，帳戶分區不是抵抗裝置使用者存取的安全邊界；不要在不可信的共用裝置保留私人資料。針對帳戶的本機副本清除介面仍待加入。
- 設定內可預覽詞彙 v1、文法 Gist v1 或新平台 JSON 備份；同 origin 的旧瀏覽器資料也可手動偵測。只讀卡片與標籤的指定 key，不讀取或匯出 Token。
- 匯入前下載雙方備份並確認；相同 ID 但內容不同時中止，不自動覆蓋。此初版尚未提供逐項衝突解決，請保留原始備份。
- 新平台備份包含卡片、標籤、複習事件、測驗及設定；合併匯入保留目前設定，並切換全部級別以顯示舊詞彙的「未分級」卡片。
- 預覽版儲存與匯入的 JSON 備份上限均為 20 MB，超出時會拒絕本次變更，保留原資料；不允許產生無法重新匯入的超大備份。

目前示範內容尚待獨立語文校對，不是完整 N1–N5 教材或正式模擬考。同步正式環境驗收、共用 AI、完整教材授權／課綱／校對、完整遷移與正式切換仍是後續工作；不得以此預覽宣稱計劃全部完成。預覽不會發送私人卡片至 AI。

正式教材的已確認方向：以 JMdict、授權核實後的分級索引及原創文法／題目為基礎，講解與解析採廣東話繁體。相關衍生教材按來源的署名／ShareAlike 要求發布；由專案負責人安排合適的獨立語文校對者。逐項課綱、上游授權與校對尚未完成，不將未核實來源直接納入正式教材。

驗證預覽的模型、舊格式匯入、FSRS、測驗及 IndexedDB 交易：

```text
npm run test:learning
npm run lint
npx tsc --noEmit
npm run build
```

### Firebase 準備狀態

已建立獨立的 Firebase 專案 `nihongo-learning-jerryleung16`（Japanese Learning），使用 Spark 免費方案，並註冊 `Japanese Learning Web`。Google Authentication 已啟用；授權網域包含 `jerryleung16.github.io`、`localhost`、`127.0.0.1` 及 Firebase 預設網域。未為此專案開通付費、Analytics、Gemini、Firestore 或 Firebase Hosting。

預覽已接入 Firebase Web SDK，透過使用者點擊啟動 Google 彈出登入，並顯示取消、封鎖視窗、未授權網域及網絡錯誤。只要求基本登入身分，不要求 Gmail／Drive 額外權限，不把登入憑證加入學習備份。登入狀態由 Firebase SDK 保留到明確登出；載入 SDK 失敗不影響訪客學習。

**前端登入不等於雲端同步已完成。** 程式已加入 Express Firebase ID token 驗證及撤銷檢查、獨立 Postgres 學習帳戶、持久化 outbox／revision／衝突保護；但正式後端尚未配置或部署，不能宣稱已跨裝置同步。Google 與舊 GitHub 帳戶雙重驗證連結仍待實作。Google 身分不會傳到舊 GitHub API，也不授予 Copilot 權限。使用者已回報一般瀏覽器的本機 Google 登入成功；重新整理／登出／帳戶切換、GitHub Pages 部署及手機／Safari 流程仍須實測，不以單元測試代替真實 OAuth 驗收，也不自動退回未驗證的跨網域 redirect。

本機在未追蹤的 `.env.local` 設定以下四項公開的 Web app 設定，重新啟動開發伺服器或重新建置後生效：

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

四項全留空時維持訪客模式；部分漏填或格式無效時顯示設定錯誤，仍可使用訪客學習。GitHub Pages workflow 從 repository Variables `FIREBASE_API_KEY`、`FIREBASE_AUTH_DOMAIN`、`FIREBASE_PROJECT_ID`、`FIREBASE_APP_ID` 注入對應值；這些是 build-time 設定，變更後必須重新建置。不要在這些 `NEXT_PUBLIC_*` 設定放 Admin SDK／服務帳戶秘密。

服務帳戶私鑰只能使用後端秘密設定，不能寫進原始碼、備份或聊天紀錄。現有 GitHub 登入／Copilot 憑證不應直接當成 Firebase 憑證。Web config 不包含後端服務帳戶憑證；本機測試設定不會自動配置 repository Variables、部署網站或更改正式資料庫。

若 VS Code 內嵌瀏覽器封鎖登入彈出視窗，請在一般 Chrome／Edge／Safari 開啟相同網址，親自按「設定 → 使用 Google 登入」，並按需要允許彈出視窗。不要提供 Google 密碼或登入 token 給開發工具。此環境的自動化已驗證封鎖視窗會顯示錯誤；一般瀏覽器登入成功來自使用者實測回報，備份檔實際下載仍須在一般瀏覽器確認。

### 同步預覽的行為與限制

- 前端需 `NEXT_PUBLIC_LEARNING_SYNC_ENABLED=true` 才開放入口。`NEXT_PUBLIC_LEARNING_API_BASE_URL` 可單獨指定預覽 API，未指定則沿用 `NEXT_PUBLIC_API_BASE_URL`／現有 Render API；只接受 HTTPS 或 loopback HTTP，不接受 URL 內的憑證。
- 首次啟用先讀取雲端及顯示合併預覽，下載雙方備份，再明確確認上傳；訪客分區不會自動上傳。首次合併保留本機設定，之後設定變更亦會同步。
- 本機更新及 outbox 在同一個 IndexedDB 交易保存。每筆待傳請求的 operation ID、base revision、內容不會因重試改變；傳輸期間新增的本機修改會另排下一筆，不會被較舊回覆蓋掉。
- 後端以已驗證的 Firebase project／uid 解析帳戶，不接受 payload 提供 user ID 或按 email 合併帳戶。`verifyIdToken(token, true)` 同時檢查撤銷／停用狀態；驗證服務不可用時拒絕存取，不退回略過驗證。此 API 不接受 Auth Emulator 模式。
- Postgres 交易鎖定該帳戶，核對 revision，再原子寫入資料及 idempotency receipt。重送相同 operation ID 返回原先 receipt；同 ID 改內容會被拒絕。
- 發生版本競爭時以共同基準合併不相衝的紀錄與設定；同一紀錄雙方都有不同修改則停止並持久保留兩邊供下載。沒有整庫 last-write-wins。暫未提供完整逐欄衝突編輯器；同一測驗進度的不同答案需人工處理，不能抹掉雲端歷史硬上傳。
- 設定衝突提供主題、級別、每日新卡上限及時區的本機／雲端值對照，逐項明確選擇並確認已保存兩份備份後才套用；沒有預選勝出方。卡片／學習歷史衝突或歷史改寫會阻擋套用。檢視期間資料變更須重新確認，儲存時亦以同一 IndexedDB 交易核對版本；雲端再次更新仍會經 revision 檢查，不跳過衝突保護。
- 既有 review 的評分／時間及 quiz 已提交答案不能被改寫；review 撤銷只允許 false → true。此階段未開放刪除同步紀錄，伺服器拒絕移除既有 ID；正式刪除功能必須先實作 tombstone，不能用空 snapshot 清空雲端。
- 啟用後於本機變更、恢復網絡、回到視窗及可見分頁定期檢查時同步；隱藏分頁停止輪詢，避免一直喚醒免費服務。請求逾時為 90 秒以容納 Render Free 冷啟動；暫時錯誤採有上限的退避重試。401、無效資料等需人工處理的 HTTP 錯誤不會持續背景重送。暫停保留待傳資料，已發出的請求可能完成；重新啟用沿用原 operation ID。
- 狀態明確區分「尚未啟用」與「自動同步已暫停」，並顯示已確認雲端版本及是否有未確認本機修改。暫停時即使沒有排入 outbox 的操作，未上傳的本機變更仍會顯示；解決設定衝突不會自行恢復已暫停的同步。
- 此階段傳輸整份最多 20 MB 的學習 snapshot，而非完整公用教材包。大型教材分包／增量傳輸、帳戶刪除、tombstone、舊 GitHub 身分連結及正式環境多帳戶／手機驗收仍屬發布門檻。
- IndexedDB 升至 v2 時保留 v1 訪客資料，只增加同步 metadata store。其他開着的舊版本分頁需要重新整理；同步 metadata 不會放入可分享的學習備份。

### 後端設定與正式啟用門檻

1. 先備份現有 Postgres，並在獨立測試資料庫演練。新功能只新增 `learning_accounts`、`learning_snapshots`、`learning_sync_operations`，不改舊 GitHub 使用者／卡片／Copilot 表的資料；未提供跨系統帳戶連結前兩者保持分開。學習 API 共用連線池，但不呼叫舊站 schema 初始化；舊 API（包括 `/api/health`）仍沿用原有初始化流程。
2. 後端設定 `FIREBASE_PROJECT_ID=nihongo-learning-jerryleung16`。由管理員自行配置 Application Default Credentials，授予驗證撤銷所需的 Firebase Authentication 讀取權限（例如專用帳戶的 Firebase Authentication Viewer），不要用前端 Web config 取代。
3. 若在 Render 使用憑證檔，由管理員直接加入 Secret File `firebase-admin.json`，再設定 `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json`。不要把檔案、私鑰或資料庫密碼貼到聊天、commit 或放入前端變數。程式不需要 Firestore 或額外的 Google 使用者 OAuth scope。
4. 確認 `DATABASE_URL`、`FRONTEND_URL`／`CORS_ORIGINS` 和 HTTPS。後端只有 `LEARNING_SYNC_ENABLED=true` 且驗證成功後，才會初始化新表及處理該帳戶的資料；預設 false。不要在未審核遷移及備份前於正式環境啟用。
5. 路由為 `GET/PUT /api/learning/state`，另保留 `/jlpt-grammar/api/learning/state`。前端送 Firebase bearer token；舊 `/api/auth/*`、`/api/cards`、Copilot 仍使用原有 GitHub 驗證，互不替代。
6. 測試兩個帳戶隔離、兩裝置離線修改、丟失回覆重送、衝突保護、撤銷登入及恢復備份，再另外確認部署。GitHub Pages repository Variable `LEARNING_SYNC_ENABLED=true` 只打開前端入口，不會替後端設定憑證。

本機 Express 不會自動讀取 `.env.local`。測試後端時，可在同一個 shell 設定 `NODE_ENV=production`／`PORT`／`HOST=127.0.0.1`，再以 `node --env-file=.env.local --import tsx server/index.ts` 載入設定及既有 `out/`。`HOST` 未設定時保留部署所需的 `0.0.0.0`；私人本機測試必須明確綁定 loopback。後端同步預設仍為 false；測試憑證及資料庫連線須另外配置，不能以本機驗證代表正式環境已啟用。

若工作目錄由 OneDrive 等服務同步，`.env.local` 只放公開 Web 設定；管理憑證檔、資料庫密碼及後端秘密應由使用者放在不同步的受保護位置或直接設於程序環境。不要把秘密檔移入儲存庫或交給前端建置。

`npm run test:learning` 包含 PGlite 的 PostgreSQL SQL／交易測試、受保護 HTTP API、IndexedDB、離線／衝突情境。PGlite 測試不連線正式 Postgres；Firebase 驗證測試使用注入的測試 verifier，不代表真實後端憑證或 Google 撤銷流程已驗收。

隔離測試已使用專用只讀 Firebase 服務帳戶及全新 Neon Free 資料庫，驗證真實 Google 登入、首次備份與明確啟用、實際 Postgres 寫入及一般／無痕瀏覽器的獨立儲存區同步。進一步由使用者操作並以唯讀 SQL 核對：

- API 停止時，本機修改保留且顯示同步失敗；關閉分頁、重啟 API 再開頁後，待傳修改成功補傳，複習紀錄不變。
- 兩個儲存區暫停後，將同一設定由共同值改成不同值；先上傳的一方保留在雲端，另一方顯示衝突而不覆蓋。下載兩份衝突備份、明確採用雲端值後，正常同步恢復。
- 兩個 Google 帳戶各自保存獨立快照；第二帳戶的空白學習庫及設定不影響第一帳戶的 8 張卡／8 筆複習。登出再切回原帳戶亦恢復正確分區。
- 經使用者批准，透過 Firebase Console 暫時停用第二測試使用者；既有登入的上傳被拒絕，本機待傳修改保留，雲端未變。重新啟用並登入後成功補傳；未提升後端只讀角色權限。

測試收尾已恢復帳戶可用狀態及兩邊每日新卡上限 10。資料庫最終核實第一帳戶版本 19（8 張卡／8 筆複習）、第二帳戶版本 5（空白學習庫），且仍只有三張 `learning_*` 表。上述是 API 中斷及帳戶停用驗收，不等於完整網絡斷線、真實回覆丟失或獨立 token 撤銷測試；跨實體裝置及手機／Safari 仍待驗收。獨立 HTTPS 部署狀態見下節。

## 本機執行

### 獨立 HTTPS 預覽發布

線上預覽：[日和學習](https://nihongo-learning-preview.onrender.com/jlpt-grammar/preview/)。

獨立 Render Free 服務已部署 `release/learning-preview` 分支，未改動 `master` 或原有兩站。已驗證首頁轉址、靜態頁面、資料庫健康檢查、同步讀寫對缺少／無效 token 回應 401，以及停用的舊 API 回應 404。線上訪客示範卡、FSRS 評分及測驗答案解析亦已實測；Google 授權網域已加入，仍需一般瀏覽器完成此新網址的真人登入／同步確認。原文法站及個人 Copilot 連結在獨立模式下均指向原站。

`render-preview.yaml` 提供另一個 Render Free 服務的設定範本，不能用它更新原有服務。發布分支與 `master` 分開，並關閉自動部署；使用 Node 22（Firebase Admin 要求），新服務與靜態頁面使用同一個 HTTPS origin。`NEXT_PUBLIC_LEARNING_ONLY=true` 會讓同步固定呼叫本站 API，忽略其他 API origin 設定，避免把本機 `127.0.0.1` 或舊 API 編入公開網站。

- `LEARNING_ONLY=true` 讓 `/` 及 `/jlpt-grammar/` 轉到整合學習預覽，舊 GitHub／Copilot API 在此服務回應 404；舊網站仍透過獨立連結開啟。沒有宣稱此版本已整合個人 AI。
- `NEXT_PUBLIC_LEARNING_ONLY=true` 在建置時啟用舊站外部連結。未設上述開關的原部署保持既有首頁與 API 行為。
- 健康檢查只執行 `SELECT 1`，不初始化舊資料表；未配置或不能連接資料庫時回應 503。此模式強制 PostgreSQL 憑證驗證及有限連線／查詢等待時間。
- 由服務管理者直接設定隔離資料庫的 `DATABASE_URL`，以及 Secret File `firebase-admin.json`；不能提交秘密檔。後端使用 `/etc/secrets/firebase-admin.json`，不要改用前端 Web config。
- 首次部署取得網址後，把該服務 hostname 加入 Firebase Authentication 授權網域，再驗證 HTTPS 頁面、Google 登入及同步。不要把正式資料庫指向這個預覽，也不要啟用付費升級。
- 免費服務閒置後可能休眠，首次開啟較慢；定期下載學習備份。教材仍只有原創示範內容，完整 N1–N5 教材、舊帳戶連結及完整個人 AI 整合未完成。

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
2. Render Web Service 執行 `npm run start`，提供 OAuth、CORS、Postgres、卡片 API 與 Copilot API。Postgres 可以使用 Render 或 Neon；API 只需要標準的 `DATABASE_URL`。

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

`render.yaml` 會建立 Web Service；`DATABASE_URL` 必須手動設定為 Neon connection string。資料庫遷移完成前不要刪除舊的 Render Postgres。設定 OAuth 的兩個 secret，以及 `API_PUBLIC_URL`、`FRONTEND_URL`、`CORS_ORIGINS`；`SESSION_SECRET` 由 Render 自動產生，遷移時必須保持不變。Render 的健康檢查為 `/api/health`。

Neon 的 `pg_dump`、`pg_restore` 與管理操作應使用 direct connection string。Render API 可使用 direct connection string；若改用 Neon 的 pooled connection string，請保留應用程式交易在同一個 checked-out client 上。Neon Free 的資料庫會 scale to zero，第一次請求可能需要等待資料庫喚醒；並有 0.5 GB 儲存與每月 100 CU-hours 限制。

### GitHub Pages

在 repository Variables 或 Secrets 設定 `RENDER_API_URL`，值為 Render 公開 URL，不要加最後的 `/`。Pages workflow 會把它注入 `NEXT_PUBLIC_API_BASE_URL`。如果 repository 名稱不是 `jlpt-grammar`，請同步調整 `next.config.ts` 的 `basePath` 與 `assetPrefix`。

### 同頁登入與手機

GitHub Pages 的登入按鈕會先在瀏覽器產生一次性驗證碼，然後前往 Render 的 OAuth API。OAuth 完成後，Render 只會將短效、單次使用的 handoff code 放在 callback fragment，並返回 GitHub Pages；Pages 會立即交換它，將不可讀的應用程式 session token 儲存在瀏覽器，最後網址仍然是 `https://USER.github.io/jlpt-grammar/`。GitHub access token 永遠只保存在 Render 伺服器。

這個流程不依賴 GitHub Pages 到 Render 的第三方 session cookie，因此適合手機瀏覽器。Render 仍然掛載 `/jlpt-grammar/` 的 static export 作為維運備援；舊的 Render cookie session 也會在相容期內繼續有效。若網路暫時失敗，頁面會顯示「重試」而不是靜默隱藏錯誤。
