// Approve a plan draft: convert the stored HTML to PDF via PDFShift, email it
// to the customer, and flip the stored record status to "sent". Called from
// the review bar on /plans/:id when Mark clicks "Approve & send to customer".

const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");
const { convertToPdf, archivePdf } = require("../lib/pdf");
const { transition, IllegalTransitionError } = require("../lib/plan-state");

const FROM = "Mark <mark@lanternplan.com>";
const REPLY_TO = "mark@lanternplan.com";

async function emailCustomer({ apiKey, firstName, toEmail, pdfBuffer, revisionUrl }) {
  const subject = `Your plan — ${firstName}`;
  const text =
`${firstName},

Your plan's attached. Read it at your own pace — there's no rush.

A few things to know:

It's yours to keep, whether you decide to act on any of it or not. Every recommendation is grounded in what you wrote on the questionnaire; if something doesn't fit, trust your read over ours and skip it.

If you'd like help setting any of this up, the implementation package is optional — details are in section 7 of the plan. Just reply to this email and we'll take it from there.

If something in the plan is wrong — a tool you already use that we didn't account for, a budget that should be different, a detail you forgot to mention — you can revise it. Click the link below, tell us what to change, and we'll send you an updated plan:

${revisionUrl}

You have two free revisions available for the next 14 days.

One more thing: if the plan doesn't feel worth it, you have 14 days from today to reply to this email and ask for a full refund. No forms, no hoops. We'll process it within five business days.

— Mark
Lantern Plan`;

  const html =
`<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 18px;">${firstName},</p>
    <p style="margin:0 0 18px;">Your plan's attached. Read it at your own pace — there's no rush.</p>
    <p style="margin:0 0 18px;">It's yours to keep, whether you decide to act on any of it or not. Every recommendation is grounded in what you wrote on the questionnaire; if something doesn't fit, trust your read over ours and skip it.</p>
    <p style="margin:0 0 18px;">If you'd like help setting any of this up, the implementation package is optional — details are in section 7 of the plan. Just reply to this email and we'll take it from there.</p>
    <p style="margin:0 0 18px;">If something in the plan is wrong — a tool you already use that we didn't account for, a budget that should be different, a detail you forgot to mention — you can revise it:</p>
    <p style="margin:0 0 24px;">
      <a href="${revisionUrl}" style="display:inline-block;padding:14px 24px;background:#9E7B84;color:#FAF6F1;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Revise your plan</a>
    </p>
    <p style="margin:0 0 18px;color:#8A8780;font-size:14px;">Two free revisions available for the next 14 days.</p>
    <p style="margin:0 0 18px;">One more thing: if the plan doesn't feel worth it, you have 14 days from today to reply to this email and ask for a full refund. No forms, no hoops. We'll process it within five business days.</p>
    <p style="margin:32px 0 0;">— Mark<br/><span style="color:#7A8B6F;">Lantern Plan</span></p>
  </div>
</body></html>`;

  const body = {
    from: FROM,
    to: [toEmail],
    reply_to: REPLY_TO,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `Lantern-Plan-${firstName}.pdf`,
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method not allowed" };
    }

    connectLambda(event);
    const { id } = JSON.parse(event.body || "{}");
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      return { statusCode: 400, body: "invalid id" };
    }

    const pdfshiftKey = process.env.PDFSHIFT_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!pdfshiftKey) return { statusCode: 500, body: "PDFSHIFT_API_KEY missing" };
    if (!resendKey) return { statusCode: 500, body: "RESEND_API_KEY missing" };

    const store = getStore("plans");
    const raw = await store.get(`${id}.json`);
    if (!raw) return { statusCode: 404, body: "plan not found" };

    const record = JSON.parse(raw);

    const effectiveState = record.state || record.status;
    if (effectiveState === "sent") {
      return { statusCode: 409, body: "plan already sent" };
    }
    if (!record.customer_email) {
      return { statusCode: 400, body: "no customer email on record" };
    }

    try {
      transition(record, "approved", { reason: "Mark approved" });
    } catch (err) {
      if (err instanceof IllegalTransitionError) {
        return { statusCode: 409, body: `can't approve from state "${record.state}"` };
      }
      throw err;
    }
    await store.set(`${id}.json`, JSON.stringify(record));

    const baseUrl =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      process.env.DEPLOY_URL ||
      "https://lanternplan.com";
    const planUrl = `${baseUrl}/plans/${id}`;
    console.log("[approve-plan] converting to pdf:", planUrl);
    const pdf = await convertToPdf({ url: planUrl, apiKey: pdfshiftKey });
    console.log("[approve-plan] pdf size:", pdf.length, "bytes");

    await archivePdf(store, id, pdf);
    console.log("[approve-plan] archived pdf for", id);

    const revisionToken = crypto.randomBytes(24).toString("base64url");
    const revisionWindowDays = 14;

    try {
      await emailCustomer({
        apiKey: resendKey,
        firstName: record.customer_first_name,
        toEmail: record.customer_email,
        pdfBuffer: pdf,
        revisionUrl: `${baseUrl}/revise/${revisionToken}`,
      });
      console.log("[approve-plan] sent to", record.customer_email);

      transition(record, "sent", { reason: "customer email sent" });
      record.sent_at = new Date().toISOString();
      record.revision_token = revisionToken;
      record.customer_revisions_remaining = 2;
      record.revision_window_expires_at = new Date(Date.now() + revisionWindowDays * 24 * 60 * 60 * 1000).toISOString();
      record.customer_revisions = [];
    } catch (emailErr) {
      console.error("[approve-plan] customer email failed:", emailErr.message);
      transition(record, "failed", { reason: `customer email failed: ${emailErr.message}` });
    }
    await store.set(`${id}.json`, JSON.stringify(record));

    if (record.state === "failed") {
      return { statusCode: 502, body: `plan approved but email failed — record marked failed` };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, sent_at: record.sent_at }),
    };
  } catch (err) {
    console.error("[approve-plan] failed:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
