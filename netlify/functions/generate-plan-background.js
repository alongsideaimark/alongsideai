// Background function — fires after a questionnaire submission and does the
// slow work: calls Claude, renders the HTML, stores the plan, converts to PDF,
// and emails the plan directly to the customer. Also notifies Mark.
// "-background" suffix gives this function a 15-minute timeout.
//
// Triggered by submission-created.js via a fetch POST. Not invoked directly by
// Netlify Forms — that's submission-created's job.

const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");
const { buildAiBriefing } = require("../lib/briefing");
const { draftPlan } = require("../lib/call-claude");
const { renderPlan } = require("../lib/render-plan");

const INTERNAL_FROM = "Alongside AI <intake@alongsideai.ai>";
const INTERNAL_TO = "mark@alongsideai.ai";
const CUSTOMER_FROM = "Mark <mark@alongsideai.ai>";
const CUSTOMER_REPLY_TO = "mark@alongsideai.ai";
const PDFSHIFT_URL = "https://api.pdfshift.io/v3/convert/pdf";

async function convertToPdf({ url, apiKey }) {
  const auth = "Basic " + Buffer.from(`api:${apiKey}`).toString("base64");
  const res = await fetch(PDFSHIFT_URL, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: url,
      sandbox: false,
      format: "Letter",
      margin: "18mm",
      use_print: true,
      delay: 3000,
      wait_for: ".doc-foot",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PDFShift ${res.status}: ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function emailCustomer({ apiKey, firstName, toEmail, pdfBuffer }) {
  const subject = `Your plan — ${firstName}`;
  const text =
`${firstName},

Your plan's attached. Read it at your own pace — there's no rush.

A few things to know:

It's yours to keep, whether you decide to act on any of it or not. Every recommendation is grounded in what you wrote on the questionnaire; if something doesn't fit, trust your read over ours and skip it.

Section 05 has a custom tool we designed just for you — it's the most personal part of the plan. If you try building it and get stuck, reply to this email and I'll help.

If something in the plan is wrong, or if there's a part that doesn't make sense, same deal — reply to this email. It comes straight to me.

— Mark
Alongside AI`;

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">${firstName},</p>
    <p style="margin:0 0 18px;">Your plan's attached. Read it at your own pace — there's no rush.</p>
    <p style="margin:0 0 18px;">It's yours to keep, whether you decide to act on any of it or not. Every recommendation is grounded in what you wrote on the questionnaire; if something doesn't fit, trust your read over ours and skip it.</p>
    <p style="margin:0 0 18px;">Section 05 has a custom tool we designed just for you — it's the most personal part of the plan. If you try building it and get stuck, reply to this email and I'll help.</p>
    <p style="margin:0 0 18px;">If something in the plan is wrong, or if there's a part that doesn't make sense, same deal — reply to this email. It comes straight to me.</p>
    <p style="margin:32px 0 0;">— Mark<br/><span style="color:#7A8B6F;">Alongside AI</span></p>
  </div>
</body></html>`;

  const body = {
    from: CUSTOMER_FROM,
    to: [toEmail],
    reply_to: CUSTOMER_REPLY_TO,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `Alongside-AI-plan-${firstName}.pdf`,
        content: pdfBuffer.toString("base64"),
      },
    ],
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend ${res.status}: ${errBody}`);
  }
}

function newPlanId() {
  return crypto.randomBytes(9).toString("base64url");
}

async function sendNotificationEmail({ apiKey, firstName, email, planUrl, usage, sent }) {
  const subject = sent
    ? `Plan sent to ${firstName}`
    : `Plan draft ready — ${firstName}`;
  const cost = usage && usage.input_tokens
    ? `${usage.input_tokens} in / ${usage.output_tokens} out (cached: ${usage.cache_read_input_tokens || 0})`
    : "—";

  const statusLine = sent
    ? `Plan was auto-sent to ${firstName}${email ? ` (${email})` : ""}.`
    : `A plan was generated for ${firstName}${email ? ` (${email})` : ""} but could not be auto-sent.`;
  const actionLine = sent
    ? "Open the link to see what was sent."
    : "Open the link to review, then send manually.";
  const btnLabel = sent ? "View the plan" : "Open the draft";

  const text =
`${statusLine}

View: ${planUrl}

${actionLine}

Tokens: ${cost}`;

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">${statusLine}</p>
    <p style="margin:0 0 24px;">
      <a href="${planUrl}" style="display:inline-block;padding:12px 20px;background:#7A8B6F;color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;">${btnLabel}</a>
    </p>
    <p style="margin:0 0 18px;color:#4A5550;">${actionLine}</p>
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

    // Netlify doesn't auto-initialize the Blobs environment for background
    // functions invoked programmatically via fetch (as opposed to direct HTTP
    // requests from a browser). This call wires it up manually.
    connectLambda(event);

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

    const { plan, usage, searchCount } = await draftPlan({ briefing, apiKey: anthropicKey });
    console.log(`[generate-plan] draft returned; web searches: ${searchCount || 0}; tokens:`, JSON.stringify(usage));

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

    const baseUrl = process.env.URL || "https://alongsideai.ai";
    const planUrl = `${baseUrl}/plans/${id}`;
    const pdfshiftKey = process.env.PDFSHIFT_API_KEY;

    // Auto-send: convert to PDF and email the customer directly.
    if (email && pdfshiftKey && resendKey) {
      console.log("[generate-plan] converting to PDF:", planUrl);
      const pdf = await convertToPdf({ url: planUrl, apiKey: pdfshiftKey });
      console.log("[generate-plan] PDF size:", pdf.length, "bytes");

      await emailCustomer({
        apiKey: resendKey,
        firstName,
        toEmail: email,
        pdfBuffer: pdf,
      });
      console.log("[generate-plan] sent to", email);

      record.status = "sent";
      record.sent_at = new Date().toISOString();
      await store.set(`${id}.json`, JSON.stringify(record));
    } else {
      console.warn("[generate-plan] skipping auto-send —", !email ? "no email" : !pdfshiftKey ? "no PDFSHIFT_API_KEY" : "no RESEND_API_KEY");
    }

    // Notify Mark.
    if (resendKey) {
      await sendNotificationEmail({ apiKey: resendKey, firstName, email, planUrl, usage, sent: record.status === "sent" });
      console.log("[generate-plan] notification sent to Mark");
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, id, planUrl, sent: record.status === "sent" }) };
  } catch (err) {
    console.error("[generate-plan] failed:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
