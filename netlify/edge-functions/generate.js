// SiteForge — Netlify Edge Function
// Proxies prompts to the Anthropic API and streams plain text back to the browser.
// Edge Functions keep streaming after the first byte, so long generations don't time out.
//
// Required env var (Netlify → Site configuration → Environment variables):
//   ANTHROPIC_API_KEY   your key from console.anthropic.com
// Optional:
//   MODEL               defaults to claude-sonnet-5-5
//   MAX_TOKENS          defaults to 16000

const MAX_PROMPT_CHARS = 120_000;

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Netlify → Environment variables, then redeploy." }, 500);
  }

  let prompt;
  try {
    ({ prompt } = await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return json({ error: "Prompt is required" }, 400);
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return json({ error: "Prompt is too long" }, 413);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Netlify.env.get("MODEL") || "claude-sonnet-5-5",
      max_tokens: Number(Netlify.env.get("MAX_TOKENS")) || 16000,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    let msg = `AI provider error (${upstream.status})`;
    try {
      const j = await upstream.json();
      if (j?.error?.message) msg = j.error.message;
    } catch {}
    return json({ error: msg }, upstream.status === 429 ? 429 : 502);
  }

  // Convert Anthropic SSE events into a plain text stream.
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) > -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            let evt;
            try { evt = JSON.parse(line.slice(5)); } catch { continue; }
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              controller.enqueue(enc.encode(evt.delta.text));
            } else if (evt.type === "message_delta" && evt.delta?.stop_reason === "max_tokens") {
              controller.enqueue(enc.encode("\u0000TRUNC"));
            } else if (evt.type === "error") {
              controller.enqueue(enc.encode("\u0000ERR:" + (evt.error?.message || "Generation failed")));
            }
          }
        }
      } catch (e) {
        controller.enqueue(enc.encode("\u0000ERR:" + (e?.message || "Stream interrupted")));
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config = { path: "/api/generate" };
