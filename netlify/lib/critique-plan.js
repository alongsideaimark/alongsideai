// Layer 1 of the critic pass — deterministic rule checks. Runs after draftPlan
// returns and before the customer email goes out. Hard fails block the customer
// email and route to Mark for manual review. Soft fails ship to the customer
// but flag the internal notification so Mark can spot-check on his own time.
//
// No LLM calls. Runs in milliseconds. Catches the highest-frequency regressions
// (banned phrases, leftover [bracket] placeholders, reference-plan opener leakage,
// length discipline, structural minimums per tool).
//
// A separate Layer 2 module will handle subjective quality (personalization
// depth, custom-build fit, hallucination detection) via a Haiku critic call.

// Pulled verbatim from netlify/plan-template/prompt.md → Voice rules.
// If the prompt's banned list changes, update this list to match.
const BANNED_PHRASES = [
  "supercharge",
  "unlock",
  "transform",
  "revolutionize",
  "game-changer",
  "level up",
  "leverage",
  "empower",
  "harness",
  "seamless",
  "robust",
  "cutting-edge",
];

// Verbatim openers from the reference plans (gold-standard, semi-retired).
// If a real respondent's plan starts with one of these, it's either accurate
// (their briefing said they sold/retired/built something) or it's reference
// leakage. We can't tell deterministically without the briefing, so this is
// a soft fail — Mark verifies against the briefing manually.
const REFERENCE_OPENERS = [
  /^You sold\b/i,
  /^You retired\b/i,
  /^You built\b/i,
];

const SYSTEM_PROMPT_MAX_CHARS = 1500;
const TARGET_PAGES_MAX = 35; // ~8750 words at 250 words/page
const WORDS_PER_PAGE = 250;
const MIN_SETUP_STEPS_PER_TOOL = 4;
const MIN_PROMPTS_PER_AI_TOOL = 2;

// Yields { path, text } for every string-valued field in the plan, recursively.
function* walkStrings(obj, path = "") {
  if (obj == null) return;
  if (typeof obj === "string") {
    yield { path, text: obj };
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      yield* walkStrings(obj[i], `${path}[${i}]`);
    }
  } else if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      yield* walkStrings(obj[k], path ? `${path}.${k}` : k);
    }
  }
}

