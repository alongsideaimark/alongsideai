# Brief: add a "ways to extend this" mini-section to Section 05

**Workstream:** prompt + schema + renderer
**Owner:** whoever's on the prompt overhaul (this is intentionally adjacent to that work)
**Status:** spec ready, not started
**Source:** customer feedback from BMey's plan (Roche Diagnostics, CVRM strategy), 2026-05

## The problem

Section 05 of every plan walks the customer through building one Custom GPT (or equivalent) tuned to one specific task — for BMey, weekly CVRM strategy briefs.

Power users reach for the thing they built whenever an adjacent use case comes up. The audience we're targeting — well-off, non-technical adults — does not. They build the GPT, use it for the one task we pitched, and never discover that the same system prompt + knowledge base could also handle three or four neighboring tasks.

The cost of this is significant. A customer extracts ~25% of the value of what they built because no one told them the rest exists.

## The fix

Add a small subsection at the bottom of Section 05 that names 3-4 adjacent use cases the customer can apply the *same* Custom GPT to, with a one-sentence pointer for each.

Working title for the subsection (workshop as needed):
> **Once it's working — other things this same setup can do**

Each extension is one sentence:
> For **partnership analyses**, build a second Project with the same system prompt and add the partnership scorecard PDFs to the knowledge base.

> For **slide-deck outlines**, paste last quarter's deck structure and ask it to draft a parallel one for the new topic.

> For **internal memos**, drop an existing memo into the chat and ask it to rewrite with your context.

Three sentences in every plan. The work is choosing the right three for *this* customer — they have to be plausibly useful given their briefing, not generic. A bad version of this section ("you can also use it for emails!") is worse than no section.

## Schema change

Add a new field to the `custom_build` object:

```js
extensions: {
  type: "array",
  minItems: 2,
  maxItems: 4,
  items: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short noun phrase naming the adjacent use case, e.g. 'partnership analyses' or 'monthly board updates'. No leading 'For' — that's the renderer's job.",
      },
      description: {
        type: "string",
        description: "One sentence describing how to apply the existing Custom GPT to this use case. Reference specific assets the customer named in their briefing where possible (e.g. 'add the [specific document type] to the knowledge base').",
      },
    },
    required: ["title", "description"],
  },
},
```

Add `"extensions"` to the `custom_build.required` array in `netlify/lib/plan-schema.js`.

Decision point: minItems=2 vs 3. I'd start with **2** — for very simple personas (a single-task retiree) forcing 3 will produce filler. The prompt should aim for 3 but accept 2 when nothing third is genuinely useful.

## Prompt change

Add to `netlify/plan-template/prompt.md` in the Section 05 guidance block:

> After the test queries and iteration tip, list 2–4 adjacent use cases the same Custom GPT can handle. Each `extension` should:
> - Name a real, plausible task this person actually does (from their briefing — what they create, their typical week, their team handoffs)
> - Describe the smallest concrete change to the existing setup to apply it (a new Project, swapping one document, a different chat opener)
> - NOT be generic ("you can use it for emails too"). If you can't think of a third use case grounded in this person's specific work, return only two.
>
> Bias toward extensions that reuse the existing system_prompt and knowledge base unchanged. The point is to multiply the value of what they already built, not give them homework to build something new.

## Renderer change

Update `netlify/lib/render-plan.js`:
1. Add an `EXTENSIONS_BLOCK` template variable.
2. New helper `renderExtensions(custom_build)` returns either an empty string (if extensions absent or empty) or the rendered subsection HTML.
3. Update `netlify/plan-template/template.html` to inject `EXTENSIONS_BLOCK` at the bottom of Section 05, after `CUSTOM_BUILD_CONTENT`.

Suggested rendered HTML pattern:

```html
<div class="extensions">
  <h3>Once it's working — other things this same setup can do</h3>
  <ul>
    <li><strong>For [title].</strong> [description]</li>
    ...
  </ul>
</div>
```

Style with the existing setup-tip / guardrail card aesthetic — soft background, slightly indented. Don't compete visually with the main custom-build content.

## Critic-pass implications

Once shipped, add a Layer 1 rule in `netlify/lib/critique-plan.js`:
- Soft fail if `custom_build.extensions.length < 2`
- Soft fail if any extension's title or description contains the words "email" or "writing" without the persona's briefing supporting them (placeholder for "is this generic?" check)

Layer 2's rubric should also test this dimension — already covered loosely under "custom_build fit" but worth making explicit. Add to the `RUBRIC_SYSTEM_PROMPT`:
> Do the listed extensions reuse the existing setup unchanged for tasks the briefing actually supports, or do they read as filler?

## What NOT to change

- The existing `setup_steps`, `system_prompt`, `test_queries` structure is fine.
- Don't touch the prompt's main personalization rules.
- Don't add more extensions than 4. Customers won't read past 3 and the render gets noisy.
- Don't make extensions reference *new* documents the customer has to find — they should work with what's already in the briefing.

## Verification before shipping

Run the new prompt against 3 personas from `eval/personas/`:
- One simple persona (single-task retiree)
- One mid-complexity (small business owner)
- One like BMey (technical pro, multiple workflows)

Check that the extensions feel grounded. If the simple persona's extensions are generic or padded to hit 3, drop the minItems to 2 in the schema and let the model self-regulate.
