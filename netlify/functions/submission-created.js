// Fires automatically after every Netlify Forms submission.
// Sends two emails via Resend:
//   1. A warm auto-reply to the questionnaire submitter
//   2. A clean internal notification to Mark, organized by section, with a plain-text
//      "AI briefing" block at the bottom designed to be pasted straight into a Claude/ChatGPT
//      prompt or parsed programmatically once the plan-drafting pipeline is built.
// If anything fails, we log and return 200 so Netlify doesn't retry.

const INTERNAL_TO = "mark@alongsideai.ai";
const INTERNAL_FROM = "Alongside AI Intake <intake@alongsideai.ai>";
const AUTOREPLY_FROM = "Mark Skeehan <mark@alongsideai.ai>";
const REPLY_TO = "mark@alongsideai.ai";

// Labels mirror the radio/checkbox option labels rendered in the form,
// so the email reads in plain English instead of raw enum values.
const LABELS = {
  situation: {
    business: "Running a small business",
    semi_retired: "Semi-retired, or winding down",
    retired: "Fully retired, but active",
    professional: "A busy professional inside a bigger company",
    helping: "Helping a parent or family member",
    other: "Something else",
  },
  comfort: {
    avoid: "Avoids tech when possible",
    basics: "Handles the basics",
    okay: "Okay, wants to do more",
    comfortable: "Comfortable, just busy",
  },
  team: {
    solo: "Just them",
    partner: "Them and a spouse or partner",
    small: "Small team (2 to 10 people)",
    larger: "Larger team or company",
  },
  location_today: {
    office: "An office they drive to",
    home: "A home office",
    mix: "A mix of the two",
    anywhere: "Wherever they happen to be",
  },
  devices: {
    iphone: "iPhone",
    android: "Android phone",
    ipad: "iPad or tablet",
    mac: "Mac",
    pc: "Windows PC",
    none: "Mostly avoids computers",
  },
  subscriptions: {
    m365: "Microsoft 365",
    google: "Google Workspace",
    accounting: "QuickBooks / Xero",
    storage: "Dropbox / iCloud / Drive (paid)",
    ai: "ChatGPT / Claude / AI sub",
    sign: "DocuSign / Adobe Sign",
    bills: "Online bill pay",
    crm: "CRM or contact manager",
    scheduling: "Scheduling tool (Calendly etc.)",
    invoicing: "Invoicing or billing software",
    passwords: "Password manager",
    email_marketing: "Email marketing (Mailchimp, etc.)",
    project: "Project/task management",
    industry: "Industry-specific software",
    unsure: "Not sure what they pay for",
  },
  inbox: {
    zero: "Inbox zero, mostly under control",
    manageable: "Manageable but noisy",
    overwhelmed: "Overwhelmed — misses things",
    surrendered: "Has given up on it",
  },
  priority: {
    time: "More time",
    money: "More money",
    peace: "More peace of mind",
    mix: "Some of each",
  },
  tried_ai: {
    no: "No — first time",
    little: "A little",
    regular: "Yes, regularly",
  },
  cloud_comfort: {
    fine: "Fine with cloud — stuff is probably already there",
    familiar: "Fine if it's a name they've heard of",
    nervous: "Nervous, but open to it",
    local: "Prefers keeping things on own devices",
  },
  urgency: {
    asap: "ASAP",
    month: "Within a month",
    exploring: "Just exploring",
  },
  budget_posture: {
    under_50: "Under $50/month",
    "50_100": "$50–100/month",
    "100_250": "$100–250/month",
    "250_500": "$250–500/month",
    "500_plus": "$500+/month",
    unsure: "Not sure yet",
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
  // Checkbox values arrive comma-joined from the form; radios arrive as a single value.
  const parts = val.split(",").map((v) => v.trim()).filter(Boolean);
  return parts.map((p) => map[p] || p).join(", ");
}

function raw(data, key) {
  const v = data[key];
  if (v == null) return "";
  return String(v).trim();
}

function paragraphsHtml(s) {
  const text = String(s || "").trim();
  if (!text) return `<p style="margin:0;color:#8A8780;">(not answered)</p>`;
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p style="margin:0 0 12px;">${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function textOrDash(s) {
  const v = String(s || "").trim();
  return v || "(not answered)";
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

I'll sit down with what you told me — probably tonight or tomorrow — and go through it carefully. The answers you gave about where your time goes, what you've already tried, and what "working in six months" looks like for you are usually where the real plan comes from. From there I'll draft something specific to your setup, not a template. A few pages, usually. It'll say plainly what I think would help, in what order, and roughly what it would look like week to week if we worked together. If something you're hoping for isn't realistic — or if you'd be better off with someone else entirely — I'll tell you that.

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
    <p style="margin:0 0 20px;">I'll sit down with what you told me &mdash; probably tonight or tomorrow &mdash; and go through it carefully. The answers you gave about where your time goes, what you've already tried, and what &ldquo;working in six months&rdquo; looks like for you are usually where the real plan comes from. From there I'll draft something specific to your setup, not a template. A few pages, usually. It'll say plainly what I think would help, in what order, and roughly what it would look like week to week if we worked together. If something you're hoping for isn't realistic &mdash; or if you'd be better off with someone else entirely &mdash; I'll tell you that.</p>
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

// Build the structured plain-text briefing block that can be pasted directly into an
// AI agent prompt to draft a plan. Stable keys, line-oriented, no HTML.
function buildAiBriefing(firstName, data) {
  const L = [];
  L.push("=== ALONGSIDE AI BRIEFING (FOR AGENT INPUT) ===");
  L.push("");

  L.push("## Respondent");
  L.push(`- First name: ${firstName}`);
  L.push(`- Email: ${textOrDash(data.contact)}`);
  L.push(`- Situation: ${label("situation", data.situation)}${raw(data, "situation_other") ? ` — "${raw(data, "situation_other")}"` : ""}`);
  L.push(`- Comfort with tech: ${label("comfort", data.comfort)}`);
  L.push("");

  L.push("## Work context");
  L.push(`- What they do: ${textOrDash(data.work)}`);
  L.push(`- Team: ${label("team", data.team)}`);
  L.push(`- Typical week: ${textOrDash(data.typical_week)}`);
  L.push(`- Works from today: ${label("location_today", data.location_today)}`);
  L.push(`- Would like to work from: ${textOrDash(data.location_wanted)}`);
  L.push("");

  L.push("## Current stack");
  L.push(`- Devices: ${label("devices", data.devices)}`);
  L.push(`- Paid software: ${label("subscriptions", data.subscriptions)}`);
  if (raw(data, "subscriptions_other")) {
    L.push(`- Other software mentioned: ${raw(data, "subscriptions_other")}`);
  }
  L.push(`- Where data lives: ${textOrDash(data.data_lives)}`);
  if (raw(data, "tool_hated")) {
    L.push(`- Tool they can't stand: ${raw(data, "tool_hated")}`);
    if (raw(data, "tool_hated_why")) {
      L.push(`  Why: ${raw(data, "tool_hated_why")}`);
    }
  }
  L.push("");

  L.push("## Pain & goals");
  L.push(`- Biggest friction: ${textOrDash(data.friction)}`);
  L.push(`- Manual tasks they named: ${textOrDash(data.manual_tasks)}`);
  L.push(`- What they've tried before: ${textOrDash(data.already_tried)}`);
  L.push(`- Inbox state: ${label("inbox", data.inbox)}`);
  if (raw(data, "inbox_note")) {
    L.push(`  Inbox detail: ${raw(data, "inbox_note")}`);
  }
  L.push(`- Magic wand: ${textOrDash(data.wish)}`);
  L.push(`- Six-month success picture: ${textOrDash(data.success_6mo)}`);
  L.push(`- Priority (time / money / peace): ${label("priority", data.priority)}`);
  L.push("");

  L.push("## Posture");
  L.push(`- Prior AI experience: ${label("tried_ai", data.tried_ai)}`);
  L.push(`- Nervous about AI: ${textOrDash(data.nervous)}`);
  L.push(`- Cloud comfort: ${label("cloud_comfort", data.cloud_comfort)}`);
  if (raw(data, "cloud_comfort_note")) {
    L.push(`  Privacy/data note: ${raw(data, "cloud_comfort_note")}`);
  }
  L.push("");

  L.push("## Intent");
  L.push(`- Timeline: ${label("urgency", data.urgency)}`);
  L.push(`- Monthly budget range: ${label("budget_posture", data.budget_posture)}`);
  L.push(`- Anything else: ${textOrDash(data.anything_else)}`);
  L.push("");

  L.push("=== END BRIEFING ===");
  return L.join("\n");
}

function buildInternalNotification(firstName, data, submittedAt) {
  const email = String(data.contact || "").trim();

  const situationShort = (LABELS.situation[data.situation] || "new lead").toLowerCase();
  const urgencyShort = (LABELS.urgency[data.urgency] || "").toLowerCase();
  const subject = urgencyShort
    ? `New questionnaire: ${firstName} (${situationShort} · ${urgencyShort})`
    : `New questionnaire: ${firstName} (${situationShort})`;

  const dateStr = submittedAt
    ? new Date(submittedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
      }) + " PT"
    : "just now";

  const factRow = (k, v) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#8A8780;font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;color:#2C3330;font-size:15px;vertical-align:top;">${escapeHtml(v)}</td></tr>`;

  const answerBlock = (title, value) => `
    <div style="margin-bottom:22px;">
      <div style="font-size:13px;font-weight:600;color:#4A5550;margin-bottom:6px;">${escapeHtml(title)}</div>
      <div style="font-size:15px;color:#2C3330;">${paragraphsHtml(value)}</div>
    </div>`;

  const sectionHeading = (text) => `
    <div style="margin:32px 0 14px;padding-top:20px;border-top:1px solid #E5DED3;">
      <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#7B9E87;">${escapeHtml(text)}</div>
    </div>`;

  const aiBriefing = buildAiBriefing(firstName, data);

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

    <table cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 12px;width:100%;">
      ${factRow("Situation", label("situation", data.situation))}
      ${factRow("Comfort", label("comfort", data.comfort))}
      ${factRow("Team", label("team", data.team))}
      ${factRow("Timeline", label("urgency", data.urgency))}
      ${factRow("Priority", label("priority", data.priority))}
      ${factRow("Monthly budget", label("budget_posture", data.budget_posture))}
      ${factRow("Prior AI", label("tried_ai", data.tried_ai))}
      ${factRow("Cloud comfort", label("cloud_comfort", data.cloud_comfort))}
      ${factRow("Devices", label("devices", data.devices))}
    </table>

    ${sectionHeading("Section 2 — Their world and work")}
    ${answerBlock("What they do (or did)", data.work)}
    ${answerBlock("A typical week", data.typical_week)}
    ${answerBlock("Where they'd like to be working from", data.location_wanted)}

    ${sectionHeading("Section 3 — Current setup")}
    ${answerBlock("Paid software", label("subscriptions", data.subscriptions))}
    ${raw(data, "subscriptions_other") ? answerBlock("Other software mentioned", data.subscriptions_other) : ""}
    ${answerBlock("Where data actually lives", data.data_lives)}
    ${raw(data, "tool_hated") ? answerBlock("A tool they don't like but can't replace", data.tool_hated) : ""}
    ${raw(data, "tool_hated_why") ? answerBlock("Why that tool frustrates them", data.tool_hated_why) : ""}

    ${sectionHeading("Section 4 — Where their time goes")}
    ${answerBlock("What takes way longer than it should", data.friction)}
    ${answerBlock("Manual tasks they suspect could be automated", data.manual_tasks)}
    ${answerBlock("What they've tried before", data.already_tried)}
    ${answerBlock("Inbox state", label("inbox", data.inbox))}
    ${raw(data, "inbox_note") ? answerBlock("Inbox specifics", data.inbox_note) : ""}

    ${sectionHeading("Section 5 — What they want")}
    ${answerBlock("Magic wand", data.wish)}
    ${answerBlock("Six months from now, if this is working", data.success_6mo)}

    ${sectionHeading("Section 6 — AI and data posture")}
    ${answerBlock("Anything about AI that makes them nervous", data.nervous)}
    ${raw(data, "cloud_comfort_note") ? answerBlock("Privacy or data note", data.cloud_comfort_note) : ""}

    ${sectionHeading("Section 7 — Getting started")}
    ${raw(data, "anything_else") ? answerBlock("Anything else before we write the plan", data.anything_else) : ""}

    ${sectionHeading("AI briefing (paste this into the agent)")}
    <pre style="white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;background:#F3EDE3;color:#2C3330;border-radius:10px;padding:18px 20px;margin:0;">${escapeHtml(aiBriefing)}</pre>

    <div style="padding-top:20px;margin-top:28px;border-top:1px solid #E5DED3;font-size:12px;color:#8A8780;line-height:1.5;">
      Reply to this email to respond directly to ${escapeHtml(firstName)}.
    </div>

  </div>
</body></html>`;

  const text =
`${firstName}
${email}
Submitted ${dateStr}

QUICK FACTS
  Situation:       ${label("situation", data.situation)}
  Comfort:         ${label("comfort", data.comfort)}
  Team:            ${label("team", data.team)}
  Timeline:        ${label("urgency", data.urgency)}
  Priority:        ${label("priority", data.priority)}
  Monthly budget:  ${label("budget_posture", data.budget_posture)}
  Prior AI:        ${label("tried_ai", data.tried_ai)}
  Cloud comfort:   ${label("cloud_comfort", data.cloud_comfort)}
  Devices:         ${label("devices", data.devices)}

--- SECTION 2: Their world and work ---

What they do (or did):
${textOrDash(data.work)}

A typical week:
${textOrDash(data.typical_week)}

Where they'd like to be working from:
${textOrDash(data.location_wanted)}

--- SECTION 3: Current setup ---

Paid software: ${label("subscriptions", data.subscriptions)}
${raw(data, "subscriptions_other") ? `Other software mentioned: ${raw(data, "subscriptions_other")}\n` : ""}
Where data actually lives:
${textOrDash(data.data_lives)}

${raw(data, "tool_hated") ? `Tool they don't like but can't replace: ${raw(data, "tool_hated")}\n` : ""}${raw(data, "tool_hated_why") ? `Why that tool frustrates them:\n${raw(data, "tool_hated_why")}\n` : ""}
--- SECTION 4: Where their time goes ---

What takes way longer than it should:
${textOrDash(data.friction)}

Manual tasks they suspect could be automated:
${textOrDash(data.manual_tasks)}

What they've tried before:
${textOrDash(data.already_tried)}

Inbox state: ${label("inbox", data.inbox)}
${raw(data, "inbox_note") ? `Inbox specifics: ${raw(data, "inbox_note")}\n` : ""}
--- SECTION 5: What they want ---

Magic wand:
${textOrDash(data.wish)}

Six months from now, if this is working:
${textOrDash(data.success_6mo)}

--- SECTION 6: AI and data posture ---

Anything about AI that makes them nervous:
${textOrDash(data.nervous)}
${raw(data, "cloud_comfort_note") ? `\nPrivacy or data note: ${raw(data, "cloud_comfort_note")}\n` : ""}
--- SECTION 7: Getting started ---

${raw(data, "anything_else") ? `Anything else before we write the plan:\n${raw(data, "anything_else")}\n\n` : ""}
${aiBriefing}

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

    // Kick off plan drafting in the background. Fire-and-forget: the background
    // function accepts the POST and returns 202 immediately, then runs Claude
    // + renders HTML + emails Mark on its own schedule (up to 15 min).
    const baseUrl = process.env.URL || process.env.DEPLOY_URL;
    if (baseUrl) {
      try {
        await fetch(`${baseUrl}/.netlify/functions/generate-plan-background`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            data,
            firstName,
            submittedAt: payload.created_at,
          }),
        });
        console.log("[submission] plan drafting kicked off in background");
      } catch (err) {
        console.error("[submission] failed to trigger plan drafting:", err.message);
      }
    } else {
      console.warn("[submission] no URL env var; skipping plan drafting trigger");
    }

    return { statusCode: 200, body: "done" };
  } catch (err) {
    console.error("[submission] handler error", err);
    return { statusCode: 200, body: "error handled" };
  }
};
