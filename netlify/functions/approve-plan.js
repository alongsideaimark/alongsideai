// Approve a plan draft: convert the stored HTML to PDF via PDFShift, email it
// to the customer, and flip the stored record status to "sent". Called from
// the review bar on /plans/:id when Mark clicks "Approve & send to customer".

const { connectLambda, getStore } = require("@netlify/blobs");

const PDFSHIFT_URL = "https://api.pdfshift.io/v3/convert/pdf";
const FROM = "Mark <mark@alongsideai.ai>";
const REPLY_TO = "mark@alongsideai.ai";

async function convertToPdf({ html, apiKey }) {
  const auth = "Basic " + Buffer.from(`api:${apiKey}`).toString("base64");
  const res = await fetch(PDFSHIFT_URL, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: html,
      sandbox: false,
      format: "Letter",
      margin: "18mm",
      wait_for: "networkidle0",
      use_print: true,
      // The template uses relative /assets/plan.css — tell PDFShift where to
      // resolve those from so the CSS, fonts, and logo mark load.
      base_url: "https://alongsideai.ai",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PDFShift ${res.status}: ${body}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}

async function emailCustomer({ apiKey, firstName, toEmail, pdfBuffer }) {
  const subject = `Your plan — ${firstName}`;
  const text =
`${firstName},

Your plan's attached. Read it at your own pace — there's no rush.

A few things to know:

It's yours to keep, whether you decide to act on any of it or not. Every recommendation is grounded in what you wrote on the questionnaire; if something doesn't fit, trust your read over ours and skip it.

If you'd like help setting any of this up, the implementation package is optional — details are in section 7 of the plan. Just reply to this email and we'll take it from there.

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
    <p style="margin:0 0 18px;">If you'd like help setting any of this up, the implementation package is optional — details are in section 7 of the plan. Just reply to this email and we'll take it from there.</p>
    <p style="margin:0 0 18px;">If something in the plan is wrong, or if there's a part that doesn't make sense, same deal — reply to this email. It comes straight to me.</p>
    <p style="margin:32px 0 0;">— Mark<br/><span style="color:#7A8B6F;">Alongside AI</span></p>
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
    if (record.status === "sent") {
      return { statusCode: 409, body: "plan already sent" };
    }
    if (!record.customer_email) {
      return { statusCode: 400, body: "no customer email on record" };
    }

    console.log("[approve-plan] converting to pdf:", id);
    const pdf = await convertToPdf({ html: record.html, apiKey: pdfshiftKey });
    console.log("[approve-plan] pdf size:", pdf.length, "bytes");

    await emailCustomer({
      apiKey: resendKey,
      firstName: record.customer_first_name,
      toEmail: record.customer_email,
      pdfBuffer: pdf,
    });
    console.log("[approve-plan] sent to", record.customer_email);

    record.status = "sent";
    record.sent_at = new Date().toISOString();
    await store.set(`${id}.json`, JSON.stringify(record));

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
