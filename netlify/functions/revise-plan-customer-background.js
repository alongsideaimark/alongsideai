// Customer-facing plan revision. Called from the /revise/:token page.
// Validates the token, checks quota + expiry, calls revisePlan, re-renders
// HTML, converts to PDF via PDFShift, emails the updated plan to the customer,
// and notifies Mark. "-background" suffix gives this a 15-minute timeout.
//
// POST /.netlify/functions/revise-plan-customer-background
// Body: { token, instruction }

const { connectLambda, getStore } = require("@netlify/blobs");
const { revisePlan } = require("../lib/call-claude");
const { renderPlan } = require("../lib/render-plan");
const { critique } = require("../lib/critique-plan");
const { convertToPdf, archivePdf } = require("../lib/pdf");

const CUSTOMER_FROM = "Mark <mark@alongsideai.ai>";
const CUSTOMER_REPLY_TO = "mark@alongsideai.ai";
const INTERNAL_FROM = "Alongside AI <intake@alongsideai.ai>";
const INTERNAL_TO = "mark@alongsideai.ai";

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function findRecordByToken(store, token) {
  const listing = await store.list();
  const keys = (listing && listing.blobs) ? listing.blobs.map((b) => b.key) : [];
  for (const key of keys) {
    const raw = await store.get(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.revision_token === token) return { key, record: parsed };
    } catch (_) {}
  }
  return null;
}

