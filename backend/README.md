# skillforge-backend

Standalone Bun + Hono backend that runs parallel to the Cloudflare Worker.

The CF Worker at `../src/worker.ts` stays the source of truth for HTTP logic;
this folder just re-wires its `fetch` handler to run under Bun with a libsql
(SQLite / Turso) database instead of Cloudflare D1.

## Why parallel

- The same migrations / schema / queries run on both backends — libsql speaks
  the D1 dialect. Cut-over is flipping DNS; no dual-write or data copy.
- Business logic in `../src/server/*`, `../src/providers/*`, `../src/lib/*` is
  imported directly. No fork.
- Next step after this: drop a real MCP server next to the backend (Gemma 4
  via vLLM / Ollama / llama.cpp) and point `MCP_SERVER_URL` at it.

## Run locally

```bash
cd backend
cp .env.example .env
# edit .env → set DEEPSEEK_API_KEY, ADMIN_EMAILS
bun install
bun run migrate           # applies ../migrations/*.sql to db/skillforge.db
bun run dev               # watches src/app.ts, restarts on change
```

Backend listens on `http://localhost:3000`. Smoke test:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/tiers
```

## Serving the frontend on the same origin

Build the Astro site once:

```bash
cd ..
npm run build              # outputs ../dist
```

Then in `backend/.env` set `STATIC_DIR=../dist` and restart. Bun serves
`/api/*` via Hono and everything else from `../dist`. No CORS, cookies just
work.

For production behind nginx — leave `STATIC_DIR` empty and let nginx serve
`/var/www/skillforge/dist` for `/*` and `proxy_pass` to `:3000` for `/api/*`.

## Point at a real MCP server (Gemma 4)

```
# .env
MCP_SERVER_URL=http://localhost:8080/mcp
MCP_SERVER_TOKEN=…
```

Expected endpoints on the MCP server:

- `POST /sessions/open`  body `{advisor, skills, activeSkillId, transcript}`
  → `{conversationId, message: BotMessageResponse}`
- `POST /sessions/turn`  body `{conversationId, transcript}`
  → `{message: BotMessageResponse}`
- `POST /sessions/close` body `{conversationId}`
  → `{}`

With MCP_SERVER_URL **unset** the backend falls back to a stub that calls
DeepSeek directly — the advisor's full skill set is packaged into the system
prompt server-side so clients still never see it.

## Deploying to your VPS (sketch)

```
/opt/skillforge/
├── backend/                   # this folder (checked out via git)
├── dist/                      # built Astro frontend
├── db/skillforge.db           # libsql / SQLite file
└── systemd/skillforge.service # starts `bun src/app.ts`

/etc/nginx/sites-enabled/skillforge:
  server {
    server_name skillforge.example.com;
    location /api/ { proxy_pass http://127.0.0.1:3000; }
    location /    { root /opt/skillforge/dist; try_files $uri $uri/ /index.html; }
  }
```

## Moving data from the CF D1 database

```bash
# On your laptop, with wrangler logged in:
wrangler d1 export skillforge-db --remote --output skillforge-snapshot.sql
scp skillforge-snapshot.sql vps:/opt/skillforge/backend/

# On the VPS:
sqlite3 db/skillforge.db < skillforge-snapshot.sql
```

The D1 export is plain SQL; libsql reads it directly.

## Type-check

```bash
bun run typecheck
```
