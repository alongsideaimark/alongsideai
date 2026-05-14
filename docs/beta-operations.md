# Beta operations — the playbook

This is how the plan pipeline is operated during the beta phase. The reviewer log is the input. The triggers gate when to act. The templates standardize what gets asked. The guardrails keep Claude Code from making the prompt worse.

If you're reading this and thinking "the prompt needs another rule" — read the guardrails section first. Almost certainly it doesn't.

---

## The reviewer log — capture this for every plan

Don't make it elaborate. A simple table or markdown file per plan with these fields:

```
plan_id: 2026-05-14-anita
persona_one_line: bakery owner, $50-100, Apple stack
errors_found:
  - field: verification_log.homebase
    issue: cited $24.95, actual $30 per joinhomebase.com
    severity: medium (customer would notice at first bill)
    reviewer_fix: corrected price to $30
  - field: existing_subscriptions_reviewed.square
    issue: enumerated AI features but missed Square Shifts; plan recommended Homebase instead
    severity: high (recommended duplicate purchase)
    reviewer_fix: swapped recommendation to Square Shifts
time_to_review_min: 11
customer_noticed: unknown (track later)
```

That's the unit of evidence. Everything downstream is built on it.

Suggested storage: `docs/review-logs/{plan_id}.md` — one file per plan, committed to the repo. The log accumulates over time as the corpus that drives every future decision.

---

## Trigger rules — when to call Claude Code

The discipline that makes this work is not invoking Claude Code on a single failure. **One failure is noise. Three failures of the same pattern across distinct plans is signal.**

- **Pattern appears 3+ times across distinct personas** → invoke Claude Code with the pattern + the three log entries
- **Reviewer average time exceeds 15 min over a rolling 5-plan window** → invoke Claude Code with the last 5 logs to identify what's bloating review
- **Customer notices an error in a delivered plan** → automatic invocation regardless of count (customer-noticed errors are the highest-priority signal)
- **Quarterly** → invoke Claude Code for a prompt audit against the last 30 plans
- **Otherwise** → don't invoke. Let the logs accumulate.

---

## Instruction templates — paste these to Claude Code

### Template A — recurring pattern fix

> I'm operating an AI plan-writing pipeline. Three production plans (logs attached) show the same failure pattern: [describe pattern in one sentence]. Read the three log entries below. Decide whether the right fix lives in: (a) a prompt edit, (b) a new or modified schema field, (c) a reviewer checklist addition, (d) a deterministic check (price scraper, tools database entry), or (e) accept as residual reviewer territory. Recommend ONE fix with the change shown as a diff against the current prompt.md or reviewer checklist. Do not recommend more than one fix. Do not recommend a prompt rule unless you can argue why (b), (c), and (d) don't fit. The current prompt is attached.

### Template B — review time bloat

> Reviewer time has averaged [X] minutes over the last 5 plans, target is 8. Logs attached. Identify which checklist step is taking longest and recommend how to shorten it — either by moving the check upstream into the schema, automating it deterministically, or removing it if the failures it catches haven't materialized in [N] plans.

### Template C — customer-noticed error

> A customer flagged this error in their delivered plan: [error]. The reviewer didn't catch it. Two questions: (1) was there anything in the populated artifact that should have flagged this during review, that the checklist missed? (2) If nothing was visible in the artifact, what's the smallest change — schema field, reviewer step, or deterministic check — that would have surfaced it? Recommend ONE change.

### Template D — quarterly prompt audit

> Quarterly prompt health check. The current prompt.md is attached, along with reviewer logs from the last 30 plans. For each rule in the prompt body, tell me: did this rule's named failure mode appear in any of the 30 plans? If not, is the rule still earning its slot, or can it be removed? Output a list of removable rules, ranked by confidence.

---

## Guardrails — paste these alongside every invocation

These exist to keep Claude Code honest. The temptation in every session is to add a rule because it feels productive. Most of the time that's the wrong move.

1. **Don't recommend prompt rule additions** unless the pattern is 3+ in distinct plans AND no schema/reviewer/deterministic fix fits. The prompt is done unless evidence forces a change.
2. **Don't recommend running synthetic test batches.** Production data is the test set now.
3. **Don't iterate on rules that already work** (AI classification audit, budget compliance, same-parent justification, the coverage_map field, the verification_log field, the existing_subscriptions_reviewed field). Those are load-bearing.
4. **Show every recommended change as a diff.** No "consider revising the section to..." — show the exact replacement text.
5. **If you recommend more than one change, you've over-recommended.** Pick the one with the highest evidence and stop.

---

## What the workflow looks like, day to day

1. Reviewer goes through plans, fills in log entries, ships the plans. No invocation of Claude Code on individual plans.
2. Once a week (or when a trigger fires), open the accumulated logs. Look for patterns. If three distinct plans show the same issue, invoke Template A with the three log entries. Claude Code returns one recommendation as a diff. Apply it. Move on.
3. If nothing trips a trigger, do nothing. **The loop running with no prompt changes for two weeks is a healthy state, not a problem.** The system is working when you don't have to touch it.

---

## What's load-bearing in the current system (don't touch without strong evidence)

These mechanisms have been validated across multiple personas and rounds of iteration. Removing or modifying them without strong evidence will regress quality:

- **AI classification audit** at position 1 of the final self-check. Moved here from buried mid-prompt; the recency-position is what made it bind.
- **2–4 AI tool count with "honest 2 beats padded 3" guidance.** The floor relaxation removed the structural pressure that caused misclassification.
- **Same-parent justification rule** (replaced the same-company audit). One-sentence visible-to-customer justification is enough; full swap-or-bust traps Claude.
- **AI vs Other useful picks two-section model.** AI is the core; non-AI tools allowed in foundation_tools only when tied to a named friction.
- **The three schema audit fields** (coverage_map, verification_log, existing_subscriptions_reviewed). Force work into the artifact so review can bind.
- **Deterministic verdict computation.** Verdict comes from scores, not LLM discretion.
- **Relaxed meetsBar** (median ≥8, no dim <7). Strict all-≥8 was unrealistic.

If a session proposes touching any of these, demand strong evidence and a clear failure mode the existing mechanism doesn't catch.

---

## What the system explicitly cannot catch (reviewer territory forever)

The reviewer is the backstop for these failure classes — no prompt mechanism will fully address them:

- **Wrong target-customer fit** (e.g., recommending a residential-real-estate tool to a commercial property owner). Step 3 of the reviewer checklist.
- **Stale prices inside the verification_log** (writer claims to have verified but cited stale data). Step 4 of the reviewer checklist.
- **Missed features inside existing_subscriptions_reviewed rows** (the audit ran but missed the relevant feature). Step 5 of the reviewer checklist.
- **Deep domain expertise** for the respondent's specific industry. The reviewer is not a dentist or attorney; the reviewer is checking that the plan looks plausible.

These are not bugs to fix — they're acknowledged residuals the 8-min review is designed to catch.