function checkRules(plan) {
  const hardFails = [];
  const softFails = [];

  if (!plan || typeof plan !== "object") {
    hardFails.push({ rule: "structure", path: "(root)", detail: "Plan is not an object" });
    return { hardFails, softFails };
  }

  // The insufficient_input branch is a known refusal — don't critique it.
  if (plan.insufficient_input) {
    return { hardFails, softFails };
  }

  // --- Per-string checks (banned phrases, bracket placeholders) ---
  for (const { path, text } of walkStrings(plan)) {
    for (const phrase of BANNED_PHRASES) {
      // Word-boundary regex; case-insensitive. Hyphenated phrases need escaping.
      const escaped = phrase.replace(/[-]/g, "\\-");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(text)) {
        hardFails.push({
          rule: "banned_phrase",
          path,
          detail: `Contains banned phrase "${phrase}"`,
        });
      }
    }
    // Literal [bracket] placeholders that should have been filled in.
    // Match [Word...] but skip pure numeric like [1] (JSON path artifacts won't appear in field text anyway).
    const bracketMatch = text.match(/\[[A-Za-z][^\]]{0,80}\]/);
    if (bracketMatch) {
      hardFails.push({
        rule: "bracket_placeholder",
        path,
        detail: `Contains literal placeholder "${bracketMatch[0]}"`,
      });
    }
  }

  // --- system_prompt length ---
  if (plan.custom_build && typeof plan.custom_build.system_prompt === "string") {
    const len = plan.custom_build.system_prompt.length;
    if (len > SYSTEM_PROMPT_MAX_CHARS) {
      hardFails.push({
        rule: "system_prompt_too_long",
        path: "custom_build.system_prompt",
        detail: `${len} chars (max ${SYSTEM_PROMPT_MAX_CHARS})`,
      });
    }
  }

  // --- Reference-plan opener leakage on first observation ---
  if (Array.isArray(plan.observations) && plan.observations.length > 0) {
    const first = String(plan.observations[0] || "").trim();
    for (const opener of REFERENCE_OPENERS) {
      if (opener.test(first)) {
        softFails.push({
          rule: "reference_opener",
          path: "observations[0]",
          detail: `First observation opens with a reference-plan pattern (${opener.source}). Verify against briefing — could be accurate or could be leakage.`,
        });
        break;
      }
    }
  }

  // --- Estimated page count ---
  let totalWords = 0;
  for (const { text } of walkStrings(plan)) {
    totalWords += text.trim().split(/\s+/).filter(Boolean).length;
  }
  const estPages = Math.ceil(totalWords / WORDS_PER_PAGE);
  if (estPages > TARGET_PAGES_MAX) {
    softFails.push({
      rule: "plan_too_long",
      path: "(global)",
      detail: `Estimated ${estPages} pages / ${totalWords} words (target 22-25 pages, max ${TARGET_PAGES_MAX})`,
    });
  }

  // --- Per-tool: setup_steps count ---
  for (const group of ["foundation_tools", "ai_tools"]) {
    if (Array.isArray(plan[group])) {
      plan[group].forEach((tool, i) => {
        const steps = Array.isArray(tool.setup_steps) ? tool.setup_steps.length : 0;
        if (steps < MIN_SETUP_STEPS_PER_TOOL) {
          softFails.push({
            rule: "tool_setup_steps_too_few",
            path: `${group}[${i}].setup_steps`,
            detail: `Only ${steps} setup steps (min ${MIN_SETUP_STEPS_PER_TOOL}) for "${tool.name || "(unnamed)"}"`,
          });
        }
      });
    }
  }

  // --- Per-AI-tool: copy-paste prompts count ---
  if (Array.isArray(plan.ai_tools)) {
    plan.ai_tools.forEach((tool, i) => {
      const prompts = Array.isArray(tool.prompts) ? tool.prompts.length : 0;
      if (prompts < MIN_PROMPTS_PER_AI_TOOL) {
        softFails.push({
          rule: "ai_tool_prompts_too_few",
          path: `ai_tools[${i}].prompts`,
          detail: `Only ${prompts} copy-paste prompts (min ${MIN_PROMPTS_PER_AI_TOOL}) for "${tool.name || "(unnamed)"}"`,
        });
      }
    });
  }

  return { hardFails, softFails };
}

// === LAYER 2 — LLM CRITIC ===
// Subjective quality dimensions that deterministic rules can't catch:
// personalization depth, custom-build fit, tool selection, ruled-out section
// quality, hallucination detection, voice. Single Haiku call (~$0.01 per plan).
//
// Returns null on failure (no API key, network error, malformed response) so
// Layer 1's verdict stands and the plan still ships if Layer 1 was clean.
// Never blocks deploys on Layer 2 errors.

const https = require("https");

const CRITIC_MODEL = "claude-haiku-4-5";
const CRITIC_MAX_TOKENS = 2000;

const CRITIC_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["ship", "review", "block"],
      description: "ship = clean, send to customer. review = soft issues, customer gets it but Mark spot-checks. block = do not send, route to manual review.",
    },
    score: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      description: "Overall plan quality 1-10. 8-10 = ship, 5-7 = review, 1-4 = block.",
    },
    summary: {
      type: "string",
      description: "One sentence on why this verdict, citing the most important factor.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "How confident you are in the verdict (0-1).",
    },
    issues: {
      type: "array",
      description: "Specific issues found, with field paths. Empty array if none.",
      items: {
        type: "object",
        properties: {
          dimension: {
            type: "string",
            enum: ["personalization", "tool_fit", "custom_build", "ruled_out", "hallucination", "voice"],
          },
          severity: { type: "string", enum: ["info", "warn", "critical"] },
          path: { type: "string", description: "JSON path inside the plan, e.g. \"custom_build.system_prompt\" or \"ai_tools[1].why_it_helps_you\"." },
          issue: { type: "string", description: "One-sentence problem statement." },
        },
        required: ["dimension", "severity", "path", "issue"],
      },
    },
  },
  required: ["verdict", "score", "summary", "confidence", "issues"],
};

