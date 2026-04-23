// Fires automatically after every Netlify Forms submission.
// Sends two emails via Resend:
//   1. A warm auto-reply to the questionnaire submitter
//   2. A clean internal notification to Mark, with answers laid out for quick reading
// If anything fails, we log and return 200 so Netlify doesn't retry.

const INTERNAL_TO = "mark@alongsideai.ai";
const INTERNAL_FROM = "Alongside AI Intake <intake@alongsideai.ai>";
const AUTOREPLY_FROM = "Mark Skeehan <mark@alongsideai.ai>";
const REPLY_TO = "mark@alongsideai.ai";

const LABELS = {
  comfort: {
    avoid: "Avoids tech when possible",
    basics: "Handles the basics",
    okay: "Okay, wants to do more",
    comfortable: "Comfortable, just busy",
  },
  situation: {
    business: "Runs a small business",
    retired: "Retired or near it",
    professional: "Busy professional",
    helping: "Helping a family member",
  },
  devices: {
    iphone: "iPhone",
    android: "Android phone",
    ipad: "iPad / tablet",
    mac: "Mac",
    pc: "Windows PC",
    none: "Mostly avoids computers",
  },
  tried_ai: {
    no: "No — first time",
    little: "A little",
    regular: "Yes, regularly",
  },
  subscriptions: {
    m365: "Microsoft 365",
    google: "Google Workspace",
    accounting: "QuickBooks / Xero",
    storage: "Dropbox / iCloud / Drive (paid)",
    ai: "ChatGPT / Claude / AI sub",
    sign: "DocuSign / Adobe Sign",
    bills: "Online bill pay",
    unsure: "Not sure what they pay for",
  },
  urgency: {
    asap: "ASAP",
    month: "Within a month",
    exploring: "Just exploring",
  },
};

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function label(field, raw) {
  const map = LABELS[field];
  const val = String(raw || "").trim();
  if (!val) return "—";
  if (!map) return val;
  const parts = val.split(",").map((v) => v.trim()).filter(Boolean);
  return parts.map((p) => map[p] || p).join(", ");
}

