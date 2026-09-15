# JLPT 文法複習工具

以間隔重複複習為核心的 JLPT 文法學習工具。

## 本機執行

```bash
npm install
npm run dev
```

## 路由

- `/` — 緊湊首頁，包含滑動式卡片複習、卡片管理與同步工具
- `/practice` — 相容性轉址，會前往首頁的複習區

## 技術架構

- Next.js App Router
- TypeScript
- Tailwind CSS
- Framer Motion
- ts-fsrs
- 可搭配 TinaCMS 的內容結構