async function emailRevisedPlan({ apiKey, firstName, toEmail, pdfBuffer, revisionNumber }) {
  const subject = `Your revised plan — ${firstName}`;
  const ordinal = revisionNumber === 1 ? "first" : "second";

  const text =
`${firstName},

Your ${ordinal} revision is attached. Same plan, updated with what you told us.

Read it at your own pace — if anything still isn't right, reply to this email and it comes straight to me.

— Mark
Alongside AI`;

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">${escapeHtml(firstName)},</p>
    <p style="margin:0 0 18px;">Your ${ordinal} revision is attached. Same plan, updated with what you told us.</p>
    <p style="margin:0 0 18px;">Read it at your own pace — if anything still isn't right, reply to this email and it comes straight to me.</p>
    <p style="margin:32px 0 0;">— Mark<br/><span style="color:#7A8B6F;">Alongside AI</span></p>
  </div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: CUSTOMER_FROM,
      to: [toEmail],
      reply_to: CUSTOMER_REPLY_TO,
      subject,
      text,
      html,
      attachments: [{
        filename: `Alongside-AI-plan-${firstName}-revised.pdf`,
        content: pdfBuffer.toString("base64"),
      }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend ${res.status}: ${errBody}`);
  }
}

async function notifyMark({ apiKey, firstName, email, instruction, revisionNumber, remaining, planUrl, usage, blocked, hardFails }) {
  const wasBlocked = blocked && Array.isArray(hardFails) && hardFails.length > 0;
  const subject = wasBlocked
    ? `Revision blocked — ${firstName} (#${revisionNumber})`
    : `Customer revision #${revisionNumber} — ${firstName}`;
  const cost = usage && usage.input_tokens
    ? `${usage.input_tokens} in / ${usage.output_tokens} out`
    : "—";

  const issuesText = wasBlocked
    ? `\n\nCRITIC HARD FAILS (blocked customer email):\n${hardFails.map((i) => `  - [${i.rule}] ${i.path} — ${i.detail}`).join("\n")}\n`
    : "";

  const statusLine = wasBlocked
    ? `${firstName}${email ? ` (${email})` : ""} submitted revision #${revisionNumber}, but the critic flagged hard issues. The revised plan was NOT emailed to the customer. Review and send manually.`
    : `${firstName}${email ? ` (${email})` : ""} submitted revision #${revisionNumber}.`;

  const text =
`${statusLine}

What they asked to change:
"${instruction}"${issuesText}

Revisions remaining: ${remaining}

View the updated plan: ${planUrl}

Tokens: ${cost}`;

  const issuesHtml = wasBlocked
    ? `<div style="margin:0 0 18px;padding:14px 18px;background:#FDF2F2;border-radius:10px;border-left:3px solid #9E4444;">
        <div style="font-size:12px;font-weight:600;color:#9E4444;margin-bottom:8px;">CRITIC HARD FAILS (customer email blocked)</div>
        <ul style="padding-left:18px;margin:0;font-size:14px;color:#2C3330;line-height:1.6;">${hardFails.map((i) => `<li><code style="background:#F3EDE3;padding:1px 5px;border-radius:3px;font-size:12px;">${escapeHtml(i.rule)}</code> ${escapeHtml(i.path)} — ${escapeHtml(i.detail)}</li>`).join("")}</ul>
      </div>`
    : "";

  const btnColor = wasBlocked ? "#9E4444" : "#7A8B6F";
  const btnLabel = wasBlocked ? "Review revised plan" : "View updated plan";

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">${escapeHtml(statusLine)}</p>
    <div style="margin:0 0 18px;padding:14px 18px;background:#F3EDE3;border-radius:10px;border-left:3px solid #9E7B84;">
      <div style="font-size:12px;font-weight:600;color:#8A8780;margin-bottom:6px;">WHAT THEY ASKED TO CHANGE</div>
      <div style="font-size:15px;line-height:1.55;color:#2C3330;">${escapeHtml(instruction)}</div>
    </div>
    ${issuesHtml}
    <p style="margin:0 0 18px;color:#4A5550;">Revisions remaining: <strong>${remaining}</strong></p>
    <p style="margin:0 0 24px;">
      <a href="${planUrl}" style="display:inline-block;padding:12px 20px;background:${btnColor};color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;">${btnLabel}</a>
    </p>
    <p style="margin:0;font-size:12px;color:#8A8780;">Tokens: ${cost}</p>
  </div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    const errBody = await res.text();
    console.error("[revise-plan-customer] notification email failed:", errBody);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method not allowed" };
    }

    connectLambda(event);

    const { token, instruction } = JSON.parse(event.body || "{}");
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return { statusCode: 400, body: "invalid token" };
    }
    if (!instruction || typeof instruction !== "string" || instruction.trim().length < 10) {
      return { statusCode: 400, body: "revision instruction too short" };
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const pdfshiftKey = process.env.PDFSHIFT_API_KEY;
    if (!anthropicKey) return { statusCode: 500, body: "ANTHROPIC_API_KEY missing" };
    if (!resendKey) return { statusCode: 500, body: "RESEND_API_KEY missing" };
    if (!pdfshiftKey) return { statusCode: 500, body: "PDFSHIFT_API_KEY missing" };

    const store = getStore("plans");
    const found = await findRecordByToken(store, token);
    if (!found) {
      return { statusCode: 404, body: "token not found" };
    }

    const { key, record } = found;

    // Check expiry.
    if (record.revision_window_expires_at) {
      if (new Date() > new Date(record.revision_window_expires_at)) {
        return { statusCode: 403, body: "revision window expired" };
      }
    }

    // Check quota.
    const remaining = record.customer_revisions_remaining || 0;
    if (remaining <= 0) {
      return { statusCode: 410, body: "no revisions remaining" };
    }

    const trimmedInstruction = instruction.trim();
    const priorTurns = Array.isArray(record.customer_revisions)
      ? record.customer_revisions.map((r) => ({ instruction: r.instruction, note: r.note || "", usage: r.usage, searchCount: r.searchCount }))
      : [];

    console.log(`[revise-plan-customer] ${record.id} revision request (${trimmedInstruction.length} chars, ${remaining} remaining)`);

    const { plan, note, usage, searchCount } = await revisePlan({
      currentPlan: record.plan,
      briefing: record.briefing,
      instruction: trimmedInstruction,
      priorTurns,
      apiKey: anthropicKey,
    });
    console.log(`[revise-plan-customer] ${record.id} revision returned; searches: ${searchCount || 0}; tokens:`, JSON.stringify(usage));

    // Re-render HTML.
    const html = renderPlan(plan);

    // Track customer revisions separately from Mark's internal revisions.
    const revisionNumber = (Array.isArray(record.customer_revisions) ? record.customer_revisions.length : 0) + 1;
    const customerRevisions = Array.isArray(record.customer_revisions) ? record.customer_revisions.slice() : [];
    customerRevisions.push({
      at: new Date().toISOString(),
      instruction: trimmedInstruction,
      note: note || "",
      searchCount,
      usage,
    });

    // Critic pass — same Layer 1 + Layer 2 pipeline as initial generation.
    // Hard fails block the customer email and route to Mark for review.
    const { hardFails, softFails, layer2 } = await critique({ plan, briefing: record.briefing, apiKey: anthropicKey });
    const hasHardFails = hardFails.length > 0;
    if (hasHardFails) {
      console.warn(`[revise-plan-customer] ${record.id} critic flagged ${hardFails.length} hard issue(s):`, hardFails.map((i) => `${i.rule}@${i.path}`).join(", "));
    }
    if (softFails.length > 0) {
      console.log(`[revise-plan-customer] ${record.id} critic flagged ${softFails.length} soft issue(s):`, softFails.map((i) => `${i.rule}@${i.path}`).join(", "));
    }
    if (layer2) {
      console.log(`[revise-plan-customer] ${record.id} LLM critic: verdict=${layer2.verdict} score=${layer2.score}/10 confidence=${layer2.confidence}`);
    }

    const newRemaining = remaining - 1;
    const updated = {
      ...record,
      plan,
      html,
      customer_revisions: customerRevisions,
      customer_revisions_remaining: newRemaining,
      customer_revised_at: new Date().toISOString(),
      latest_critique: { hardFails, softFails, layer2 },
    };
    await store.set(key, JSON.stringify(updated));
    console.log(`[revise-plan-customer] ${record.id} stored; ${newRemaining} revisions remaining`);

    const baseUrl = process.env.URL || "https://alongsideai.ai";
    const planUrl = `${baseUrl}/plans/${record.id}`;

    if (hasHardFails) {
      // Hard fails: don't email the customer. Notify Mark to review manually.
      console.warn(`[revise-plan-customer] ${record.id} customer email blocked by critic`);
      await notifyMark({
        apiKey: resendKey,
        firstName: record.customer_first_name,
        email: record.customer_email,
        instruction: trimmedInstruction,
        revisionNumber,
        remaining: newRemaining,
        planUrl,
        usage,
        blocked: true,
        hardFails,
      });

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, remaining: newRemaining }),
      };
    }

    // No hard fails — generate PDF, archive it, and email the customer.
    const pdf = await convertToPdf({ url: planUrl, apiKey: pdfshiftKey });
    await archivePdf(store, record.id, pdf);
    console.log(`[revise-plan-customer] ${record.id} pdf: ${pdf.length} bytes (archived)`);

    if (record.customer_email) {
      await emailRevisedPlan({
        apiKey: resendKey,
        firstName: record.customer_first_name,
        toEmail: record.customer_email,
        pdfBuffer: pdf,
        revisionNumber,
      });
      console.log(`[revise-plan-customer] ${record.id} emailed to ${record.customer_email}`);
    }

    await notifyMark({
      apiKey: resendKey,
      firstName: record.customer_first_name,
      email: record.customer_email,
      instruction: trimmedInstruction,
      revisionNumber,
      remaining: newRemaining,
      planUrl,
      usage,
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, remaining: newRemaining }),
    };
  } catch (err) {
    console.error("[revise-plan-customer] failed:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
