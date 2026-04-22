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

## Current status (as of 2026-04-22)

- **Initial site commit `cddd727` pushed and deployed.** Previously the repo contained a stray `sitemap.zip` from a GitHub web-UI upload; that's been removed and replaced with the real production bundle at the repo root.
- **Netlify → GitHub auto-deploy is confirmed working.** Mark wired up the repo link in the Netlify dashboard on 2026-04-22 after I pushed the first commit but nothing deployed.
- **Live `/questionnaire/` is serving the new FormData submit path** (not the old URL-encoded one). A hidden static form mirror is in place at `questionnaire/index.html:282` so Netlify's form detector sees it at build time despite the form being JS-rendered.
- **Pending when this note was written:** Mark was about to submit a test questionnaire entry and verify it appears in Netlify dashboard → Forms tab. That is the last end-to-end check before real leads hit the form. If you're reading this and the form has been confirmed working, delete this bullet.

## Handoff notes

This file was written by the prior Claude Code session on 2026-04-22 that seeded the GitHub repo and verified the first deploy. When the pending form-delivery test is confirmed, remove the relevant bullet from **Current status** — everything else in this file is durable guidance.
