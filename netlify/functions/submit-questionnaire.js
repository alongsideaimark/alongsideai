// Backup submission endpoint. The primary path is Netlify Forms (POST to /
// with form-name=questionnaire). When that path fails — content blockers,
// network middleboxes, mobile carriers returning synthetic 200s — the
// questionnaire falls back to this endpoint, which forwards directly to the
// submission-created handler in-process. Bypasses the Netlify Forms layer
// entirely so blockers with rules against form-handler URLs don't apply.

const crypto = require("crypto");
const submissionCreated = require("./submission-created.js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "invalid JSON" };
  }

  // Honeypot — pretend success to bots so they don't retry.
  if (data["bot-field"]) {
    console.warn("[submit-questionnaire] honeypot triggered, dropping silently");
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // Minimal sanity check: must have at least a name. Real submissions always do.
  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    return { statusCode: 400, body: "missing name" };
  }

  // Forward to submission-created in the Netlify Forms event shape it expects.
  // Spread the original event so Netlify context (headers, blob token, etc.)
  // propagates — only override the body with the Forms-shaped payload.
  const wrappedEvent = {
    ...event,
    body: JSON.stringify({
      payload: {
        id: `direct_${crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16)}`,
        form_name: "questionnaire",
        data,
        created_at: new Date().toISOString(),
      },
    }),
  };

  console.log("[submit-questionnaire] forwarding to submission-created for", data.name);
  const result = await submissionCreated.handler(wrappedEvent);
  return {
    statusCode: result.statusCode || 200,
    body: JSON.stringify({ ok: true, forwarded: true }),
  };
};
