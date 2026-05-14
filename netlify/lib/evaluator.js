// Internal plan evaluator. Calls Opus with web search to score a generated plan
// against the original briefing on six dimensions. Built for prompt iteration —
// not for customer-facing output. The evaluator is held to a strict agnostic
// standard: it can favor no vendor (including Anthropic) and must verify every
// tool with a fresh web search before scoring it.

const https = require("https");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 16000;
const MAX_WEB_SEARCHES = 12;

const SYSTEM_PROMPT = `You are an independent evaluator of AI-assistance plans written for non-technical people. Your role is to score plans rigorously and surface gaps the plan-writer missed.

You are completely agnostic. You favor no vendor, no ecosystem, no model family — including Anthropic and Claude. You have no allegiance to popular tools. A tool's name recognition is not evidence of fitness. If a smaller or newer tool genuinely fits the person better, you say so.

You are evaluating a plan that was written by another AI. Your job is to find what's wrong, what's missing, and what's weak — not to defend the work. Skepticism is the default stance.

For every tool the plan recommends, you must:
1. Verify the tool exists and is currently maintained (web search).
2. Verify it is genuinely AI-first — its primary value must come from generative AI or LLMs, not from being a generic SaaS that happens to have an "AI feature" tacked on.
3. Identify at least one credible alternative and assess whether the plan's pick is actually the strongest match for this specific person.

An "AI tool" for this evaluation means: a tool whose core utility is generative AI (LLMs, voice-to-text powered by transformers, image generation, AI agents, AI-augmented research). Password managers, generic cloud storage, traditional task managers, and most pre-2023 SaaS are NOT AI tools — even if they're useful.

Search the web aggressively. You have a generous search budget. Use it. Do not score any tool from memory; memory is where bias lives. If you find yourself thinking "I know this tool is good," stop and search.

Output your evaluation as structured JSON via the submit_evaluation tool. Be specific. Cite concrete passages from the plan. Name specific alternatives. Vague critiques are useless.`;

const EVAL_SCHEMA = {
  type: "object",
  required: [
    "scores",
    "tool_audit",
    "missed_opportunities",
    "summary",
    "verdict",
  ],
  properties: {
    scores: {
      type: "object",
      description: "Score each dimension 1-10. 1 = fails completely, 5 = mediocre, 10 = exemplary.",
      required: [
        "ai_tool_purity",
        "tool_currency",
        "vendor_agnosticism",
        "persona_fit",
        "coverage",
        "specificity",
      ],
      properties: {
        ai_tool_purity: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "% of recommendations that are genuinely AI-first. Cite specific tools that don't qualify.",
            },
          },
        },
        tool_currency: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "Are recommendations current and well-maintained? Any tools that have been eclipsed by stronger newer options?",
            },
          },
        },
        vendor_agnosticism: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "Does the plan over-concentrate on one ecosystem (Microsoft, Google, OpenAI, Anthropic, etc.)? Count vendors and flag concentration.",
            },
          },
        },
        persona_fit: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "Do recommendations match this person's budget, devices, comfort level, and privacy/cloud posture from the briefing?",
            },
          },
        },
        coverage: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "Does the plan address the friction they named AND the magic-wand wish? Or does it solve different problems?",
            },
          },
        },
        specificity: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "Does the plan feel written for THIS person, or could it be sent to anyone in their situation with names swapped?",
            },
          },
        },
      },
    },
    tool_audit: {
      type: "array",
      description: "One entry per tool recommended in the plan.",
      items: {
        type: "object",
        required: ["tool_name", "is_ai_tool", "is_current", "fits_persona", "notes"],
        properties: {
          tool_name: { type: "string" },
          is_ai_tool: {
            type: "boolean",
            description: "Is the tool's core value AI-first (vs. a generic SaaS)?",
          },
          is_current: {
            type: "boolean",
            description: "Is the tool currently maintained and not eclipsed by a clearly stronger alternative?",
          },
          fits_persona: {
            type: "boolean",
            description: "Does this match the persona's budget / devices / comfort / privacy posture?",
          },
          stronger_alternative: {
            type: "string",
            description: "If a clearly better alternative exists for this exact use case, name it. Empty if the pick is solid.",
          },
          notes: {
            type: "string",
            description: "Specific concerns or commendations. Be concrete.",
          },
        },
      },
    },
    missed_opportunities: {
      type: "array",
      description: "Tools or recommendations the plan should have included but didn't. Pull from your independent research.",
      items: {
        type: "object",
        required: ["category", "suggested_tool", "why"],
        properties: {
          category: {
            type: "string",
            description: "What category of need this addresses (e.g., 'meeting transcription', 'document Q&A', 'voice-to-text').",
          },
          suggested_tool: { type: "string" },
          why: {
            type: "string",
            description: "Why this would have been a strong fit for this specific person.",
          },
        },
      },
    },
    summary: {
      type: "string",
      description: "One paragraph (3-5 sentences) summarizing the plan's strengths and weaknesses. Direct, specific. No hedging.",
    },
    verdict: {
      type: "string",
      enum: ["strong", "acceptable", "weak", "rework"],
      description: "Overall judgment. 'strong' = ship; 'acceptable' = ship but note issues; 'weak' = ship only if customer is forgiving; 'rework' = do not ship as-is.",
    },
  },
};

