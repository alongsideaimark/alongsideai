# Lantern Plan — Working Notes for Claude Code

## Project

This is the production website for **Lantern Plan** (lanternplan.com). Pure HTML, no build step, no framework. Netlify hosts it and auto-deploys on every push to `main`.

The authoritative handoff brief is at `C:\Users\MarkSkeehan\Downloads\claude_code_handoff\README.md`. **Read it first on any new session** — it's the source of truth for what this business is, how the site is structured, and the non-negotiable rules. The `internal-docs/` folder next to it has the Operating Manual, Discovery Call Script, Plan Template, a sample filled plan, and Reference Guides. Use those for context when making copy decisions.

## Mark (the user)

- Non-technical. Does not code. Cannot debug.
- Communicates in plain English. Wants the same back — no jargon, no code in explanations unless he asks.
- At session start, he'll typically press `Shift` + `Tab` twice to turn off per-tool prompting. That auto-approves routine edits. Even with that on, **still pause and explain in plain English before any action that could break the live site** (pushes that replace the homepage, deletions, anything hard to reverse).

## Workflow

1. Mark sends a change request in plain English ("update the hero headline to X").
2. Edit the relevant file(s) in this repo.
3. Commit with a human-readable, past-tense message (what changed).
4. Push to `main`.
5. Wait ~60s for Netlify auto-deploy.
6. Confirm to Mark in plain English: "Live at [url]. Here's what changed: [brief]."

Ship to main. No branches, no PRs, no staging — unless Mark asks.

## Non-negotiables (from the handoff README)

