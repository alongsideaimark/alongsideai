// Manual retry endpoint for dead-lettered plan generations.
// Mark clicks the link in the failure email; this function re-runs the full
// generation pipeline against the stored briefing and cleans up on success.
//
// Auth: query-param secret must match the RETRY_SECRET env var.
// Not customer-facing — operator-only safety net.

const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");
const { draftPlan } = require("../lib/call-claude");
const { renderPlan } = require("../lib/render-plan");
const { critique } = require("../lib/critique-plan");
const { convertToPdf, archivePdf } = require("../lib/pdf");

const INTERNAL_FROM = "Alongside AI <intake@alongsideai.ai>";
const INTERNAL_TO = "mark@alongsideai.ai";
const CUSTOMER_FROM = "Mark <mark@alongsideai.ai>";
const CUSTOMER_REPLY_TO = "mark@alongsideai.ai";

function newPlanId() {
  return crypto.randomBytes(9).toString("base64url");
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

exports.handler = async (event) => {
  try {
    connectLambda(event);

    const params = event.queryStringParameters || {};
    const dlId = params.id;
    const secret = params.secret;
    const retrySecret = process.env.RETRY_SECRET;

    if (!retrySecret) {
      return { statusCode: 500, body: "RETRY_SECRET not configured" };
    }
    if (!secret || secret !== retrySecret) {
      return { statusCode: 403, body: "forbidden" };
    }
    if (!dlId) {
      return { statusCode: 400, body: "missing id parameter" };
    }

    const dlStore = getStore("dead-letters");
    const raw = await dlStore.get(`${dlId}.json`);
    if (!raw) {
      return { statusCode: 404, body: "dead-letter record not found (already retried?)" };
    }

    const dl = JSON.parse(raw);
    const firstName = dl.customer_first_name || "there";
    const email = dl.customer_email || "";
    const briefing = dl.briefing;
    const data = dl.submission_data || {};

    if (!briefing) {
      return { statusCode: 400, body: "dead-letter record has no briefing" };
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!anthropicKey) {
      return { statusCode: 500, body: "ANTHROPIC_API_KEY not set" };
    }

    console.log(`[retry-plan] retrying dead-letter ${dlId} for ${firstName}`);

    const { plan, usage, searchCount } = await draftPlan({ briefing, apiKey: anthropicKey });
    console.log(`[retry-plan] draft returned; web searches: ${searchCount || 0}; tokens:`, JSON.stringify(usage));

    if (plan && plan.insufficient_input) {
      console.warn(`[retry-plan] insufficient input for ${firstName} on retry`);
      return {
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: `<h2>Retry completed — but Claude says the briefing is too thin</h2><p>Missing: ${escapeHtml(JSON.stringify(plan.missing))}</p><p>Dead-letter record preserved for re-inspection.</p>`,
      };
    }

    const html = renderPlan(plan);

    const { hardFails, softFails, layer2 } = await critique({ plan, briefing, apiKey: anthropicKey });
    const hasHardFails = hardFails.length > 0;

    const id = newPlanId();
    const record = {
      id,
      created_at: new Date().toISOString(),
      status: hasHardFails ? "needs_review" : "draft",
      customer_first_name: firstName,
      customer_email: email,
      submission: data,
      briefing,
      plan,
      html,
      usage,
      critique: { hardFails, softFails, layer2 },
      retried_from_dead_letter: dlId,
    };

    const store = getStore("plans");
    await store.set(`${id}.json`, JSON.stringify(record));
    console.log(`[retry-plan] stored plan ${id} from dead-letter ${dlId}`);

    const isTest = data._test === true || data._test === "true";
    const baseUrl = process.env.URL || "https://alongsideai.ai";
    const planUrl = `${baseUrl}/plans/${id}`;

    if (isTest) {
      record.status = "sent";
      record.sent_at = new Date().toISOString();
      record.test = true;
      await store.set(`${id}.json`, JSON.stringify(record));
    } else if (!hasHardFails && email && resendKey) {
      const revisionToken = crypto.randomBytes(24).toString("base64url");
      const revisionWindowDays = 14;

      const customerEmailBody = buildCustomerEmail({ firstName, email, planUrl, revisionUrl: `${baseUrl}/revise/${revisionToken}` });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerEmailBody),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[retry-plan] customer email failed: Resend ${res.status}: ${errBody}`);
      } else {
        console.log(`[retry-plan] sent plan to ${email}`);
        record.status = "sent";
        record.sent_at = new Date().toISOString();
        record.revision_token = revisionToken;
        record.customer_revisions_remaining = 2;
        record.revision_window_expires_at = new Date(Date.now() + revisionWindowDays * 24 * 60 * 60 * 1000).toISOString();
        record.customer_revisions = [];
        await store.set(`${id}.json`, JSON.stringify(record));
      }
    }

    const pdfshiftKey = process.env.PDFSHIFT_API_KEY;
    if (pdfshiftKey) {
      try {
        const pdf = await convertToPdf({ url: planUrl, apiKey: pdfshiftKey });
        await archivePdf(store, id, pdf);
      } catch (pdfErr) {
        console.error(`[retry-plan] pdf archival failed (non-fatal): ${pdfErr.message}`);
      }
    }

    if (resendKey) {
      try {
        await sendRetryNotification({ apiKey: resendKey, firstName, email, planUrl, usage, sent: record.status === "sent", hasHardFails, dlId });
      } catch (notifErr) {
        console.error(`[retry-plan] notification failed: ${notifErr.message}`);
      }
    }

    await dlStore.delete(`${dlId}.json`);
    console.log(`[retry-plan] deleted dead-letter ${dlId}`);

    return {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: `<h2>Retry succeeded</h2><p>Plan for ${escapeHtml(firstName)} generated and stored.</p><p><a href="${planUrl}">View the plan</a></p><p>${record.status === "sent" ? "Customer email sent." : hasHardFails ? "Critic flagged hard issues — customer email NOT sent." : "Customer email not sent (no email or Resend key)."}</p>`,
    };
  } catch (err) {
    console.error("[retry-plan] failed:", err.stack || err.message);

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const params = event.queryStringParameters || {};
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: INTERNAL_FROM,
            to: [INTERNAL_TO],
            subject: `AAI: retry also failed — dead-letter ${params.id || "unknown"}`,
            text: `Retry of dead-letter ${params.id || "unknown"} failed.\n\nError: ${err.message}\n\nDead-letter record preserved — you can try again later.`,
            html: `<p>Retry of dead-letter <code>${escapeHtml(params.id || "unknown")}</code> failed.</p><p><strong>Error:</strong> ${escapeHtml(err.message)}</p><p>Dead-letter record preserved — you can try again later.</p>`,
          }),
        });
      } catch (_) { /* best-effort */ }
    }

    return { statusCode: 500, body: `retry failed: ${err.message}` };
  }
};

function buildCustomerEmail({ firstName, email, planUrl, revisionUrl }) {
  return {
    from: CUSTOMER_FROM,
    to: [email],
    reply_to: CUSTOMER_REPLY_TO,
    subject: `Your plan is ready — ${firstName}`,
    text:
`${firstName},

Your plan is ready. Open the link below to read it — there's no rush.

${planUrl}

A few things to know:

It's yours to keep, whether you decide to act on any of it or not. Every recommendation is grounded in what you wrote on the questionnaire; if something doesn't fit, trust your read over ours and skip it.

Section 05 has a custom tool we designed just for you — it's the most personal part of the plan. If you try building it and get stuck, reply to this email and I'll help.

There's a "Print / Save as PDF" button at the top of the page if you'd like a copy on your computer.

If something in the plan is wrong — a tool you already use that we didn't account for, a budget that should be different, a detail you forgot to mention — you can revise it. Click the link below, tell us what to change, and we'll send you an updated plan:

${revisionUrl}

You have two free revisions available for the next 14 days.

— Mark
Alongside AI`,
    html:
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">${firstName},</p>
    <p style="margin:0 0 18px;">Your plan is ready. Read it at your own pace — there's no rush.</p>
    <p style="margin:0 0 24px;">
      <a href="${planUrl}" style="display:inline-block;padding:14px 24px;background:#7A8B6F;color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Open your plan</a>
    </p>
    <p style="margin:0 0 18px;">It's yours to keep, whether you decide to act on any of it or not. Every recommendation is grounded in what you wrote on the questionnaire; if something doesn't fit, trust your read over ours and skip it.</p>
    <p style="margin:0 0 18px;">Section 05 has a custom tool we designed just for you — it's the most personal part of the plan. If you try building it and get stuck, reply to this email and I'll help.</p>
    <p style="margin:0 0 18px;">There's a "Print / Save as PDF" button at the top if you'd like a copy on your computer.</p>
    <p style="margin:0 0 18px;">If something in the plan is wrong — a tool you already use that we didn't account for, a budget that should be different, a detail you forgot to mention — you can revise it:</p>
    <p style="margin:0 0 24px;">
      <a href="${revisionUrl}" style="display:inline-block;padding:14px 24px;background:#9E7B84;color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Revise your plan</a>
    </p>
    <p style="margin:0 0 18px;color:#8A8780;font-size:14px;">Two free revisions available for the next 14 days.</p>
    <p style="margin:32px 0 0;">— Mark<br/><span style="color:#7A8B6F;">Alongside AI</span></p>
  </div>
</body></html>`,
  };
}

async function sendRetryNotification({ apiKey, firstName, email, planUrl, usage, sent, hasHardFails, dlId }) {
  const subject = hasHardFails
    ? `Retry needs review — ${firstName} (from dead-letter ${dlId})`
    : sent
      ? `Retry succeeded — plan sent to ${firstName}`
      : `Retry succeeded — plan ready for ${firstName}`;

  const cost = usage && usage.input_tokens
    ? `${usage.input_tokens} in / ${usage.output_tokens} out`
    : "—";

  const text =
`Dead-letter ${dlId} retried successfully.

Plan for ${firstName}${email ? ` (${email})` : ""}: ${planUrl}

${sent ? "Customer email sent." : hasHardFails ? "Critic flagged hard issues — customer email NOT sent." : "Customer email not sent."}

Tokens: ${cost}`;

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">Dead-letter <code>${escapeHtml(dlId)}</code> retried successfully.</p>
    <p style="margin:0 0 24px;">
      <a href="${planUrl}" style="display:inline-block;padding:12px 20px;background:#7A8B6F;color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;">View the plan</a>
    </p>
    <p style="margin:0 0 18px;color:#4A5550;">${sent ? "Customer email sent." : hasHardFails ? "Critic flagged hard issues — customer email NOT sent. Review before sending manually." : "Customer email not sent."}</p>
    <p style="margin:0;font-size:12px;color:#8A8780;">Tokens: ${cost}</p>
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