function callAnthropic(apiKey, body) {
  const payload = JSON.stringify(body);
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
    req.on("error", (err) => reject(err));
    req.on("timeout", () => req.destroy(new Error("Anthropic request timed out after 10 minutes")));
    req.write(payload);
    req.end();
  });
}

function collectText(contentArray) {
  return (contentArray || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
}

async function evaluatePlan({ briefing, plan, apiKey }) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const userText =
`Evaluate the AI-assistance plan below against the original briefing.

WORKFLOW:
1. Read the briefing ONLY. Independently identify the 3-5 tool categories this person most needs.
2. For each category, web-search for current strong AI tools. Find at least 2-3 options per category. Note their differences. Do NOT skip the search — your judgment from memory is not trusted.
3. NOW read the plan. For each tool the plan recommends:
   a. Web-search the tool name to verify it exists and is current.
   b. Confirm it's genuinely AI-first (not a SaaS with a bolted-on "AI" feature).
   c. Decide whether the plan's pick is the strongest fit for this specific person, or whether a tool from your independent research would have been better.
4. Score on all six dimensions. Be specific in every "reason" field — name tools, cite plan passages.
5. List "missed opportunities" — tools your independent research surfaced that the plan should have included.
6. Write the one-paragraph summary.
7. Invoke submit_evaluation as your final action.

CRITICAL: You are evaluating, not writing a plan. Do not be polite. If recommendations are weak, say so directly. If the plan is good, say so directly. Hedging language ("could be improved", "might consider") is a failure mode.

=== ORIGINAL BRIEFING ===
${briefing}

=== PLAN BEING EVALUATED ===
${JSON.stringify(plan, null, 2)}`;

  const body = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: MAX_WEB_SEARCHES,
      },
      {
        name: "submit_evaluation",
        description: "Submit the final structured evaluation. Call this exactly once, as your final action, after completing web research and scoring.",
        input_schema: EVAL_SCHEMA,
      },
    ],
    messages: [
      { role: "user", content: [{ type: "text", text: userText }] },
    ],
  };

  let json = await callAnthropic(apiKey, body);
  const searchCount = (json.content || []).filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search"
  ).length;

  let toolUseBlock = (json.content || []).find(
    (b) => b.type === "tool_use" && b.name === "submit_evaluation"
  );

  if (!toolUseBlock) {
    console.warn("[evaluator] submit_evaluation not invoked — retrying");
    const retryBody = {
      ...body,
      messages: [
        ...body.messages,
        { role: "assistant", content: json.content },
        {
          role: "user",
          content: "You did not invoke submit_evaluation. Please invoke submit_evaluation now with the complete structured evaluation.",
        },
      ],
    };
    json = await callAnthropic(apiKey, retryBody);
    toolUseBlock = (json.content || []).find(
      (b) => b.type === "tool_use" && b.name === "submit_evaluation"
    );
    if (!toolUseBlock) {
      throw new Error("Evaluator did not invoke submit_evaluation after retry");
    }
  }

  return {
    evaluation: toolUseBlock.input,
    usage: json.usage || {},
    rawText: collectText(json.content),
    searchCount,
  };
}

module.exports = { evaluatePlan };
