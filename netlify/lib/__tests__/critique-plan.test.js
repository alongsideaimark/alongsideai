const assert = require("assert");
const { checkRules } = require("../critique-plan");

// Build a plausible plan skeleton so individual checks have something to find.
function buildBasePlan(overrides = {}) {
  return {
    first_name: "Test",
    prepared_for_name: "Test Person",
    prepared_for_tagline: "tagline",
    observations: ["First observation about their work.", "Second.", "Third.", "Fourth.", "Fifth."],
    picking: { title: "Title", lede: "Lede.", extra_paragraph: "" },
    tools_lede: "Lede.",
    foundation_tally: "3 items",
    foundation_tools: [
      {
        name: "Tool A",
        cost: "$10/mo",
        conditional: false,
        build_it_yourself: false,
        what_it_is: "Description.",
        why_it_helps_you: "Helps.",
        what_it_wont_fix: "Wont.",
        setup_steps: ["s1", "s2", "s3", "s4", "s5"],
        setup_tip: "Tip.",
        prompts: [],
      },
    ],
    ai_tally: "1 item",
    ai_tools: [
      {
        name: "AI Tool",
        cost: "$20/mo",
        conditional: false,
        build_it_yourself: false,
        what_it_is: "Description.",
        why_it_helps_you: "Helps.",
        what_it_wont_fix: "Wont.",
        setup_steps: ["s1", "s2", "s3", "s4", "s5"],
        setup_tip: "Tip.",
        prompts: [
          { label: "p1", text: "prompt one", note: "note" },
          { label: "p2", text: "prompt two", note: "note" },
        ],
      },
    ],
    custom_build: {
      title: "Title",
      lede: "Lede.",
      project_name: "Project",
      project_pitch: "Pitch.",
      platform: "Platform",
      platform_cost: "$0",
      setup_steps: ["s1", "s2", "s3", "s4"],
      setup_tip: "Tip.",
      system_prompt_label: "Label",
      system_prompt: "You help with their specific work. Keep responses brief.",
      system_prompt_note: "Note.",
      test_queries: [],
      iteration_tip: "Tip.",
    },
    ruled_out: { lede: "Lede.", items: [] },
    practice: { title: "Title", lede: "Lede.", rows: [], weekly_total: "0", caveat: "" },
    rollout: {
      lede: "Lede.",
      week1: { time: "1h", summary: "S", bullets: ["b"] },
      week2: { time: "1h", summary: "S", bullets: ["b"] },
      checkin_note: "Note.",
    },
    guardrails: {
      lede: "Lede.",
      never_items: [], caution_items: [], safe_items: [], wrong_items: [], cancel_items: [],
    },
    numbers: {
      title: "Title", lede: "Lede.",
      software_lines: [], software_total: "$0",
      implementation_lines: [], implementation_total: "",
      net_note_heading: "Heading", net_note_body: "Body.",
    },
    team_handoffs: [],
    day30_worksheet: { intro: "Intro.", metrics: [] },
    milestones: { month3: "M3", month6: "M6", month12: "M12" },
    ...overrides,
  };
}

// 1. Clean plan — no issues
const cleanResult = checkRules(buildBasePlan());
assert.strictEqual(cleanResult.hardFails.length, 0, "clean plan should have no hard fails");
assert.strictEqual(cleanResult.softFails.length, 0, "clean plan should have no soft fails");
console.log("PASS: clean plan produces no issues");

// 2. Banned phrase — hard fail
const bannedResult = checkRules(buildBasePlan({
  tools_lede: "These tools will supercharge your workflow.",
}));
assert.ok(bannedResult.hardFails.some((i) => i.rule === "banned_phrase" && /supercharge/i.test(i.detail)), "should catch 'supercharge'");
console.log("PASS: banned phrase caught");

