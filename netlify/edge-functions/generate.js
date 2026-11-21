// SiteForge — Netlify Edge Function
// Proxies website-generation prompts to the OpenAI Responses API and streams plain text.
// Keep the API key on the server; never expose it in public/index.html.
//
// Required Netlify environment variable:
//   OPENAI_API_KEY
// Optional:
//   OPENAI_MODEL          defaults to gpt-5-mini
//   MAX_OUTPUT_TOKENS     defaults to 16000

const MAX_PROMPT_CHARS = 120_000;

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({
      error: "Server is missing OPENAI_API_KEY. Add it in Netlify → Environment variables, then redeploy."
    }, 500);
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

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Netlify.env.get("OPENAI_MODEL") || "gpt-5-mini",
        input: prompt,
        max_output_tokens: Number(Netlify.env.get("MAX_OUTPUT_TOKENS")) || 16000,
        stream: true,
      }),
      signal: request.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return json({ error: error?.message || "Could not connect to OpenAI." }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    let message = `OpenAI API error (${upstream.status})`;
    try {
      const payload = await upstream.json();
      if (payload?.error?.message) message = payload.error.message;
    } catch {}
    return json({ error: message }, upstream.status === 429 ? 429 : 502);
  }

  // Convert OpenAI Responses API SSE events into the plain-text stream
  // expected by public/index.html. Preserve the existing sentinel protocol.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) continue;

            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;

            let event;
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }

            if (event.type === "response.output_text.delta" && event.delta) {
              controller.enqueue(encoder.encode(event.delta));
            } else if (event.type === "response.incomplete") {
              const reason = event.response?.incomplete_details?.reason;
              if (reason === "max_output_tokens") {
                controller.enqueue(encoder.encode("\u0000TRUNC"));
              }
            } else if (event.type === "error" || event.type === "response.failed") {
              const message = event.message || event.error?.message ||
                event.response?.error?.message || "OpenAI generation failed";
              controller.enqueue(encoder.encode("\u0000ERR:" + message));
            }
          }
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          controller.enqueue(encoder.encode("\u0000ERR:" + (error?.message || "Stream interrupted")));
        }
      } finally {
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { path: "/api/generate" };
