// Background function — fires after a questionnaire submission and does the
// slow work: calls Claude, renders the HTML, stores the draft, and emails Mark
// a preview link. "-background" suffix gives this function a 15-minute timeout
// instead of the regular 26-second limit.
//
// Triggered by submission-created.js via a fetch POST. Not invoked directly by
// Netlify Forms — that's submission-created's job.

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const { buildAiBriefing } = require("../lib/briefing");
const { draftPlan } = require("../lib/call-claude");
const { renderPlan } = require("../lib/render-plan");

const INTERNAL_FROM = "Alongside AI <intake@alongsideai.ai>";
const INTERNAL_TO = "mark@alongsideai.ai";

function newPlanId() {
  return crypto.randomBytes(9).toString("base64url");
}

async function sendPreviewEmail({ apiKey, firstName, email, previewUrl, usage }) {
  const subject = `Plan draft ready — ${firstName}`;
  const cost = usage && usage.input_tokens
    ? `${usage.input_tokens} in / ${usage.output_tokens} out (cached: ${usage.cache_read_input_tokens || 0})`
    : "—";

  const text =
`A plan draft is ready for ${firstName}${email ? ` (${email})` : ""}.

Preview: ${previewUrl}

Open the link, read it through, edit what needs fixing, then approve to send.

Tokens: ${cost}`;

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">A plan draft is ready for <strong>${firstName}</strong>${email ? ` (${email})` : ""}.</p>
    <p style="margin:0 0 24px;">
      <a href="${previewUrl}" style="display:inline-block;padding:12px 20px;background:#7A8B6F;color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;">Open the draft</a>
    </p>
    <p style="margin:0 0 18px;color:#4A5550;">Read it through, edit anything that needs fixing, then approve to send it to the customer as a PDF.</p>
    <p style="margin:32px 0 0;font-size:12px;color:#8A8780;">Tokens used: ${cost}</p>
  </div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: INTERNAL_FROM,
      to: [INTERNAL_TO],
      reply_to: email || INTERNAL_TO,
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method not allowed" };
    }

    const payload = JSON.parse(event.body || "{}");
    const data = payload.data || {};
    const firstName = payload.firstName || String(data.name || "").trim().split(/\s+/)[0] || "there";
    const email = String(data.contact || "").trim();

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!anthropicKey) {
      console.error("[generate-plan] ANTHROPIC_API_KEY not set");
      return { statusCode: 500, body: "no anthropic key" };
    }

    // Build the briefing block and ask Claude to draft.
    const briefing = buildAiBriefing(firstName, data);
    console.log("[generate-plan] drafting for", firstName, "email:", email || "(none)");

    const { plan, usage } = await draftPlan({ briefing, apiKey: anthropicKey });
    console.log("[generate-plan] draft returned; tokens:", JSON.stringify(usage));

    // Render to final HTML.
    const html = renderPlan(plan);

    // Store in Netlify Blobs so we can serve it to Mark (and later to the customer).
    const id = newPlanId();
    const record = {
      id,
      created_at: new Date().toISOString(),
      status: "draft",
      customer_first_name: firstName,
      customer_email: email,
      submission: data,
      briefing,
      plan,
      html,
      usage,
    };

    const store = getStore("plans");
    await store.set(`${id}.json`, JSON.stringify(record));
    console.log("[generate-plan] stored plan", id);

    // Email Mark the preview link.
    const baseUrl = process.env.URL || "https://alongsideai.ai";
    const previewUrl = `${baseUrl}/plans/${id}`;
    if (resendKey) {
      await sendPreviewEmail({ apiKey: resendKey, firstName, email, previewUrl, usage });
      console.log("[generate-plan] preview email sent to Mark");
    } else {
      console.warn("[generate-plan] RESEND_API_KEY missing; skipping preview email");
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, id, previewUrl }) };
  } catch (err) {
    console.error("[generate-plan] failed:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
