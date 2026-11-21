# SiteForge — AI Website Maker (Netlify)

Type a prompt → get a complete, responsive website with live preview, refine, version history, copy and download.

```
public/index.html                  the app (static)
netlify/edge-functions/generate.js streams AI output from the Anthropic API
netlify.toml                       publish folder = public
```

## Deploy (Git — recommended)
1. Push this folder to a GitHub repo.
2. Netlify → **Add new project → Import an existing project** → pick the repo.
   Build command: *(leave empty)* · Publish directory: `public`
3. **Site configuration → Environment variables → Add**: `ANTHROPIC_API_KEY` = your key from console.anthropic.com
4. **Deploys → Trigger deploy**. Open the site and generate.

## Deploy (CLI)
```bash
npm i -g netlify-cli
netlify login
cd siteforge-netlify
netlify init                 # create/link a site
netlify env:set ANTHROPIC_API_KEY sk-ant-xxxxx
netlify deploy --prod
```

Local test: `netlify dev` → http://localhost:8888

> Drag-and-drop deploy (app.netlify.com/drop) does **not** deploy edge functions — use Git or CLI.

## Optional env vars
- `MODEL` (default `claude-sonnet-5-5`; use `claude-haiku-5-5` for cheaper/faster)
- `MAX_TOKENS` (default `16000`)

## Cost / abuse
Every generation spends your API credits. Before sharing the URL publicly, set a monthly spend limit in the Anthropic Console, and consider Netlify's rate limiting or password protection.
