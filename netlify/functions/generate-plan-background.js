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
const { draftPlan, ClaudeUnavailableError } = require("../lib/call-claude");
const { renderPlan } = require("../lib/render-plan");
const { critique } = require("../lib/critique-plan");
const { convertToPdf, archivePdf } = require("../lib/pdf");

const INTERNAL_FROM = "Lantern Plan <intake@lanternplan.com>";
const INTERNAL_TO = "mark@lanternplan.com";
const CUSTOMER_FROM = "Mark <mark@lanternplan.com>";
const CUSTOMER_REPLY_TO = "mark@lanternplan.com";

async function emailCustomer({ apiKey, firstName, toEmail, planUrl, revisionUrl }) {
  const subject = `Your plan is ready — ${firstName}`;
  const text =
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
Lantern Plan`;

  const html =
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
    <p style="margin:32px 0 0;">— Mark<br/><span style="color:#7A8B6F;">Lantern Plan</span></p>
  </div>
</body></html>`;

  const body = {
    from: CUSTOMER_FROM,
    to: [toEmail],
    reply_to: CUSTOMER_REPLY_TO,
    subject,
    text,
    html,
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

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatIssuesText(issues) {
  if (!issues || !issues.length) return "";
  return issues.map((i) => `  • [${i.rule}] ${i.path} — ${i.detail}`).join("\n");
}

function formatIssuesHtml(issues) {
  if (!issues || !issues.length) return "";
  const items = issues.map((i) =>
    `<li style="margin-bottom:8px;"><code style="background:#F3EDE3;padding:2px 6px;border-radius:4px;font-size:13px;">${escapeHtml(i.rule)}</code> <span style="color:#8A8780;">${escapeHtml(i.path)}</span><br/><span style="color:#4A5550;">${escapeHtml(i.detail)}</span></li>`
  ).join("");
  return `<ul style="padding-left:20px;margin:0 0 18px;">${items}</ul>`;
}

async function sendNotificationEmail({ apiKey, firstName, email, planUrl, usage, sent, hardFails, softFails, layer2 }) {
  const hasHardFails = Array.isArray(hardFails) && hardFails.length > 0;
  const hasSoftFails = Array.isArray(softFails) && softFails.length > 0;

  const subject = hasHardFails
    ? `⚠ Plan needs review — ${firstName}`
    : sent
      ? hasSoftFails
        ? `Plan sent to ${firstName} — soft issues to spot-check`
        : `Plan sent to ${firstName}`
      : `Plan draft ready — ${firstName}`;

  const cost = usage && usage.input_tokens
    ? `${usage.input_tokens} in / ${usage.output_tokens} out (cached: ${usage.cache_read_input_tokens || 0})`
    : "—";

  const statusLine = hasHardFails
    ? `Plan for ${firstName}${email ? ` (${email})` : ""} did NOT auto-send — critic flagged hard issues. Review before sending manually.`
    : sent
      ? `Plan was auto-sent to ${firstName}${email ? ` (${email})` : ""}.`
      : `A plan was generated for ${firstName}${email ? ` (${email})` : ""} but could not be auto-sent.`;
  const actionLine = hasHardFails
    ? "Open the link to review the plan and the issues below."
    : sent
      ? hasSoftFails
        ? "Auto-sent. Soft issues below — spot-check on your own time."
        : "Open the link to see what was sent."
      : "Open the link to review, then send manually.";
  const btnLabel = hasHardFails ? "Review draft" : sent ? "View the plan" : "Open the draft";

  const issuesTextBlock = (hasHardFails || hasSoftFails)
    ? `\n\n${hasHardFails ? `HARD ISSUES (blocked customer send):\n${formatIssuesText(hardFails)}\n` : ""}${hasSoftFails ? `\nSOFT ISSUES (spot-check):\n${formatIssuesText(softFails)}\n` : ""}`
    : "";

  const layer2TextLine = layer2
    ? `\nCritic: ${layer2.verdict} (${layer2.score}/10, confidence ${layer2.confidence}). ${layer2.summary}`
    : "";

  const text =
`${statusLine}${layer2TextLine}

View: ${planUrl}

${actionLine}${issuesTextBlock}

Tokens: ${cost}`;

  const issuesHtmlBlock = (hasHardFails || hasSoftFails)
    ? `${hasHardFails ? `<div style="margin:24px 0 8px;font-size:13px;font-weight:600;color:#9E4444;">Hard issues (blocked customer send):</div>${formatIssuesHtml(hardFails)}` : ""}${hasSoftFails ? `<div style="margin:${hasHardFails ? '20' : '24'}px 0 8px;font-size:13px;font-weight:600;color:#A07A2C;">Soft issues (spot-check):</div>${formatIssuesHtml(softFails)}` : ""}`
    : "";

  const layer2HtmlLine = layer2
    ? `<div style="margin:0 0 18px;padding:10px 14px;background:#F3EDE3;border-radius:8px;font-size:13px;color:#4A5550;"><strong>Critic:</strong> ${escapeHtml(layer2.verdict)} (${layer2.score}/10, confidence ${layer2.confidence}). ${escapeHtml(layer2.summary || "")}</div>`
    : "";

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">${statusLine}</p>
    ${layer2HtmlLine}
    <p style="margin:0 0 24px;">
      <a href="${planUrl}" style="display:inline-block;padding:12px 20px;background:${hasHardFails ? '#9E4444' : '#7A8B6F'};color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;">${btnLabel}</a>
    </p>
    <p style="margin:0 0 18px;color:#4A5550;">${actionLine}</p>
    ${issuesHtmlBlock}
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

async function sendDeadLetterEmail({ apiKey, firstName, email, errorType, errorMessage, retryUrl, briefing }) {
  const subject = "LP: plan generation failed — manual retry needed";

  const text =
`Plan generation failed for ${firstName}${email ? ` (${email})` : ""}.

Error: ${errorType} — ${errorMessage}

Retry: ${retryUrl}

--- BRIEFING ---

${briefing}`;

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">Plan generation failed for <strong>${escapeHtml(firstName)}</strong>${email ? ` (<a href="mailto:${escapeHtml(email)}" style="color:#4A5550;">${escapeHtml(email)}</a>)` : ""}.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#9E4444;"><strong>Error:</strong> ${escapeHtml(errorType)}</p>
    <p style="margin:0 0 24px;font-size:14px;color:#4A5550;">${escapeHtml(errorMessage)}</p>
    <p style="margin:0 0 24px;">
      <a href="${retryUrl}" style="display:inline-block;padding:12px 20px;background:#9E4444;color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;">Retry plan generation</a>
    </p>
    <div style="margin:24px 0 8px;font-size:13px;font-weight:600;color:#4A5550;">Briefing</div>
    <pre style="white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;background:#F3EDE3;color:#2C3330;border-radius:10px;padding:18px 20px;margin:0;">${escapeHtml(briefing)}</pre>
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

    // Gate: don't burn Claude credits on empty or near-empty submissions.
    // A real questionnaire fills in at least work, friction, and wish.
    const requiredFields = ["work", "friction", "wish"];
    const filledCount = requiredFields.filter((f) => String(data[f] || "").trim().length > 10).length;
    if (filledCount < 2) {
      console.warn(`[generate-plan] skipping — only ${filledCount}/${requiredFields.length} required fields filled for ${firstName}`);
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "incomplete submission" }) };
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!anthropicKey) {
      console.error("[generate-plan] ANTHROPIC_API_KEY not set");
      return { statusCode: 500, body: "no anthropic key" };
    }

    // Build the briefing block and ask Claude to draft.
    const briefing = buildAiBriefing(firstName, data);
    console.log("[generate-plan] drafting for", firstName, "email:", email || "(none)");

    let plan, usage, searchCount;
    try {
      ({ plan, usage, searchCount } = await draftPlan({ briefing, apiKey: anthropicKey }));
    } catch (err) {
      if (!(err instanceof ClaudeUnavailableError)) throw err;

      const dlId = crypto.randomBytes(9).toString("base64url");
      const retrySecret = process.env.RETRY_SECRET;
      const baseUrl = process.env.URL || "https://lanternplan.com";
      const retryUrl = retrySecret
        ? `${baseUrl}/.netlify/functions/retry-plan-background?id=${dlId}&secret=${retrySecret}`
        : "(RETRY_SECRET not configured)";

      const dlStore = getStore("dead-letters");
      await dlStore.set(`${dlId}.json`, JSON.stringify({
        submission_id: dlId,
        briefing,
        customer_first_name: firstName,
        customer_email: email,
        submission_data: data,
        error_type: err.name,
        error_message: err.message,
        attempts: err.attempts,
        failed_at: new Date().toISOString(),
        retry_url: retryUrl,
      }));
      console.error(`[generate-plan] dead-lettered ${dlId} for ${firstName}: ${err.message}`);

      if (resendKey) {
        try {
          await sendDeadLetterEmail({
            apiKey: resendKey,
            firstName,
            email,
            errorType: err.name,
            errorMessage: err.message,
            retryUrl,
            briefing,
          });
          console.log("[generate-plan] dead-letter notification sent to Mark");
        } catch (emailErr) {
          console.error("[generate-plan] dead-letter email failed:", emailErr.message);
        }
      }

      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "dead_lettered", id: dlId }) };
    }
    console.log(`[generate-plan] draft returned; web searches: ${searchCount || 0}; tokens:`, JSON.stringify(usage));

    // If Claude decided the briefing was too thin for a real plan, notify Mark
    // instead of rendering a placeholder.
    if (plan && plan.insufficient_input) {
      console.warn(`[generate-plan] insufficient input for ${firstName}: ${JSON.stringify(plan.missing)}`);
      if (resendKey) {
        await sendNotificationEmail({
          apiKey: resendKey,
          firstName,
          email,
          planUrl: "(briefing too thin — no plan generated)",
          usage,
          sent: false,
        });
      }
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "insufficient_input", missing: plan.missing }) };
    }

    // Render to final HTML.
    const html = renderPlan(plan);

    // Critic pass — Layer 1 (deterministic rules) + Layer 2 (LLM critic via
    // Haiku, ~$0.01 per plan). Hard fails block the customer email and route
    // to Mark for manual review. Soft fails ship to the customer but flag the
    // internal notification for spot-checking. Layer 2 only runs if Layer 1
    // was clean, and Layer 2 failures degrade gracefully (Layer 1 verdict
    // stands). See netlify/lib/critique-plan.js for the full rubric.
    const { hardFails, softFails, layer2 } = await critique({ plan, briefing, apiKey: anthropicKey });
    const hasHardFails = hardFails.length > 0;
    if (hasHardFails) {
      console.warn(`[generate-plan] critic flagged ${hardFails.length} hard issue(s) for ${firstName}:`, hardFails.map((i) => `${i.rule}@${i.path}`).join(", "));
    }
    if (softFails.length > 0) {
      console.log(`[generate-plan] critic flagged ${softFails.length} soft issue(s) for ${firstName}:`, softFails.map((i) => `${i.rule}@${i.path}`).join(", "));
    }
    if (layer2) {
      console.log(`[generate-plan] LLM critic: verdict=${layer2.verdict} score=${layer2.score}/10 confidence=${layer2.confidence}`);
    }

    // Store in Netlify Blobs so we can serve it to Mark (and later to the customer).
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
    };

    const store = getStore("plans");
    await store.set(`${id}.json`, JSON.stringify(record));
    console.log("[generate-plan] stored plan", id, "status:", record.status);

    const isTest = data._test === true || data._test === "true";
    const baseUrl = process.env.URL || "https://lanternplan.com";
    const planUrl = `${baseUrl}/plans/${id}`;

    // Auto-send to customer ONLY if no hard fails and not a test submission.
    if (isTest) {
      console.log("[generate-plan] test submission — skipping customer email");
      record.status = "sent";
      record.sent_at = new Date().toISOString();
      record.test = true;
      await store.set(`${id}.json`, JSON.stringify(record));
    } else if (!hasHardFails && email && resendKey) {
      const revisionToken = crypto.randomBytes(24).toString("base64url");
      const revisionWindowDays = 14;

      await emailCustomer({
        apiKey: resendKey,
        firstName,
        toEmail: email,
        planUrl,
        revisionUrl: `${baseUrl}/revise/${revisionToken}`,
      });
      console.log("[generate-plan] sent to", email);

      record.status = "sent";
      record.sent_at = new Date().toISOString();
      record.revision_token = revisionToken;
      record.customer_revisions_remaining = 2;
      record.revision_window_expires_at = new Date(Date.now() + revisionWindowDays * 24 * 60 * 60 * 1000).toISOString();
      record.customer_revisions = [];
      await store.set(`${id}.json`, JSON.stringify(record));
    } else if (hasHardFails) {
      console.warn("[generate-plan] customer send blocked by critic — manual review required");
    } else {
      console.warn("[generate-plan] skipping auto-send —", !email ? "no email" : "no RESEND_API_KEY");
    }

    // Archive PDF for admin review. Non-fatal — plan delivery is already done.
    const pdfshiftKey = process.env.PDFSHIFT_API_KEY;
    if (pdfshiftKey) {
      try {
        const pdf = await convertToPdf({ url: planUrl, apiKey: pdfshiftKey });
        await archivePdf(store, id, pdf);
        console.log(`[generate-plan] archived pdf for ${id} (${pdf.length} bytes)`);
      } catch (pdfErr) {
        console.error(`[generate-plan] pdf archival failed (non-fatal): ${pdfErr.message}`);
      }
    } else {
      console.warn("[generate-plan] PDFSHIFT_API_KEY not set — skipping pdf archival");
    }

    // Notify Mark — pass the issue lists so the email surfaces them inline.
    if (resendKey) {
      await sendNotificationEmail({
        apiKey: resendKey,
        firstName,
        email,
        planUrl,
        usage,
        sent: record.status === "sent",
        hardFails,
        softFails,
        layer2,
      });
      console.log("[generate-plan] notification sent to Mark");
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, id, planUrl, sent: record.status === "sent", needs_review: hasHardFails }) };
  } catch (err) {
    console.error("[generate-plan] failed:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
