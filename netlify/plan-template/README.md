# Plan pipeline — setup & operation notes

This folder and the functions in `netlify/functions/` together form the pipeline
that turns a questionnaire submission into a PDF plan emailed to the customer.

## How a plan flows through the system

1. Customer submits the questionnaire at `/questionnaire/`.
2. Netlify Forms fires `submission-created.js`. It sends the two existing
   emails (auto-reply to the customer, internal notification to Mark) and
   then POSTs to `generate-plan-background.js`.
3. `generate-plan-background.js` builds the AI briefing, calls Claude, renders
   the HTML via the template in this folder, stores the draft in Netlify Blobs,
   and emails Mark a preview link.
4. Mark opens the preview link (`/plans/:id`). A review bar lets him click
   **Approve & send to customer**.
5. `approve-plan.js` converts the stored HTML to a PDF via PDFShift and emails
   the customer with the PDF attached. Status on the stored record flips to
   `sent`.

## Environment variables Mark needs to set on Netlify

In Netlify dashboard → Site settings → Environment variables, add:

| Name | What it's for | Where to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude API calls (draft the plan) | console.anthropic.com → Settings → API Keys |
| `RESEND_API_KEY` | Email delivery — already set for the auto-replies | resend.com/api-keys (already in place) |
| `PDFSHIFT_API_KEY` | HTML-to-PDF conversion | pdfshift.io → Dashboard → API key |
| `URL` | The site's base URL. Netlify sets this automatically on production | auto-set by Netlify; don't add manually |

## Services Mark needs to sign up for

- **Anthropic** — pay-as-you-go account at console.anthropic.com. Expected cost
  per plan drafted: roughly $0.40–$1.00 using Claude Opus 4.7 with prompt
  caching on the reference plans.
- **PDFShift** — free tier is 50 conversions/month. Prototype plan; upgrade if
  volume exceeds that. pdfshift.io/pricing.

Both services take a credit card on file.

## How to change the plan's voice or structure

- To change tone, voice rules, what Claude must include, or the JSON shape:
  edit `prompt.md` in this folder. The background function reads it on every
  call, so changes take effect on the next plan drafted.
- To change the visual template (sections, headings, layout): edit
  `template.html` in this folder. Keep the `{{SLOT_NAME}}` placeholders intact.
- To change CSS (colors, type, spacing): edit `/assets/plan.css`. That file
  also powers the existing `/examples/` sample pages.

## Local preview of the template

The pipeline runs on Netlify; it doesn't run locally without Node.js. But the
HTML template can be previewed with Python:

```
python netlify/plan-template/test-render.py
```

This writes `plan-test-preview.html` at the repo root (git-ignored). Open it
in the preview browser to eyeball the template. The file uses a hand-written
plan fixture (`test-fixture.json`) so the output is deterministic. Update the
fixture if you want to test new content shapes.

## Storage — where plans live

Plans are stored in Netlify Blobs under the store name `plans`, one JSON
record per plan. The record contains:

- `id` — the URL slug shown in `/plans/:id`
- `created_at` / `sent_at`
- `status` — `draft` → `sent`
- `customer_first_name`, `customer_email`
- `submission` — the raw questionnaire answers
- `briefing` — the plain-text briefing fed to Claude
- `plan` — the JSON Claude returned
- `html` — the rendered HTML (minus the review bar)
- `usage` — Anthropic token counts for cost tracking

Netlify Blobs auto-scopes data per deploy context; production blobs are
isolated from deploy-preview blobs. Plans created on a deploy preview do not
bleed into production.

## Known prototype limitations

- **No retry on Claude failure.** If the API call errors, Mark gets no preview
  email. He can retrigger by re-POSTing to the background function with the
  same submission data.
- **No rate limiting.** A burst of submissions will each trigger a Claude
  call. At current volume this is fine; revisit if it becomes a cost issue.
- **No edit-in-place.** Mark can't edit the plan from the preview UI; if the
  draft is bad he has to manually edit the stored HTML (via Netlify CLI on
  the Blob record) before approving, or decline and redraft.
- **Status is binary.** Draft or sent. No "rejected" or "redrafting" state yet.

These are explicit prototype cuts. Pick them up when the pipeline has run a
dozen real plans and the real pain points are known.
