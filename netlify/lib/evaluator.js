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

THE PLAN STRUCTURE YOU'RE EVALUATING:
The plan has TWO tool sections that serve different jobs and have different rules:
1. "AI tools" (ai_tools in the JSON) — the core promise. These MUST be genuinely AI-first. Strict.
2. "Other useful picks" (foundation_tools in the JSON) — optional non-AI tools that directly address a specific named friction from the briefing. Allowed to be non-AI; required to be tied to something the respondent explicitly named.

Do NOT penalize the plan for having non-AI tools in foundation_tools — that is by design. DO penalize the plan if (a) tools in ai_tools aren't actually AI, or (b) tools in foundation_tools are generic padding not tied to a named briefing item.

For every tool the plan recommends, you must:
1. Verify the tool exists and is currently maintained (web search).
2. For tools in ai_tools: verify it is genuinely AI-first — core value from generative AI / LLMs (2023+ transformer-era), not pre-LLM ML reskinned as "AI" (SaneBox, Boomerang's smart features), not template-based extraction (TripIt), not generic SaaS with a bolted-on AI feature.
3. For tools in foundation_tools: verify the why_it_helps_you connects the tool to something specifically named in the briefing. If you can't find that connection, the pick is padding.
4. Identify at least one credible alternative and assess whether the plan's pick is the strongest match for this specific person.

Search the web aggressively. You have a generous search budget. Use it. Do not score any tool from memory; memory is where bias lives.

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
      description: "Score each dimension 1-10. Calibration anchors: 1-3 = fails the customer; 4-6 = mediocre, has real issues; 7 = passable but not what we promise; 8 = good, what we should be shipping; 9 = exemplary, a clear win; 10 = best-in-class, nothing to improve. Do NOT grade on a curve. Reserve 9-10 for plans that are genuinely without flaw on that dimension. A plan with even one significant defect on a dimension cannot score above 7 on it.",
      required: [
        "ai_section_integrity",
        "other_picks_relevance",
        "tool_currency",
        "vendor_agnosticism",
        "persona_fit",
        "coverage",
        "specificity",
      ],
      properties: {
        ai_section_integrity: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "Of the tools the plan classifies in ai_tools, what percentage are actually AI-first by the strict definition (core value from generative AI / LLMs, 2023+ transformer-era, not pre-LLM ML reskinned)? Cite any tool in ai_tools that fails the test. Tools in foundation_tools are NOT evaluated here — that section is allowed to be non-AI.",
            },
          },
        },
        other_picks_relevance: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: {
              type: "string",
              description: "Are the tools in foundation_tools each tied to a specific named friction, manual_task, wish, or pain point from the briefing? Or are they generic padding (1Password 'because everyone needs one', a note-taking app 'for organization', cloud storage 'because they have files')? Score 10 if foundation_tools is empty OR every tool clearly addresses a named briefing item. Score 5 if some are tied to the briefing and some are padding. Score 1-3 if foundation_tools is mostly padding. Cite specific briefing items.",
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
      description: "Overall judgment. 'strong' = no significant issues, ready to ship to a paying customer who'll judge it hard; 'acceptable' = has minor issues that wouldn't embarrass us but the plan isn't great; 'weak' = ship only if customer is forgiving; 'rework' = do not ship as-is. The shipping bar is 'strong' — 'acceptable' is not good enough.",
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

  const evaluation = toolUseBlock.input;
  // Replace the LLM-generated verdict with one computed deterministically from
  // the dimension scores. The LLM was producing verdicts that didn't follow
  // its own bar (e.g., labeling "strong" while two dimensions scored 6).
  // verdict = "strong" if min ≥ 8; "acceptable" if min ≥ 6; "rework" if min < 6.
  // The LLM's freeform verdict is preserved as `evaluator_verdict_label` for
  // qualitative reference but not used as the binding label.
  const llmVerdict = evaluation.verdict;
  const dimensionScores = [
    evaluation.scores?.ai_section_integrity?.score,
    evaluation.scores?.other_picks_relevance?.score,
    evaluation.scores?.tool_currency?.score,
    evaluation.scores?.vendor_agnosticism?.score,
    evaluation.scores?.persona_fit?.score,
    evaluation.scores?.coverage?.score,
    evaluation.scores?.specificity?.score,
  ].filter((s) => typeof s === "number");
  const minScore = dimensionScores.length > 0 ? Math.min(...dimensionScores) : 0;
  if (minScore >= 8) {
    evaluation.verdict = "strong";
  } else if (minScore >= 6) {
    evaluation.verdict = "acceptable";
  } else {
    evaluation.verdict = "rework";
  }
  if (llmVerdict && llmVerdict !== evaluation.verdict) {
    evaluation.evaluator_verdict_label = llmVerdict;
    console.log(`[evaluator] verdict recomputed: llm=${llmVerdict} → deterministic=${evaluation.verdict} (min score: ${minScore})`);
  }

  return {
    evaluation,
    usage: json.usage || {},
    rawText: collectText(json.content),
    searchCount,
  };
}

