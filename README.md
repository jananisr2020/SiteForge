# SiteForge — AI Website Maker (Netlify)

Type a prompt → get a complete, responsive website with live preview, refine, version history, copy and download.

```
public/index.html                  the app (static)
netlify/edge-functions/generate.js streams AI output from the OpenAI Responses API
netlify.toml                       publish folder = public
```

## Deploy (Git — recommended)
1. Push this folder to a GitHub repo.
2. Netlify → **Add new project → Import an existing project** → pick the repo.
   Build command: *(leave empty)* · Publish directory: `public`
3. **Site configuration → Environment variables → Add**:
   - Name: `OPENAI_API_KEY`
   - Value: your API key from https://platform.openai.com/api-keys
4. **Deploys → Trigger deploy**. Open the site and generate.

## Deploy (CLI)
```bash
npm i -g netlify-cli
netlify login
cd siteforge-netlify
netlify init
netlify env:set OPENAI_API_KEY
netlify deploy --prod
```

Local test: `netlify dev` → http://localhost:8888

> Drag-and-drop deploy (app.netlify.com/drop) does **not** deploy edge functions — use Git or CLI.

## Optional environment variables
- `OPENAI_MODEL` (default: `gpt-5-mini`; set this to another model enabled for your API project if desired)
- `MAX_OUTPUT_TOKENS` (default: `16000`)

## Cost / abuse
Each generation uses your OpenAI API credits. Set a monthly usage budget/limit in the OpenAI Platform, and consider Netlify rate limiting or password protection before sharing the URL publicly.
