// Shared helpers for turning a raw questionnaire submission into the
// "AI briefing" plain-text block plus the pretty human labels used in emails.
// Extracted from submission-created.js so both that function and the
// plan-drafting pipeline share a single source of truth.

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

function label(field, rawValue) {
  const map = LABELS[field];
  const val = String(rawValue || "").trim();
  if (!val) return "—";
  if (!map) return val;
  const parts = val.split(",").map((v) => v.trim()).filter(Boolean);
  return parts.map((p) => map[p] || p).join(", ");
}

function raw(data, key) {
  const v = data[key];
  if (v == null) return "";
  return String(v).trim();
}

function textOrDash(s) {
  const v = String(s || "").trim();
  return v || "(not answered)";
}

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

module.exports = { LABELS, label, raw, textOrDash, buildAiBriefing };
