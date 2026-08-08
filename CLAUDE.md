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
- **Beta operating model:** prompt is locked (see `docs/beta-operations.md` and memory `project_prompt_locked_for_beta.md`). Iteration requires 3+ cross-persona evidence. **Known drift:** the docs describe an 8-minute human review before every plan ships, but the code auto-approves and auto-sends any plan the critic doesn't block (`generate-plan-background.js`). Reconcile deliberately — either wire the review gate in or update the docs.
- **Fresh-eyes audit (2026-08-08) found launch-blocking issues — see the punch list before driving paid traffic.** Highest severity: (1) the paywall is client-side only — the submit functions never verify a payment token, so a direct POST gets a free plan; (2) `legal/index.html` Privacy + Terms still describe the pre-pivot consultancy (discovery calls, 50/50 invoicing, a 30-day-check-in refund policy that contradicts the 14-day promise on `/pricing/`) and contain unfilled `[Business address]` placeholders; (3) the four example plans say "the plan you're reading is free" and quote $1,000–$2,000 implementation packages, contradicting "$79 one-time, no follow-up sales calls" on the landing page; (4) Stripe redirects the customer to the questionnaire before the webhook writes their token — a slow webhook shows a paying customer "invalid payment link."
- **Target customer (unchanged):** well-off, non-technical adults 40–70; they quality-shop, not price-shop; frame as "skip the 10 hours of research," never "learn AI."
- **The AI briefing block** built by `netlify/lib/briefing.js` / `submission-created.js` is the pipeline's input format. Stable, line-oriented plain text. Don't change its shape without a reason.

## Handoff notes

This file is current as of 2026-08-08. Open threads: (1) LLC name change still pending with CA SOS — footer `© 2026 Alongside AI LLC` stays until it's approved, then swap the four instances to "Lantern Plan LLC"; (2) the launch punch list from the 2026-08-08 audit (client-side paywall, stale legal pages, example-plan price contradictions, webhook race) should be worked before spending on traffic; (3) landing positioning copy has been rewritten since the freeze ("Someone already sorted through the AI tools…") — treat current copy as canonical.