const RUBRIC_SYSTEM_PROMPT = `You are a quality critic for personalized AI plans produced by Alongside AI. Your job is to read a plan and decide whether it should ship to the customer as-is, get a manual spot-check from the team, or be blocked from sending entirely.

You are NOT a writer or editor. You don't fix anything. You assess.

You will be given:
1. The original briefing about the customer (their work, pain, goals, current tools)
2. The generated plan (JSON object) drafted from the briefing

Score the plan against these dimensions. Be honest — overpraising leads to bad plans reaching customers.

## Personalization (most important)
Does the plan demonstrate the model READ the briefing, or does it look like a template with names swapped in?

- HIGH: Plan quotes specific phrases from the briefing back to the customer (≥3 direct or near-direct references). References their named profession, tools, and pain points concretely. Custom build's system_prompt is so specific it could ONLY apply to this person.
- MEDIUM: Plan mentions the customer's situation in general terms but doesn't quote them. System_prompt is plausible but generic enough to fit most people.
- LOW: Plan is essentially a template with first_name swapped in. Custom build prompts about "your specific work" without naming what that work is.

## Tool selection fit
Are recommended tools actually appropriate for THIS person's profession and pain points, or the same 5 generic tools every plan would have?

- HIGH: At least one tool is niche-specific to their profession or industry. Justifications connect each tool to a specific pain the briefing named.
- MEDIUM: Tools are generic but justifications attempt to tie them to the briefing.
- LOW: Tools look auto-recommended. Same lineup that would appear in any plan regardless of persona.

## Custom build fit
Is Section 05's custom build genuinely fitted to a problem they cannot solve with off-the-shelf tools, or a forced inclusion?

- HIGH: Addresses a problem the briefing explicitly named — especially their magic-wand answer. system_prompt is filled with their actual context.
- MEDIUM: Plausible but feels grafted on.
- LOW: Template variant — any persona would get a similar one.

## Ruled-out section quality
Does the "considered and ruled out" section do real work — naming tools the customer might expect to see and explaining why they're wrong for THIS person?

- HIGH: Rules out 2-3 tools the customer likely heard of, with reasons referencing their stated constraints.
- MEDIUM: Generic tools, generic reasons.
- LOW: Strawman. Rules out things no reasonable person would consider, or skips tools they ARE considering.

## Hallucination / fabrication
Specific facts, numbers, case studies, or features that look invented?

- CLEAN: Claims hedged or attributed.
- SUSPICIOUS: Specific dollar savings, success rates, case studies, or named customers-of-tools that look made up.
- HALLUCINATED: Clear fabrication (fake rebate programs, made-up features, invented testimonials).

## Voice
Does the plan sound like the Alongside AI voice (warm, editorial, calm), or slip into AI-marketing-speak even past the banned phrase list?

- HIGH: Reads like a thoughtful human editor wrote it. Specific. Restrained.
- MEDIUM: Mostly fine. Occasional generic transitions.
- LOW: Hyped, generic, AI-flavored even without banned phrases.

## Verdict mapping

- **ship** — Personalization HIGH, Tool fit HIGH or MEDIUM, Hallucination CLEAN, no other LOW dimensions. Score 8-10.
- **review** — Personalization MEDIUM, no LOW dimensions, Hallucination CLEAN. Score 5-7. Mark spot-checks at his pace.
- **block** — Personalization LOW, OR Hallucination SUSPICIOUS/HALLUCINATED, OR Tool fit LOW, OR Custom build LOW. Score 1-4.

Most plans should land in **review** if personalization is decent. **ship** is reserved for plans that genuinely show the model understood this specific person. **block** means a customer should not see this plan as-is.

When you call submit_critique, list each issue with its dimension, severity (info / warn / critical), the JSON path inside the plan (like "custom_build.system_prompt" or "ai_tools[1].why_it_helps_you"), and a one-sentence problem statement. Empty issues array is fine if the plan is clean.`;

