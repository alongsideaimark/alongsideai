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

module.exports = { checkRules, BANNED_PHRASES, REFERENCE_OPENERS };