- **No framework rewrites.** No React, Next, Astro, Vite, or any build tool.
- **No dependencies on the public site.** The customer-facing pages are pure HTML — no client-side libraries, no build step. (The serverless functions in `netlify/` are the one sanctioned exception: `package.json` declares `@netlify/blobs` and `stripe`, installed by Netlify at build time. `npm test` runs two test files as a deploy gate. Don't add dependencies beyond these without a strong reason.)
- **No tool/brand names** on public-facing pages (ChatGPT, Claude, Gemini, Notion, etc.). Positioning is deliberately tool-agnostic.
- **No emoji, no AI-slop tropes** (no ✨, no "supercharge," no "unlock").
- **Voice is warm, editorial, calm.** See the landing page copy for the reference tone.
- **Don't change copy without asking.** Every word on the landing page has been argued over.
- **Form delivery is sacred.** The `questionnaire/` form must keep working end-to-end. Test after any change that touches it.

## Design system (don't break it)

- Cream background `#FAF6F1`, charcoal text `#1F1F1D`, sage accent `#7A8B6F`, muted mauve `#9E7B84`.
- Display: `"DM Serif Display", serif`. Body + UI: `"Nunito", sans-serif`. Body minimum 17px.
- Logo lockup: "Lantern" in DM Serif Display + "PLAN" in Nunito 700 uppercase letter-spaced sage, baseline-aligned, inline. Never wraps. (Pre-rename, this was "alongside" + "AI" in the same pattern — the structure didn't change, only the words.) The lantern mark (sage rounded square, cream lantern outline, gold light inside) sits to the left of the wordmark. Source SVGs are `assets/logo-mark.svg` (sage bg) and `assets/logo-mark-cream.svg` (cream bg variant).
- CTAs: "Get your custom plan" (primary), "How it works" (secondary). Never "Get Started" or "Try Free."

## Anti-evangelism copy standard (codified 2026-05-28)

The target reader is a skeptical, non-technical 55-year-old. They pattern-match AI-hype language to "tech keynote I didn't ask for" and close the tab. Every word on the site should sound like a smart friend who already did the research — not a guru trying to convert them.

**Hard-banned words** (never in customer-facing copy): leverage, harness, unlock, transform, revolutionize, AI-powered, cutting-edge, next-generation, embrace, empower, game-changer, seamless, supercharge, elevate, robust, level up, "the future of."

**Soft-evangelism test:** If a sentence explains *why AI is good* rather than *what the customer gets*, it's evangelism. Cut it or replace it with a concrete outcome. "This is the kind of thing AI is genuinely good at" → cut. "Save 4 hours a week on email" → keep.

**"AI" as a noun is fine.** The product recommends AI tools — pretending otherwise is dishonest. Use "AI" when it's the accurate, natural word. Target the *framing*, not the *noun*. "A custom AI tool built for your workflow" = fine (describing a deliverable). "Harness the power of AI" = banned (evangelizing).

**Replacement patterns:**
- "Leverage AI for productivity" → "Save 4 hours a week on email"
- "AI-powered writing assistant" → "A writing partner that sounds like you"
- "Transform your workflow with AI" → "The pile on your desk shrinks"
- "Embrace AI to stay competitive" → "Stop spending Saturday mornings on paperwork"
- "Learn AI" → (only allowed in the anti-framing: "You don't need to learn AI")
- "AI is changing everything" → Cut entirely, or: "Here's what actually changed for people like you"

**The sniff test:** Read the sentence aloud. Does it sound like something you'd say to a friend at dinner, or something you'd hear from a stage? If it's from a stage, rewrite it.

## Current status (as of 2026-08-08 — full product is live; fresh-eyes audit complete)

- **The plan product is LIVE end-to-end at lanternplan.com.** Price is **$79 one-time** via Stripe Checkout (locked June 2026 — the old "pricing is TBD, don't show a price" freeze is over). Funnel: landing → `/pricing/` → Stripe → token-gated `/questionnaire/` → serverless pipeline generates the plan (Opus draft + Haiku critic, retries, dead-letter queue, state machine in `netlify/lib/plan-state.js`) → customer gets an emailed link at `/plans/:id` with a 2-revision/14-day self-serve revision flow. Storage is Netlify Blobs; email is Resend; PDF archival is PDFShift. Env vars that must stay configured in Netlify: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `PDFSHIFT_API_KEY`, `ADMIN_API_KEY`, `RETRY_SECRET`.
- **Domain is live.** lanternplan.com serves the site (Cloudflare DNS in front of Netlify); `mark@lanternplan.com` is the contact address everywhere. Note: the old **alongsideai.ai still serves a duplicate copy of the site instead of redirecting** — should become a 301 redirect to lanternplan.com.
- **Beta operating model:** prompt is locked (see `docs/beta-operations.md` and memory `project_prompt_locked_for_beta.md`). Iteration requires 3+ cross-persona evidence. **Review model (decided 2026-08-08):** auto-send stays; human review is a post-send spot-check driven by the per-plan notification email Mark already receives. Critic hard-fails still block sending and wait for Mark.
- **Fresh-eyes audit (2026-08-08): all launch blockers FIXED and deployed same day.** The paywall is now enforced server-side (`netlify/lib/payment-token.js` — token verified, consumed, and used as the idempotency key; `generate-plan-background` requires the `x-lp-internal` header = `RETRY_SECRET`; test submissions require `_test_key` = `ADMIN_API_KEY`). The webhook race is closed (validate-token recovers paid sessions directly from Stripe; questionnaire retries before showing the paywall). Legal pages rewritten (v2.0) for the real product. The phantom implementation-package upsell was removed from example plans and the whole pipeline (prompt forbids it, renderer ignores it, critic hard-fails it). Internal paths (`/netlify/*`, `/docs/*`, `/scripts/*`, `/eval/*`, `/brand-explorations/*`, package files) 404 publicly — the plan prompt used to be downloadable. alongsideai.ai now 301s to lanternplan.com. **Still on Mark:** confirm the Stripe price object is $79.00, and do one real end-to-end test purchase (buy → questionnaire → plan email → refund) before driving traffic.
- **Target customer (unchanged):** well-off, non-technical adults 40–70; they quality-shop, not price-shop; frame as "skip the 10 hours of research," never "learn AI."
- **The AI briefing block** built by `netlify/lib/briefing.js` / `submission-created.js` is the pipeline's input format. Stable, line-oriented plain text. Don't change its shape without a reason.

## Handoff notes

This file is current as of 2026-08-08 (evening — punch list shipped). Open threads: (1) LLC name change still pending with CA SOS — footer `© 2026 Alongside AI LLC` stays until it's approved, then swap the instances to "Lantern Plan LLC" (now five: landing, pricing, examples, questionnaire, legal); (2) before spending on traffic, Mark should confirm the Stripe price object is $79.00 and run one real test purchase end-to-end, then refund himself; (3) landing positioning copy has been rewritten since the freeze ("Someone already sorted through the AI tools…") — treat current copy as canonical; (4) the strategic question of whether to offer a real, honest implementation/setup service (the old example plans hinted at one) is open — if Mark ever wants it, it's a deliberate product decision, not a copy tweak.
