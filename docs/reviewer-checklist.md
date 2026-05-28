# Reviewer checklist — 8 minutes per plan

For every plan generated in beta, run this checklist before sending to the customer. No domain expertise required — only the ability to read a marketing page and ask "does this fit?"

The schema fields (`coverage_map`, `verification_log`, `existing_subscriptions_reviewed`) make the writer's work visible. Your job is to spot-check that the visible work is correct.

---

## How to access the plan and audit fields

Pull from the admin API. Replace `{ID}` with the plan ID from the notification email (or list with `?list=1`):

```
GET https://lanternplan.com/.netlify/functions/admin-plans?id={ID}
```

Bearer token in the `Authorization` header (your `ADMIN_API_KEY`).

The response has:
- `plan` — the generated plan content
- `plan.coverage_map` — every named friction → which tool retires it
- `plan.verification_log` — every price/tier/policy claim → source + date
- `plan.existing_subscriptions_reviewed` — every existing paid sub → audit result

---

## The 6 steps (target: 8 minutes total)

### Step 1 — Read the briefing's frictions (1 min)

Open the plan record's `submission` field. Read these fields:
- `manual_tasks`
- `friction`
- `inbox`
- `wish`

Make a mental list of 3–5 named frictions. You'll check coverage against this list.

### Step 2 — Coverage parallelism check (1 min)

Open `plan.coverage_map`. For each item in your mental friction list:
- Is there a row?
- Is the row populated to the same depth as the others? (Compare `specific_feature` and `tool_or_section` length and substance.)

**Red flag:** Any row that says "addressed in savings table" or "passing mention" or has a thin/empty `specific_feature`.

**Fix:** Send back to writer with the specific friction that has a thin row.

### Step 3 — Top-tools target-customer fit (2 min)

Open the homepage of the top 2–3 recommended tools in `ai_tools`. For each:
- Read the "who this is for" section, the hero copy, or the customer logos.
- Ask: **does the target customer match our respondent?**

Examples of mismatches you'll catch:
- Tool says "for residential real estate investors" but respondent owns commercial properties (Frank/Baselane class)
- Tool says "for solo therapists" but respondent runs a 12-person group practice
- Tool says "for enterprise sales teams" but respondent is a one-person consultancy

**Red flag:** Target customer description that doesn't match the respondent's setup.

**Fix:** Send back with "tool X targets [customer type]; respondent is [different type]; reconsider."

### Step 4 — Price verification (2 min)

Open `plan.verification_log`. Find the 2 highest-dollar prices in the plan.

For each:
- Open the vendor's **official pricing page** (not Capterra, not G2, not third-party review sites)
- Compare to the `claim` field in the verification_log

**Red flag:** Vendor page shows a different price than what the verification_log claims. Don't trust the rest of the verification_log if you find one mismatch.

**Fix:** Send back with the specific tool + correct price + vendor page URL.

### Step 5 — Missed existing-sub features (1 min)

Open `plan.existing_subscriptions_reviewed`. For each named friction in your mental list (from Step 1) that is NOT addressed by an existing-subs row:
- Google "does [existing subscription] do [friction]?" — 20 seconds per check
- Examples: "Does Square POS do scheduling?" → yes, Square Shifts. "Does Canva do AI photo editing?" → yes, Magic Studio.

**Red flag:** An obvious-in-2026 feature inside an existing subscription that the plan missed and is recommending a new tool for instead.

**Fix:** Send back with "respondent already pays for [X]; [X] does [feature]; recommend that instead of new tool."

### Step 6 — Voice spot-check (1 min)

Read 3–4 tool descriptions (`what_it_is`, `why_it_helps_you`).
- Hype-word check: "supercharge", "unlock", "transform", "leverage"
- Generic AI-marketing check: does it sound like the AI wrote it about itself?
- Kitchen-table clarity: would a non-technical adult understand it?

**Red flag:** Any of the above.

**Fix:** Send back with the specific passage.

---

## When to ship without changes

If all 6 steps pass clean → send to customer.

If any step has a red flag → write a short revise instruction citing the specific issue, and re-run the plan through the revision endpoint (or send back to the writer). Do not silently fix in production — the eval data on what's failing in real customer plans is the most valuable input for the next prompt iteration round.

## What this checklist does NOT cover

- Voice/editorial polish beyond the spot-check
- Domain expertise for the respondent's specific industry (you're not a dentist, lawyer, etc — you're checking that the plan looks plausible, not that every clinical detail is right)
- Whether the custom build is "the best possible" — only that it's reasonable and the system prompt is well-scoped

These deeper checks come later, with more production data and patterns to learn from.

---

## After the first 10 production plans

Look at the pattern of red flags. If a specific failure class shows up in 3+ plans, that's a candidate for a prompt-level fix. Bring it back to the iteration loop.

Don't iterate on n<3 patterns. The cost of overfitting one persona's quirk into the prompt is real.
