// Calls the Anthropic API to draft a plan from a briefing block.
// No SDK — plain fetch, same as the Resend call in submission-created.js.
// Uses prompt caching on the stable inputs (system prompt + reference plans)
// so every call after the first is roughly 10x cheaper.

const fs = require("fs");
const path = require("path");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 8192;

const PROMPT_PATH = path.join(__dirname, "..", "plan-template", "prompt.md");
const SAMPLE_DIR = path.join(__dirname, "..", "..", "examples");

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function parsePlanJson(text) {
  // Be tolerant: if Claude wraps in ```json ... ``` or adds trailing prose,
  // grab the outermost JSON object.
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

async function draftPlan({ briefing, apiKey }) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const systemPrompt = readFile(PROMPT_PATH);
  const frankSample = readFile(path.join(SAMPLE_DIR, "semi-retired", "index.html"));
  const priyaSample = readFile(path.join(SAMPLE_DIR, "busy-professional", "index.html"));

  // User message: two reference plans (cached) followed by the actual briefing.
  // cache_control markers allow Anthropic to cache the big stable chunks.
  const userContent = [
    {
      type: "text",
      text: `Reference plan #1 — Frank, semi-retired. This is the voice and quality bar:\n\n${frankSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Reference plan #2 — Priya, busy professional. Same voice, different persona:\n\n${priyaSample}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Now draft the plan for this respondent. Return the JSON object specified in the system prompt — no prose, no code fences, no trailing commentary.\n\n${briefing}`,
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
  const textBlock = (json.content || []).find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("Anthropic returned no text content");
  }

  const plan = parsePlanJson(textBlock.text);

  // Pass back usage numbers so we can log cost per plan.
  return {
    plan,
    usage: json.usage || {},
    rawText: textBlock.text,
  };
}

module.exports = { draftPlan };
