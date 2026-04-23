// Calls the Anthropic API to draft a plan from a briefing block.
// Enables Anthropic's server-side web_search tool so Claude can research
// tools specific to the respondent's niche (vet practice management AI,
// insurance agency AI, whatever their world is) before drafting — instead
// of just recycling what's in the reference plans.
//
// The search tool is server-side: Anthropic runs the searches on their end,
// so we don't need a tool-use loop — it all happens inside one API call.
// Downside: the call takes longer (2-3 minutes) because of the search round
// trips. Our background function has a 15-min budget, plenty of room.

const fs = require("fs");
const path = require("path");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 12000;
const MAX_WEB_SEARCHES = 8;

const PROMPT_PATH = path.join(__dirname, "..", "plan-template", "prompt.md");
const SAMPLE_DIR = path.join(__dirname, "..", "..", "examples");

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function parsePlanJson(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("no JSON object found in Claude response");
  }
  const candidate = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    throw new Error(`Claude returned unparsable JSON: ${err.message}`);
  }
}

// Claude may do many searches, which arrive interleaved with tool_result and
// text blocks. The actual JSON plan will be in one of the text blocks — we
// concatenate all text output and let parsePlanJson find the outer JSON.
function collectText(contentArray) {
  return (contentArray || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
}

async function draftPlan({ briefing, apiKey }) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const systemPrompt = readFile(PROMPT_PATH);
  const frankSample = readFile(path.join(SAMPLE_DIR, "semi-retired", "index.html"));
  const priyaSample = readFile(path.join(SAMPLE_DIR, "busy-professional", "index.html"));

  const userContent = [
    {
      type: "text",
      text: `Reference plan #1 — Frank, semi-retired. This is the voice and quality bar. Do NOT recycle these tool picks for other personas; each plan's tools must be researched fresh for the respondent in front of you:\n\n${frankSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Reference plan #2 — Priya, busy professional. Same voice, different persona. Same rule — don't recycle these picks either:\n\n${priyaSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text:
`Now draft the plan for this respondent.

RESEARCH FIRST. Before picking any tools, use the web_search tool to investigate the respondent's specific world. Good searches look like:
- "[their specific profession/industry] AI tools 2026"
- "best [specific software they use] AI integrations"
- "[specific pain point they mentioned] AI solutions"
- Competitor research for any tool you're considering (is this tool actually current? are there better alternatives?)

Run 4–8 targeted searches. Find tools that a knowledgeable friend in their field would know about — not just the generic consumer AI lineup. If a niche-specific tool genuinely fits, recommend it. If the niche doesn't have good specialized tools yet, that's fine — but prove you looked.

You MUST consider "build it yourself" as a recommendation type. For respondents whose magic-wand answer is bespoke (writing in their voice, a workflow no SaaS addresses, something specific to them), the right recommendation is often to build a small custom tool in Claude or a comparable assistant — not to subscribe to yet another piece of SaaS. At least one plan in every five should include a "build it yourself" recommendation where it genuinely fits.

After research, draft the plan in the JSON format specified in the system prompt. Your final text output must contain ONLY the JSON object — no preamble, no search summaries, no trailing commentary.

${briefing}`,
    },
  ];

  const body = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: MAX_WEB_SEARCHES,
      },
    ],
    messages: [
      { role: "user", content: userContent },
    ],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errBody}`);
  }

  const json = await res.json();

  // Count how many searches actually ran — useful in logs to confirm the
  // research step is doing its job.
  const searchCount = (json.content || []).filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search"
  ).length;

  const fullText = collectText(json.content);
  if (!fullText.trim()) {
    throw new Error("Anthropic returned no text content");
  }

  const plan = parsePlanJson(fullText);

  return {
    plan,
    usage: json.usage || {},
    rawText: fullText,
    searchCount,
  };
}

// Revises an existing plan per a plain-English instruction from Mark.
// Same model, same system prompt (so the voice rules carry over), same
// web_search tool (so agentic instructions like "verify the tool picks are
// still current" actually work). Returns a fully revised plan JSON.
async function revisePlan({ currentPlan, briefing, instruction, priorTurns, apiKey }) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const systemPrompt = readFile(PROMPT_PATH);
  const frankSample = readFile(path.join(SAMPLE_DIR, "semi-retired", "index.html"));
  const priyaSample = readFile(path.join(SAMPLE_DIR, "busy-professional", "index.html"));

  const userContent = [
    {
      type: "text",
      text: `Reference plan #1 — Frank, semi-retired. Voice and quality bar:\n\n${frankSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Reference plan #2 — Priya, busy professional. Same voice, different persona:\n\n${priyaSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text:
`You drafted the plan below for this respondent. The reviewer is now chatting with you about it. Treat this as an ongoing back-and-forth conversation, not a one-shot edit.

${priorTurns && priorTurns.length ? `CONVERSATION SO FAR:\n${priorTurns.map((t, i) => `[Turn ${i + 1}] Reviewer: ${t.instruction}\n[Turn ${i + 1}] You: ${t.note || "(no response recorded)"}`).join("\n\n")}\n\n` : ""}LATEST MESSAGE FROM REVIEWER:
${instruction}

How to respond:
- Treat the latest message in the context of the conversation so far. If they say "make it a bit less formal," you know what "it" is from prior turns.
- If the message is a specific edit ("swap tool X for Y," "tighten section 03"), make that edit cleanly and touch nothing else.
- If it's a critique or audit ("verify tool picks are current," "make sure research was thorough," "read as a skeptical customer"), use the web_search tool as needed, find weaknesses, and fix them in the plan.
- If it's a question or a discussion turn ("is Quill actually the right pick?", "what would make this stronger?", "spell check" when there are no errors), just answer in your note and return the plan unchanged. Plan changes are not required on every turn. A "no changes this turn" response is fine when the message calls for discussion rather than edits.
- Always preserve the plan's JSON shape from the system prompt. Return the COMPLETE plan — even sections you didn't touch.

Return a single JSON object with TWO top-level fields:

{
  "note": "Your reply to the reviewer, in plain English, 2-6 sentences. If you made changes, describe what you changed and why. If you made none, answer their question or explain why no change was needed. Specific, not generic. This is the visible half of the back-and-forth.",
  "plan": { ...the complete plan JSON following the system-prompt schema... }
}

Your final text output must contain ONLY this JSON object — no preamble, no code fences, no trailing commentary.

ORIGINAL BRIEFING:
${briefing}

CURRENT PLAN JSON:
${JSON.stringify(currentPlan, null, 2)}`,
    },
  ];

  const body = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES },
    ],
    messages: [{ role: "user", content: userContent }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  const searchCount = (json.content || []).filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search"
  ).length;

  const fullText = collectText(json.content);
  if (!fullText.trim()) {
    throw new Error("Anthropic returned no text content");
  }

  // Revision output is a wrapper: { note: "...", plan: {...} }. Pull both.
  const wrapper = parsePlanJson(fullText);
  if (!wrapper || typeof wrapper !== "object") {
    throw new Error("revision returned non-object");
  }
  if (!wrapper.plan || typeof wrapper.plan !== "object") {
    throw new Error("revision missing 'plan' field");
  }
  const plan = wrapper.plan;
  const note = typeof wrapper.note === "string" ? wrapper.note.trim() : "";
  return { plan, note, usage: json.usage || {}, rawText: fullText, searchCount };
}

module.exports = { draftPlan, revisePlan };
