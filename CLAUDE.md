# Alongside AI — Working Notes for Claude Code

## Project

This is the production website for **Alongside AI** (alongsideai.ai). Pure HTML, no build step, no framework. Netlify hosts it and auto-deploys on every push to `main`.

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
- Logo lockup: "alongside" in DM Serif Display + "AI" in Nunito 700, same size, baseline-aligned, inline. Never wraps. If you see "A I" with a gap, that's wrong.
- CTAs: "Get your custom plan" (primary), "How it works" (secondary). Never "Get Started" or "Try Free."

## Current status (as of 2026-04-23)

- **Business model pivot: the plan is the product.** Mark decided the questionnaire response (i.e. the written plan) is what's being sold — not an intake for a discovery call. The call is now positioned as an optional implementation-assistance upsell, offered after the plan is delivered. The goal is for an AI agent to read the questionnaire answers and draft a specific platform-recommendation plan with no human follow-up required. See `~/.claude/projects/C--Users-MarkSkeehan-Downloads-alongsideai/memory/project_plan_as_product_pivot.md` for full context.
- **Questionnaire redesigned and rewritten.** Went from 12 light questions/10 minutes → 7-section wizard, ~26 questions, 20–25 minutes. Each section is one screen, intro and done screens preserved, localStorage save-and-resume in place under new key `alongside-ai-intake-v2`. Only `name` (S1) and `contact` (S7, email) are required — every other question is skippable. Email moved from start to final section so users invest in answering before committing contact info.
- **Email handler rewritten (`netlify/functions/submission-created.js`).** Internal notification is now section-organized and includes an **AI Briefing block** at the bottom — stable, line-oriented plain text designed to be copy-pasted into a Claude/ChatGPT plan-drafting prompt (or parsed programmatically when the pipeline is automated). Auto-reply copy was lightly adjusted to reflect the new question set.
- **Landing-page and example-page copy updated** to drop "twelve questions / ten minutes" language — `index.html` (hero meta, how-it-works, FAQ, CTA banner), `examples/semi-retired/index.html`, and `examples/busy-professional/index.html`. New language: "seven short sections… around 20 minutes… skip anything that doesn't feel right."
- **Plan file:** `C:\Users\MarkSkeehan\.claude\plans\to-me-the-biggest-sunny-cocke.md` — full context and verification checklist.
- **Pending verification before push:** Mark to walk the new form end-to-end (all 7 sections, skip/resume/back, conditional reveal on situation=other, submit, verify internal email includes the AI Briefing block cleanly). Once confirmed, commit + push to main. The numeric budget range in Section 7 Q24 is a placeholder ($50–150/mo + $500–1,500 setup) — Mark can revise after running a few real plans.

## Handoff notes

This file was updated by the 2026-04-23 session that did the plan-as-product pivot. The 2026-04-22 bullet set was moved into git history once the first commit was verified working. If you're reading this and the new 26-question wizard is live + a test submission has produced a clean internal email with AI briefing block, you can condense the **Current status** list into a single "redesign live" bullet.