function callAnthropic(apiKey, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
      timeout: 90 * 1000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Anthropic ${res.statusCode}: ${raw}`));
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch (err) { reject(new Error(`Critic returned unparsable JSON: ${err.message}`)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Critic request timed out")));
    req.write(payload);
    req.end();
  });
}

async function critiquePlanLlm({ plan, briefing, apiKey }) {
  const userMessage = `## Briefing

${briefing}

## Generated plan (JSON)

${JSON.stringify(plan, null, 2)}

Now critique this plan against the rubric and call submit_critique.`;

  const body = {
    model: CRITIC_MODEL,
    max_tokens: CRITIC_MAX_TOKENS,
    system: RUBRIC_SYSTEM_PROMPT,
    tools: [{
      name: "submit_critique",
      description: "Submit your critique of the plan. Call exactly once.",
      input_schema: CRITIC_SCHEMA,
    }],
    tool_choice: { type: "tool", name: "submit_critique" },
    messages: [{ role: "user", content: userMessage }],
  };

  const json = await callAnthropic(apiKey, body);
  const block = (json.content || []).find((b) => b.type === "tool_use" && b.name === "submit_critique");
  if (!block) {
    throw new Error("Critic did not invoke submit_critique");
  }
  return block.input;
}

// Orchestrator: runs Layer 1 (deterministic), then Layer 2 (LLM critic) if
// Layer 1 was clean. Layer 2 failures are swallowed — Layer 1's verdict stands.
// criticFn is injectable so tests can stub the API call.
async function critique({ plan, briefing, apiKey, criticFn = critiquePlanLlm }) {
  const layer1 = checkRules(plan);

  // If Layer 1 already blocked, skip the Layer 2 call to save the API spend.
  if (layer1.hardFails.length > 0) {
    return { ...layer1, layer2: null };
  }

  // Skip Layer 2 if no API key or explicitly disabled.
  if (!apiKey || process.env.SKIP_LLM_CRITIC === "1") {
    return { ...layer1, layer2: null };
  }

  let layer2;
  try {
    layer2 = await criticFn({ plan, briefing, apiKey });
  } catch (err) {
    console.warn(`[critique] Layer 2 failed, ignoring: ${err.message}`);
    return { ...layer1, layer2: null };
  }

  // Merge Layer 2 issues into hard/soft fail buckets based on verdict + severity.
  const hardFails = [...layer1.hardFails];
  const softFails = [...layer1.softFails];

  for (const issue of layer2.issues || []) {
    const item = {
      rule: `llm:${issue.dimension}`,
      path: issue.path,
      detail: issue.issue,
    };
    if (layer2.verdict === "block" && issue.severity === "critical") {
      hardFails.push(item);
    } else {
      softFails.push(item);
    }
  }

  // If verdict is block but no critical-severity issues were itemized,
  // synthesize a hard fail from the summary so routing still works.
  if (layer2.verdict === "block" && !hardFails.some((f) => f.rule.startsWith("llm:"))) {
    hardFails.push({
      rule: "llm:verdict_block",
      path: "(global)",
      detail: layer2.summary || "Critic blocked the plan with no specific issues itemized.",
    });
  }

  return {
    hardFails,
    softFails,
    layer2: {
      verdict: layer2.verdict,
      score: layer2.score,
      summary: layer2.summary,
      confidence: layer2.confidence,
    },
  };
}

module.exports = {
  checkRules,
  critique,
  critiquePlanLlm,
  BANNED_PHRASES,
  REFERENCE_OPENERS,
  RUBRIC_SYSTEM_PROMPT,
};