// 3. Banned phrase as substring should NOT trigger (word boundary)
const substringResult = checkRules(buildBasePlan({
  tools_lede: "Their workflow includes empowerment training.",  // "empower" inside "empowerment" — should match
}));
// "empower" with word boundary \b should match "empowerment" because empower-ment has a word break? No — \b is between word/non-word. "empowerment" is a single word, so \bempower\b would not match the whole "empowerment". But \bempower would match the prefix. Our regex is \bempower\b — both boundaries required. So "empowerment" should NOT match (no \b after "empower").
// Sanity: confirm
assert.strictEqual(substringResult.hardFails.filter((i) => i.rule === "banned_phrase").length, 0, "'empowerment' should NOT trigger banned phrase 'empower' due to word boundary");
console.log("PASS: word boundary respected (empowerment ≠ empower)");

// 4. Hyphenated banned phrase — case-insensitive
const hyphenResult = checkRules(buildBasePlan({
  picking: { title: "Title", lede: "A Cutting-Edge solution.", extra_paragraph: "" },
}));
assert.ok(hyphenResult.hardFails.some((i) => i.rule === "banned_phrase" && /cutting-edge/i.test(i.detail)), "should catch hyphenated 'cutting-edge'");
console.log("PASS: hyphenated banned phrase caught");

// 5. Bracket placeholder — hard fail
const bracketResult = checkRules(buildBasePlan({
  observations: ["A plan for [Name] in [their industry].", "Two.", "Three.", "Four.", "Five."],
}));
assert.ok(bracketResult.hardFails.some((i) => i.rule === "bracket_placeholder"), "should catch [Name] placeholder");
console.log("PASS: bracket placeholder caught");

// 6. Reference opener — soft fail
const openerResult = checkRules(buildBasePlan({
  observations: ["You sold the business last year.", "Two.", "Three.", "Four.", "Five."],
}));
assert.ok(openerResult.softFails.some((i) => i.rule === "reference_opener"), "should flag 'You sold' opener");
assert.strictEqual(openerResult.hardFails.filter((i) => i.rule === "reference_opener").length, 0, "reference opener should be soft, not hard");
console.log("PASS: reference opener flagged as soft fail");

// 7. system_prompt too long — hard fail
const longPromptResult = checkRules(buildBasePlan({
  custom_build: { ...buildBasePlan().custom_build, system_prompt: "x".repeat(2000) },
}));
assert.ok(longPromptResult.hardFails.some((i) => i.rule === "system_prompt_too_long"), "should catch system_prompt > 1500 chars");
console.log("PASS: long system_prompt caught");

// 8. Too few setup steps — soft fail
const fewStepsPlan = buildBasePlan();
fewStepsPlan.foundation_tools[0].setup_steps = ["only", "two"];
const fewStepsResult = checkRules(fewStepsPlan);
assert.ok(fewStepsResult.softFails.some((i) => i.rule === "tool_setup_steps_too_few"), "should flag tools with < 4 setup steps");
console.log("PASS: too few setup steps flagged");

// 9. Too few prompts on AI tool — soft fail
const fewPromptsPlan = buildBasePlan();
fewPromptsPlan.ai_tools[0].prompts = [{ label: "p1", text: "p", note: "n" }];
const fewPromptsResult = checkRules(fewPromptsPlan);
assert.ok(fewPromptsResult.softFails.some((i) => i.rule === "ai_tool_prompts_too_few"), "should flag AI tools with < 2 prompts");
console.log("PASS: too few AI prompts flagged");

// 10. insufficient_input plan — skipped
const insufficientResult = checkRules({ insufficient_input: true, missing: ["work"], note: "thin" });
assert.strictEqual(insufficientResult.hardFails.length, 0, "insufficient_input should not be critiqued");
assert.strictEqual(insufficientResult.softFails.length, 0);
console.log("PASS: insufficient_input plan skipped");

// 11. Null/non-object — hard fail
const nullResult = checkRules(null);
assert.ok(nullResult.hardFails.some((i) => i.rule === "structure"), "null plan should hard-fail structurally");
console.log("PASS: null plan hard-fails");

console.log("\nAll critique-plan tests passed.");
