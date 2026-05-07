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
const https = require("https");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 24000;
const MAX_WEB_SEARCHES = 8;

const PROMPT_PATH = path.join(__dirname, "..", "plan-template", "prompt.md");
const REF_DIR = path.join(__dirname, "reference-plans");

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function callAnthropic(apiKey, body) {
  const payload = JSON.stringify(body);
  console.log(`[call-claude] request payload size: ${(payload.length / 1024).toFixed(1)}KB`);

  return new Promise((resolve, reject) => {
    const url = new URL(ANTHROPIC_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
      timeout: 10 * 60 * 1000,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Anthropic ${res.statusCode}: ${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Anthropic returned unparsable JSON: ${err.message}`));
        }
      });
    });

    req.on("error", (err) => {
      console.error(`[call-claude] request error:`, err.message);
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy(new Error("Anthropic request timed out after 10 minutes"));
    });

    req.write(payload);
    req.end();
  });
}

function parsePlanJson(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("no JSON object found in Claude response");
  }
  let candidate = text.slice(firstBrace, lastBrace + 1);
  // Strip control characters that Claude sometimes puts inside JSON strings
  // (literal tabs, newlines, etc.). Replace them with a space so text reads
  // naturally rather than getting concatenated.
  candidate = candidate.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
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
  const margaretSample = readFile(path.join(REF_DIR, "gold-standard.html"));
  const frankSample = readFile(path.join(REF_DIR, "semi-retired.html"));

  const userContent = [
    {
      type: "text",
      text: `Reference plan #1 — Margaret, retired federal judge (GOLD STANDARD). This is the FORMAT and QUALITY BAR only. Study the structure: (1) "Getting started — step by step" walkthroughs on every tool, (2) copy-paste prompt boxes on AI tools, (3) Guardrails section with never/caution/safe items and cancellation instructions. Every plan you draft must include all of these structural elements.\n\nCRITICAL: Margaret's specific tool picks (1Password, Otter, NotebookLM, etc.) are for a retired federal judge. They are almost certainly WRONG for the next respondent. You MUST research fresh tools for each person's specific profession, industry, and pain points using web_search. A plan that recommends the same tools as Margaret's is a failed plan unless the respondent happens to have the same needs. The whole point of this product is that each plan is original research — not a template with names swapped in.\n\n${margaretSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Reference plan #2 — Frank, semi-retired. Older format — good voice and personalization, but lacks the step-by-step setup walkthroughs, prompts, and guardrails that the gold standard above requires. Use Frank for voice reference only; use Margaret's format for structure:\n\n${frankSample}`,
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

  const json = await callAnthropic(apiKey, body);

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
  const margaretSample = readFile(path.join(REF_DIR, "gold-standard.html"));
  const frankSample = readFile(path.join(REF_DIR, "semi-retired.html"));

  const userContent = [
    {
      type: "text",
      text: `Reference plan #1 — Margaret, retired federal judge (GOLD STANDARD). Format and quality bar — every plan must include step-by-step setup walkthroughs, copy-paste prompts on AI tools, and a full guardrails section:\n\n${margaretSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Reference plan #2 — Frank, semi-retired. Voice reference (older format):\n\n${frankSample}`,
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

  const json = await callAnthropic(apiKey, body);
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