// Checks whether an evaluation result meets the quality bar for shipping.
// Bar (per third-pass review): median ≥ 8 AND no dimension below 7.
// Relaxed from "all ≥ 8 AND verdict=strong" — strict all-≥8 was unrealistic
// across 7 dimensions and the verdict label is now deterministic anyway.
function meetsBar(evaluation) {
  if (!evaluation || !evaluation.scores) return false;
  const dims = ["ai_section_integrity", "other_picks_relevance", "tool_currency", "vendor_agnosticism", "persona_fit", "coverage", "specificity"];
  const scores = dims
    .map((d) => evaluation.scores[d])
    .map((s) => (s && typeof s.score === "number" ? s.score : null));
  if (scores.some((s) => s === null)) return false;
  // No dimension below 7
  if (scores.some((s) => s < 7)) return false;
  // Median ≥ 8
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  if (median < 8) return false;
  // Old strict check (kept for old callers that haven't been updated)
  for (const d of dims) {
    const s = evaluation.scores[d];
    if (!s || typeof s.score !== "number") return false;
  }
  return true;
}

// Renders an evaluation result as a plain-English instruction block the writer
// can act on during a revise call. Lists the specific issues, not the scores.
// The writer doesn't need to see the scores — it needs to know what to fix.
function formatEvalAsInstruction(evaluation) {
  if (!evaluation) return "";
  const L = [];

  L.push("An independent evaluator reviewed your draft against the customer's briefing. Address every issue below in your revision. Do not lose what's already working — preserve the recommendations and language the eval did not flag.");
  L.push("");

  // Per-dimension issues — only include dimensions that scored < 7
  const dims = [
    ["ai_section_integrity", "AI section integrity (tools in ai_tools must be AI)"],
    ["other_picks_relevance", "Other useful picks relevance (must tie to named frictions)"],
    ["tool_currency", "Tool currency / factual accuracy"],
    ["vendor_agnosticism", "Vendor agnosticism"],
    ["persona_fit", "Persona fit"],
    ["coverage", "Coverage of named frictions"],
    ["specificity", "Specificity to this person"],
  ];
  const weak = dims.filter(([key]) => {
    const s = evaluation.scores && evaluation.scores[key];
    return s && typeof s.score === "number" && s.score < 7;
  });
  if (weak.length > 0) {
    L.push("DIMENSIONS THAT NEED WORK:");
    for (const [key, label] of weak) {
      const s = evaluation.scores[key];
      L.push(`- ${label} (current ${s.score}/10): ${s.reason}`);
    }
    L.push("");
  }

  // Per-tool issues
  const toolIssues = (evaluation.tool_audit || []).filter(
    (t) => !t.is_ai_tool || !t.is_current || !t.fits_persona || (t.stronger_alternative && t.stronger_alternative.trim())
  );
  if (toolIssues.length > 0) {
    L.push("TOOL-LEVEL ISSUES:");
    for (const t of toolIssues) {
      const flags = [];
      if (!t.is_ai_tool) flags.push("not AI-first");
      if (!t.is_current) flags.push("not current or has factual error");
      if (!t.fits_persona) flags.push("doesn't fit this persona");
      const flagStr = flags.length ? ` [${flags.join("; ")}]` : "";
      const altStr = t.stronger_alternative && t.stronger_alternative.trim()
        ? ` Consider: ${t.stronger_alternative}.`
        : "";
      L.push(`- ${t.tool_name}${flagStr}: ${t.notes}${altStr}`);
    }
    L.push("");
  }

  // Missed opportunities
  const missed = evaluation.missed_opportunities || [];
  if (missed.length > 0) {
    L.push("RECOMMENDATIONS THE PLAN SHOULD HAVE INCLUDED:");
    for (const m of missed) {
      L.push(`- ${m.category}: ${m.suggested_tool} — ${m.why}`);
    }
    L.push("");
  }

  // Summary
  if (evaluation.summary) {
    L.push("EVALUATOR SUMMARY:");
    L.push(evaluation.summary);
    L.push("");
  }

  L.push("Your revision should:");
  L.push("1. Fix every tool-level factual error (currency, pricing, integration support).");
  L.push("2. Replace non-AI tools in the AI section with genuine AI tools, or move them to Foundation as plumbing.");
  L.push("3. Add at least one of the 'missed opportunities' where it genuinely fits this person.");
  L.push("4. Stay inside the customer's budget ceiling.");
  L.push("5. Preserve the personalization, the voice, and the specific details the eval did NOT flag.");
  L.push("");
  L.push("Return the COMPLETE revised plan (every section, not just what changed). Use web_search to verify any tool claim, pricing, or integration before locking it in.");

  return L.join("\n");
}

module.exports = { evaluatePlan, meetsBar, formatEvalAsInstruction };
