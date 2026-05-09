// Renders a plan JSON object (as returned by the drafting prompt) into the
// final HTML by filling slots in template.html. Intentionally tiny — no
// Markdown library, no templating dep. Claude returns mostly plain text with
// `**bold**` and `*italic*` allowed, and that's all we convert.

const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "..", "plan-template", "template.html");
const CSS_PATH = path.join(__dirname, "..", "..", "assets", "plan.css");

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Converts **bold** and *italic* into <strong>/<em> after escaping HTML.
// Nothing fancy — no links, no lists, no code. Claude has been told this.
// Defensive: if the model freelances and embeds an <a href="...">text</a>,
// strip the anchor markup down to its visible text before escaping so the
// customer doesn't see raw HTML in their plan.
function renderInline(md) {
  const stripped = String(md == null ? "" : md)
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*");
  const esc = escapeHtml(stripped);
  return esc
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

// Splits a string on blank lines and wraps each paragraph in <p>.
// Single newlines inside a paragraph become <br/>.
function renderParagraphs(md) {
  const text = String(md == null ? "" : md).trim();
  if (!text) return "";
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p>${renderInline(para).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function renderObservation(text) {
  return `<div class="obs-item"><div class="dot"></div><p>${renderInline(text)}</p></div>`;
}

function renderSetupSteps(tool) {
  if (!tool.setup_steps || tool.setup_steps.length === 0) return "";
  const steps = tool.setup_steps.map((s) => `<li>${renderInline(s)}</li>`).join("\n              ");
  const tip = tool.setup_tip
    ? `\n            <div class="tip">${renderInline(tool.setup_tip)}</div>`
    : "";
  return `
          <div class="setup-steps">
            <div class="setup-steps-label">Getting started — step by step</div>
            <ol>
              ${steps}
            </ol>${tip}
          </div>`;
}

function renderPrompts(tool) {
  if (!tool.prompts || tool.prompts.length === 0) return "";
  return tool.prompts.map((p, i) => `
          <div class="prompt-box"${i > 0 ? ' style="margin-top:10px"' : ""}>
            <div class="prompt-box-label">${escapeHtml(p.label)}</div>
            <div class="prompt-text">${escapeHtml(p.text)}</div>
            ${p.note ? `<p class="prompt-note">${renderInline(p.note)}</p>` : ""}
          </div>`).join("\n");
}

function renderToolSummary(tool) {
  const conditionalTag = tool.conditional
    ? ` <em style="font-style:normal;color:#8b6f28;font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-left:8px;">Conditional</em>`
    : "";
  const buildTag = tool.build_it_yourself
    ? ` <em style="font-style:normal;color:#6F7A8B;font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-left:8px;">Build it yourself</em>`
    : "";
  const wontLine = tool.what_it_wont_fix
    ? `<p class="wont">${renderInline(tool.what_it_wont_fix)}</p>`
    : "";
  const classes = tool.build_it_yourself ? "rec rec-build" : "rec";
  const hasSetup = (tool.setup_steps && tool.setup_steps.length > 0) || (tool.prompts && tool.prompts.length > 0);
  const appendixRef = hasSetup
    ? `<p class="appendix-ref">Setup walkthrough in the <strong>Setup Guide</strong> at the end of this plan.</p>`
    : "";
  return `
      <div class="${classes}">
        <div>
          <div class="rec-name">${escapeHtml(tool.name)}${conditionalTag}${buildTag}</div>
          <div class="rec-cost">${escapeHtml(tool.cost)}</div>
        </div>
        <div class="rec-body">
          <p class="what">What it is: ${renderInline(tool.what_it_is)}</p>
          <p class="why">Why it helps you: ${renderInline(tool.why_it_helps_you)}</p>
          ${wontLine}${appendixRef}
        </div>
      </div>`;
}

function renderToolSetup(tool) {
  const setupHtml = renderSetupSteps(tool);
  const promptsHtml = renderPrompts(tool);
  if (!setupHtml && !promptsHtml) return "";
  return `
      <div class="setup-entry">
        <div class="rec-name" style="font-size:22px;margin-bottom:6px;">${escapeHtml(tool.name)}</div>
        ${setupHtml}${promptsHtml}
      </div>`;
}

function renderRuledItem(item) {
  return `
      <div class="ruled-item">
        <div class="ruled-name">${escapeHtml(item.name)}</div>
        <p class="ruled-reason">${renderInline(item.reason)}</p>
      </div>`;
}

function renderTableRow(row) {
  return `<tr><td>${escapeHtml(row.task)}</td><td>${renderInline(row.today)}</td><td>${renderInline(row.with_plan)}</td><td class="num" style="text-align:right">${escapeHtml(row.weekly_saved)}</td></tr>`;
}

function renderBullet(md) {
  return `<li>${renderInline(md)}</li>`;
}

function renderLine(line) {
  return `<div class="line"><span>${renderInline(line.label)}</span><span class="v">${escapeHtml(line.cost)}</span></div>`;
}

function renderTestQuery(query) {
  const goodHtml = query.expected
    ? `\n            <p class="prompt-note"><strong>Good output looks like:</strong> ${renderInline(query.expected)}</p>`
    : "";
  const badHtml = query.red_flag
    ? `\n            <p class="prompt-note" style="color:#8b6f28"><strong>Red flag:</strong> ${renderInline(query.red_flag)}</p>`
    : "";
  return `
          <div class="prompt-box"${query !== undefined ? ' style="margin-top:10px"' : ""}>
            <div class="prompt-box-label">${escapeHtml(query.label || "Test this")}</div>
            <div class="prompt-text">${escapeHtml(query.input || "")}</div>${goodHtml}${badHtml}
          </div>`;
}

function renderCustomBuildSummary(cb) {
  if (!cb || !cb.project_name) return "";
  return `
      <div class="rec rec-build">
        <div>
          <div class="rec-name">${escapeHtml(cb.project_name)} <em style="font-style:normal;color:#6F7A8B;font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-left:8px;">Build it yourself</em></div>
          <div class="rec-cost">${escapeHtml(cb.platform_cost || "")}</div>
        </div>
        <div class="rec-body">
          <p>${renderInline(cb.project_pitch || "")}</p>
          <p style="margin-top:8px"><strong>Where to build it:</strong> ${renderInline(cb.platform || "")}</p>
          <p class="appendix-ref">Full build instructions, system prompt, and test queries in the <strong>Setup Guide</strong> at the end of this plan.</p>
        </div>
      </div>`;
}

function renderCustomBuildSetup(cb) {
  if (!cb || !cb.project_name) return "";
  const steps = (cb.setup_steps || []).map((s) => `<li>${renderInline(s)}</li>`).join("\n              ");
  const tip = cb.setup_tip
    ? `\n            <div class="tip">${renderInline(cb.setup_tip)}</div>`
    : "";
  const setupHtml = steps ? `
          <div class="setup-steps">
            <div class="setup-steps-label">Building it — step by step</div>
            <ol>
              ${steps}
            </ol>${tip}
          </div>` : "";

  const sysPromptHtml = cb.system_prompt ? `
          <div class="prompt-box" style="margin-top:20px">
            <div class="prompt-box-label">${escapeHtml(cb.system_prompt_label || "The system prompt — copy this exactly")}</div>
            <div class="prompt-text">${escapeHtml(cb.system_prompt)}</div>
            ${cb.system_prompt_note ? `<p class="prompt-note">${renderInline(cb.system_prompt_note)}</p>` : ""}
          </div>` : "";

  const testHtml = (cb.test_queries || []).length > 0 ? `
          <div style="margin-top:24px">
            <div class="setup-steps-label">Test it with these</div>
            ${(cb.test_queries || []).map(renderTestQuery).join("\n")}
          </div>` : "";

  const iterHtml = cb.iteration_tip ? `
          <div class="tip" style="margin-top:16px">${renderInline(cb.iteration_tip)}</div>` : "";

  return `
      <div class="setup-entry">
        <div class="rec-name" style="font-size:22px;margin-bottom:6px;">${escapeHtml(cb.project_name)}</div>
        ${setupHtml}${sysPromptHtml}${testHtml}${iterHtml}
      </div>`;
}

function renderGuardrailItem(item) {
  const level = item.level || "caution";
  const labelText = level === "never" ? "Never"
    : level === "safe" ? "Generally fine"
    : "Be careful with";
  return `
      <div class="guardrail-item ${escapeHtml(level)}">
        <div class="guardrail-label">${labelText}</div>
        ${renderInline(item.text)}
      </div>`;
}

function renderCancelItem(item) {
  return `
      <div class="cancel-item">
        <div class="cancel-name">${escapeHtml(item.name)}</div>
        <div>${renderInline(item.instructions)}</div>
      </div>`;
}

function renderTeamHandoff(handoff) {
  if (!handoff || !handoff.audience) return "";
  const tasks = (handoff.tasks || []).map((t) => {
    const steps = (t.steps || []).map((s) => `<li>${renderInline(s)}</li>`).join("\n            ");
    const escalate = t.when_to_escalate
      ? `<p class="prompt-note"><strong>When to escalate:</strong> ${renderInline(t.when_to_escalate)}</p>`
      : "";
    return `
        <div class="handoff-task">
          <div class="rec-name" style="font-size:18px;margin-bottom:4px;">${escapeHtml(t.tool)}</div>
          <p style="margin-bottom:8px;">${renderInline(t.what_they_do)}</p>
          <ol>${steps}</ol>
          ${escalate}
        </div>`;
  }).join("\n");
  return `
      <div class="handoff-page">
        <h3 style="font-family:var(--serif);font-size:24px;margin-bottom:8px;">${escapeHtml(handoff.audience)}</h3>
        <p style="margin-bottom:20px;">${renderInline(handoff.intro)}</p>
        ${tasks}
      </div>`;
}

function renderDay30Worksheet(ws) {
  if (!ws || !ws.metrics || ws.metrics.length === 0) return "";
  const rows = ws.metrics.map((m) =>
    `<tr><td>${escapeHtml(m.label)}</td><td style="width:120px;border-bottom:2px solid var(--charcoal);"></td><td>${escapeHtml(m.unit || "")}</td><td style="font-family:var(--mono);font-size:13px;color:var(--sage);">${escapeHtml(m.target || "")}</td></tr>`
  ).join("\n        ");
  return `
      <div class="worksheet">
        <p>${renderInline(ws.intro || "")}</p>
        <table style="margin-top:16px;">
          <thead><tr><th>Metric</th><th>Your number</th><th></th><th>Target</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
}

function renderMilestones(ms) {
  if (!ms) return "";
  const items = [];
  if (ms.month3) items.push(`<div class="milestone"><div class="milestone-label">Month 3</div><p>${renderInline(ms.month3)}</p></div>`);
  if (ms.month6) items.push(`<div class="milestone"><div class="milestone-label">Month 6</div><p>${renderInline(ms.month6)}</p></div>`);
  if (ms.month12) items.push(`<div class="milestone"><div class="milestone-label">Month 12</div><p>${renderInline(ms.month12)}</p></div>`);
  return items.join("\n      ");
}

function renderPlan(plan, opts = {}) {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const preparedDate = opts.preparedDate || new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const extraParagraph = plan.picking && plan.picking.extra_paragraph
    ? `<p>${renderInline(plan.picking.extra_paragraph)}</p>`
    : "";

  // Guardrails — collect items from the new JSON fields
  const guardrails = plan.guardrails || {};
  const neverItems = (guardrails.never_items || []).map(renderGuardrailItem).join("\n      ");
  const cautionItems = (guardrails.caution_items || []).map(renderGuardrailItem).join("\n      ");
  const safeItems = (guardrails.safe_items || []).map(renderGuardrailItem).join("\n      ");
  const wrongItems = (guardrails.wrong_items || []).map(renderGuardrailItem).join("\n      ");
  const cancelItems = (guardrails.cancel_items || []).map(renderCancelItem).join("\n      ");

  const substitutions = {
    FIRST_NAME: escapeHtml(plan.first_name),
    FIRST_NAME_UPPER: escapeHtml(String(plan.first_name || "").toUpperCase()),
    PREPARED_FOR_NAME: escapeHtml(plan.prepared_for_name || plan.first_name),
    PREPARED_FOR_TAGLINE: escapeHtml(plan.prepared_for_tagline || ""),
    PREPARED_DATE: escapeHtml(preparedDate),
    PREPARED_DATE_UPPER: escapeHtml(preparedDate.toUpperCase()),

    OBSERVATIONS: (plan.observations || []).map(renderObservation).join("\n      "),

    PICKING_TITLE: renderInline(plan.picking?.title || ""),
    PICKING_LEDE: renderInline(plan.picking?.lede || ""),
    PICKING_EXTRA_PARAGRAPH: extraParagraph,

    TOOLS_LEDE: renderInline(plan.tools_lede || ""),
    FOUNDATION_TALLY: escapeHtml(plan.foundation_tally || `${(plan.foundation_tools || []).length} items`),
    FOUNDATION_TOOLS: (plan.foundation_tools || []).map(renderToolSummary).join("\n"),
    AI_TALLY: escapeHtml(plan.ai_tally || `${(plan.ai_tools || []).length} items`),
    AI_TOOLS: (plan.ai_tools || []).map(renderToolSummary).join("\n"),

    CUSTOM_BUILD_TITLE: renderInline(plan.custom_build?.title || "A custom tool, <em>built for your exact situation.</em>"),
    CUSTOM_BUILD_LEDE: renderInline(plan.custom_build?.lede || ""),
    CUSTOM_BUILD_CONTENT: renderCustomBuildSummary(plan.custom_build),

    SETUP_GUIDE_TOOLS: [
      ...(plan.foundation_tools || []),
      ...(plan.ai_tools || []),
    ].map(renderToolSetup).filter(Boolean).join("\n"),
    SETUP_GUIDE_CUSTOM_BUILD: renderCustomBuildSetup(plan.custom_build),

    RULED_OUT_LEDE: renderInline(plan.ruled_out?.lede || ""),
    RULED_OUT_ITEMS: (plan.ruled_out?.items || []).map(renderRuledItem).join("\n"),

    PRACTICE_TITLE: renderInline(plan.practice?.title || ""),
    PRACTICE_LEDE: renderInline(plan.practice?.lede || ""),
    PRACTICE_ROWS: (plan.practice?.rows || []).map(renderTableRow).join("\n        "),
    PRACTICE_WEEKLY_TOTAL: escapeHtml(plan.practice?.weekly_total || ""),
    PRACTICE_CAVEAT: renderInline(plan.practice?.caveat || ""),

    ROLLOUT_LEDE: renderInline(plan.rollout?.lede || ""),
    WEEK1_TIME: escapeHtml(plan.rollout?.week1?.time || ""),
    WEEK1_SUMMARY: renderInline(plan.rollout?.week1?.summary || ""),
    WEEK1_BULLETS: (plan.rollout?.week1?.bullets || []).map(renderBullet).join("\n        "),
    WEEK2_TIME: escapeHtml(plan.rollout?.week2?.time || ""),
    WEEK2_SUMMARY: renderInline(plan.rollout?.week2?.summary || ""),
    WEEK2_BULLETS: (plan.rollout?.week2?.bullets || []).map(renderBullet).join("\n        "),
    CHECKIN_NOTE: renderInline(plan.rollout?.checkin_note || ""),

    GUARDRAILS_LEDE: renderInline(guardrails.lede || ""),
    GUARDRAIL_NEVER_ITEMS: neverItems,
    GUARDRAIL_CAUTION_ITEMS: cautionItems,
    GUARDRAIL_SAFE_ITEMS: safeItems,
    GUARDRAIL_WRONG_ITEMS: wrongItems,
    CANCEL_ITEMS: cancelItems,

    NUMBERS_TITLE: renderInline(plan.numbers?.title || ""),
    NUMBERS_LEDE: renderInline(plan.numbers?.lede || ""),
    SOFTWARE_LINES: (plan.numbers?.software_lines || []).map(renderLine).join("\n        "),
    SOFTWARE_TOTAL: escapeHtml(plan.numbers?.software_total || ""),
    IMPLEMENTATION_BOX: (plan.numbers?.implementation_lines || []).length > 0
      ? `<div class="invest-box">
        <h4>Implementation help — optional, one-time</h4>
        ${(plan.numbers.implementation_lines).map(renderLine).join("\n        ")}
        <div class="line total"><span>Full package</span><span class="v">${escapeHtml(plan.numbers?.implementation_total || "")}</span></div>
      </div>`
      : "",
    NET_NOTE_HEADING: renderInline(plan.numbers?.net_note_heading || ""),
    NET_NOTE_BODY: renderInline(plan.numbers?.net_note_body || ""),

    TEAM_HANDOFFS: (plan.team_handoffs || []).length > 0
      ? `<section class="s">
    <div class="s-num">Team Quick-Reference</div>
    <h2 class="s-title">Printable handoffs <em>for the people who use these tools with you.</em></h2>
    <p class="lede">Print these pages and hand them to the right person. Each one covers just what they need to know — no background, no context they don't need.</p>
    ${(plan.team_handoffs || []).map(renderTeamHandoff).filter(Boolean).join("\n")}
  </section>`
      : "",
    DAY30_WORKSHEET: renderDay30Worksheet(plan.day30_worksheet),
    MILESTONES: renderMilestones(plan.milestones),
  };

  let html = template;
  for (const [key, value] of Object.entries(substitutions)) {
    html = html.split(`{{${key}}}`).join(value);
  }

  // Inline the CSS so PDFShift doesn't need to fetch it separately.
  try {
    const css = fs.readFileSync(CSS_PATH, "utf8");
    html = html.replace(
      '<link rel="stylesheet" href="/assets/plan.css"/>',
      `<style>${css}</style>`
    );
  } catch (_) {
    // CSS file not available (e.g. local test) — keep the external link.
  }

  return html;
}

module.exports = { renderPlan };