function paragraphsHtml(s) {
  const text = String(s || "").trim();
  if (!text) return `<p style="margin:0;color:#8A8780;">(not answered)</p>`;
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p style="margin:0 0 12px;">${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

async function sendEmail(apiKey, opts) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend ${res.status}: ${errBody}`);
  }
  return res.json();
}

function buildAutoReply(firstName, email) {
  const subject = `We got it, ${firstName} — here's what happens next`;

  const text =
`Thanks for sending that through. I'm Mark, the person who'll be reading your answers and writing your plan.

Here's what the next couple of days look like.

I'll sit down with what you told me — probably tonight or tomorrow — and go through it carefully. Your answers to the friction question and the magic-wand question are usually where the real plan comes from. From there I'll draft something specific to your setup, not a template. Three to five pages, usually. It'll say plainly what I think would help, in what order, and roughly what it would look like week to week if we worked together. If something you're hoping for isn't realistic — or if you'd be better off with someone else entirely — I'll tell you that.

You'll get the plan as a PDF, within two business days. It's yours to keep either way.

If anything pops into your head between now and then that you wish you'd added — the fifteenth thing that drives you crazy, a screenshot of an inbox that's stressing you out, anything — just reply to this email. It comes straight to me.

— Mark
Alongside AI`;

  const html =
`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 20px;">Thanks for sending that through. I'm Mark, the person who'll be reading your answers and writing your plan.</p>
    <p style="margin:0 0 20px;">Here's what the next couple of days look like.</p>
    <p style="margin:0 0 20px;">I'll sit down with what you told me &mdash; probably tonight or tomorrow &mdash; and go through it carefully. Your answers to the friction question and the magic-wand question are usually where the real plan comes from. From there I'll draft something specific to your setup, not a template. Three to five pages, usually. It'll say plainly what I think would help, in what order, and roughly what it would look like week to week if we worked together. If something you're hoping for isn't realistic &mdash; or if you'd be better off with someone else entirely &mdash; I'll tell you that.</p>
    <p style="margin:0 0 20px;">You'll get the plan as a PDF, within two business days. It's yours to keep either way.</p>
    <p style="margin:0 0 20px;">If anything pops into your head between now and then that you wish you'd added &mdash; the fifteenth thing that drives you crazy, a screenshot of an inbox that's stressing you out, anything &mdash; just reply to this email. It comes straight to me.</p>
    <p style="margin:32px 0 0;">&mdash; Mark<br/><span style="color:#7B9E87;">Alongside AI</span></p>
  </div>
</body></html>`;

  return {
    from: AUTOREPLY_FROM,
    to: [email],
    reply_to: REPLY_TO,
    subject,
    text,
    html,
  };
}

function buildInternalNotification(firstName, data, submittedAt) {
  const email = String(data.contact || "").trim();
  const situation = label("situation", data.situation);
  const urgency = label("urgency", data.urgency);
  const comfort = label("comfort", data.comfort);
  const devices = label("devices", data.devices);
  const triedAi = label("tried_ai", data.tried_ai);
  const subscriptions = label("subscriptions", data.subscriptions);

  const situationShort = situation.split(/[—,]/)[0].trim().toLowerCase();
  const urgencyShort = urgency.toLowerCase();

  const subject = `New questionnaire: ${firstName} (${situationShort} · ${urgencyShort})`;

  const dateStr = submittedAt
    ? new Date(submittedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
      }) + " PT"
    : "just now";

  const factRow = (k, v) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#8A8780;font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;color:#2C3330;font-size:15px;vertical-align:top;">${escapeHtml(v)}</td></tr>`;

  const html =
`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.55;">
  <div style="max-width:640px;margin:0 auto;">

    <div style="padding:0 0 20px;border-bottom:1px solid #E5DED3;">
      <div style="font-family:Georgia,serif;font-size:30px;line-height:1.1;color:#2C3330;margin-bottom:6px;">${escapeHtml(firstName)}</div>
      <div style="font-size:15px;color:#4A5550;margin-bottom:4px;"><a href="mailto:${escapeHtml(email)}" style="color:#4A5550;text-decoration:none;">${escapeHtml(email)}</a></div>
      <div style="font-size:12px;color:#8A8780;letter-spacing:.05em;">Submitted ${escapeHtml(dateStr)}</div>
    </div>

    <table cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 28px;width:100%;">
      ${factRow("Situation", situation)}
      ${factRow("Comfort", comfort)}
      ${factRow("Timeline", urgency)}
      ${factRow("Devices", devices)}
      ${factRow("Prior AI", triedAi)}
    </table>

    <div style="background:#E8F0EB;border-radius:10px;padding:22px 24px;margin-bottom:28px;">
      <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#7B9E87;margin-bottom:14px;">The plan starts here</div>

      <div style="font-size:13px;font-weight:600;color:#4A5550;margin-bottom:6px;">What takes way longer than it should?</div>
      <div style="font-size:16px;color:#2C3330;margin-bottom:18px;">${paragraphsHtml(data.friction)}</div>

      <div style="font-size:13px;font-weight:600;color:#4A5550;margin-bottom:6px;">If a magic wand fixed one thing?</div>
      <div style="font-size:16px;color:#2C3330;">${paragraphsHtml(data.wish)}</div>
    </div>

    <div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;color:#4A5550;margin-bottom:6px;">What they do (or did)</div>
      <div style="font-size:15px;color:#2C3330;">${paragraphsHtml(data.work)}</div>
    </div>

    <div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;color:#4A5550;margin-bottom:6px;">Anything about AI that makes them nervous</div>
      <div style="font-size:15px;color:#2C3330;">${paragraphsHtml(data.nervous)}</div>
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:600;color:#4A5550;margin-bottom:6px;">Currently paying for</div>
      <div style="font-size:15px;color:#2C3330;">${escapeHtml(subscriptions)}</div>
    </div>

    <div style="padding-top:20px;border-top:1px solid #E5DED3;font-size:12px;color:#8A8780;line-height:1.5;">
      Reply to this email to respond directly to ${escapeHtml(firstName)}.
    </div>

  </div>
</body></html>`;

  const text =
`${firstName}
${email}
Submitted ${dateStr}

QUICK FACTS
  Situation:  ${situation}
  Comfort:    ${comfort}
  Timeline:   ${urgency}
  Devices:    ${devices}
  Prior AI:   ${triedAi}

THE PLAN STARTS HERE

What takes way longer than it should?
${String(data.friction || "(not answered)").trim()}

If a magic wand fixed one thing?
${String(data.wish || "(not answered)").trim()}

—

What they do (or did):
${String(data.work || "(not answered)").trim()}

Anything about AI that makes them nervous:
${String(data.nervous || "(not answered)").trim()}

Currently paying for:
${subscriptions}

Reply to this email to respond directly to ${firstName}.`;

  return {
    from: INTERNAL_FROM,
    to: [INTERNAL_TO],
    reply_to: email,
    subject,
    text,
    html,
  };
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.payload || {};

    if (payload.form_name !== "questionnaire") {
      return { statusCode: 200, body: "skipped: not the questionnaire form" };
    }

    const data = payload.data || {};
    const email = String(data.contact || "").trim();
    const firstName = String(data.name || "").trim().split(/\s+/)[0] || "there";

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[submission] RESEND_API_KEY not set");
      return { statusCode: 200, body: "skipped: no api key" };
    }

    const jobs = [];

    // Internal notification to Mark — always send, even if submitter email is missing.
    jobs.push(
      sendEmail(apiKey, buildInternalNotification(firstName, data, payload.created_at))
        .then(() => console.log("[submission] internal notification sent"))
        .catch((err) => console.error("[submission] internal send failed:", err.message))
    );

    // Auto-reply to the submitter — only if we have a valid email.
    if (email && /^\S+@\S+\.\S+$/.test(email)) {
      jobs.push(
        sendEmail(apiKey, buildAutoReply(firstName, email))
          .then(() => console.log("[submission] auto-reply sent to", email))
          .catch((err) => console.error("[submission] auto-reply failed:", err.message))
      );
    } else {
      console.log("[submission] skipping auto-reply: no valid submitter email");
    }

    await Promise.all(jobs);
    return { statusCode: 200, body: "done" };
  } catch (err) {
    console.error("[submission] handler error", err);
    return { statusCode: 200, body: "error handled" };
  }
};
