// Renders a plan JSON object (as returned by the drafting prompt) into the
// final HTML by filling slots in template.html. Intentionally tiny — no
// Markdown library, no templating dep. Claude returns mostly plain text with
// `**bold**` and `*italic*` allowed, and that's all we convert.

const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "..", "plan-template", "template.html");

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Converts **bold** and *italic* into <strong>/<em> after escaping HTML.
// Nothing fancy — no links, no lists, no code. Claude has been told this.
function renderInline(md) {
  const esc = escapeHtml(md);
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

function renderTool(tool) {
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
  return `
      <div class="${classes}">
        <div>
          <div class="rec-name">${escapeHtml(tool.name)}${conditionalTag}${buildTag}</div>
          <div class="rec-cost">${escapeHtml(tool.cost)}</div>
        </div>
        <div class="rec-body">
          <p class="what">What it is: ${renderInline(tool.what_it_is)}</p>
          <p class="why">Why it helps you: ${renderInline(tool.why_it_helps_you)}</p>
          ${wontLine}
        </div>
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

function renderPlan(plan, opts = {}) {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const preparedDate = opts.preparedDate || new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const extraParagraph = plan.picking && plan.picking.extra_paragraph
    ? `<p>${renderInline(plan.picking.extra_paragraph)}</p>`
    : "";

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
    FOUNDATION_TOOLS: (plan.foundation_tools || []).map(renderTool).join("\n"),
    AI_TALLY: escapeHtml(plan.ai_tally || `${(plan.ai_tools || []).length} items`),
    AI_TOOLS: (plan.ai_tools || []).map(renderTool).join("\n"),

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

    NUMBERS_TITLE: renderInline(plan.numbers?.title || ""),
    NUMBERS_LEDE: renderInline(plan.numbers?.lede || ""),
    SOFTWARE_LINES: (plan.numbers?.software_lines || []).map(renderLine).join("\n        "),
    SOFTWARE_TOTAL: escapeHtml(plan.numbers?.software_total || ""),
    IMPLEMENTATION_LINES: (plan.numbers?.implementation_lines || []).map(renderLine).join("\n        "),
    IMPLEMENTATION_TOTAL: escapeHtml(plan.numbers?.implementation_total || ""),
    NET_NOTE_HEADING: renderInline(plan.numbers?.net_note_heading || ""),
    NET_NOTE_BODY: renderInline(plan.numbers?.net_note_body || ""),
  };

  let html = template;
  for (const [key, value] of Object.entries(substitutions)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}

module.exports = { renderPlan };
