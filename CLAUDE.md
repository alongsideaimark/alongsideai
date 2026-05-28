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
- **No dependencies.** No npm, no package.json, no TypeScript. Zero deps is a feature.
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

## Current status (as of 2026-05-28 — rename pass complete, awaiting deploy)

- **Company renamed: Alongside AI → Lantern Plan (2026-05-28).** Trigger: alongsideai.ai was too close to an existing alongside-ai.com. New name is locked. Mechanical rename pass touched ~65 files: wordmark text swapped to "Lantern PLAN" (caps-tag treatment, same structure as before), all meta/og:* tags, internal AI pipeline prompts and reference plans, eval personas, sitemap/robots.txt. Logo mark redesigned as a lantern (sage square, cream lantern outline, gold light inside) — same `assets/logo-mark.svg` filename. Favicons and og-image regenerated. Three things deliberately left untouched: (1) `© 2026 Alongside AI LLC` footer line — preserves the registered legal entity until Mark files a name-change amendment with CA SOS; (2) landing-page positioning copy (hero h1, lede) — the positioning rewrite remains queued per the freeze below; (3) the domain — Mark needs to register `lanternplan.com`, point DNS, and configure email at `mark@lanternplan.com` before the URL/email links work. Until DNS is updated, the site is still served at alongsideai.ai but says "Lantern Plan" everywhere. Brand exploration files live at `brand-explorations/lantern-plan/` for reference.
- **Questionnaire redesign is LIVE.** Commit `2e608f3` pushed to `main`. The new 7-section wizard at `/questionnaire/` is serving real traffic. Budget question uses escalating monthly ranges (`under_50` through `500_plus` plus `unsure`). Submission flow tested end-to-end in local preview — POST lands correctly, localStorage clears on success.
- **The plan-as-product pivot is the operating model.** The questionnaire response → AI-generated PDF plan IS the product. The discovery call is repositioned as implementation-assistance upsell, post-plan. See `~/.claude/projects/C--Users-MarkSkeehan-Downloads-lantern-plan/memory/project_plan_as_product_pivot.md`.
- **Target customer clarified (2026-04-23 pricing discussion):** Well-off, non-technical adults (business owners 40–70, semi-retired professionals, busy professionals). They don't price-shop at $49–99; they quality-shop. They associate "AI" with hype/risk, "personalized plan" and "curated for your setup" with trust. Reframe the offer in their head from "learn about AI" → "skip the 10 hours of research, we made the decisions for you."
- **Pricing is TBD.** Mark is leaning toward the low end (somewhere between $4.99 and $49) but has not locked a number. Quality of the AI pipeline output will determine where on the spectrum it lands. Do NOT feature a price on the landing page until Mark confirms. Also do NOT rewrite landing-page positioning copy yet — that pass is queued to happen after the AI pipeline is producing good output and price is locked. The "target customer" insight above is the intended direction but hasn't been implemented on the site.
- **The AI briefing block** in the internal notification email (`netlify/functions/submission-created.js → buildAiBriefing`) is the designed input format for the downstream pipeline. It's stable, line-oriented plain text. Don't change its shape without a reason.
- **NEXT PROJECT: build the agentic AI pipeline.** Mark's spinning up a fresh coding session to plan this. The pipeline should: read a questionnaire submission → call Claude to draft a plan following the `internal-docs/Plan Template` format → generate a PDF that matches the visual quality of `examples/semi-retired/` and `examples/busy-professional/` → deliver to the customer. See `~/.claude/projects/C--Users-MarkSkeehan-Downloads-lantern-plan/memory/project_ai_pipeline_requirements.md` for everything we know so far.

## Handoff notes

This file is current as of 2026-05-28 — the Lantern Plan rename just shipped, AI pipeline build is next. Three things to fold in over time: (1) when DNS is pointed at lanternplan.com, drop the "URL/email don't work yet" caveat from the rename bullet; (2) when the LLC name change is filed and approved, update the three footer instances of "Alongside AI LLC" to "Lantern Plan LLC" and remove the LLC caveat; (3) when the AI pipeline ships and pricing is locked, fold the pipeline + questionnaire + pricing bullets into a single "plan product is live" entry and delete this handoff section entirely.
