"""
Local preview renderer — Python port of render-plan.js, used only for local
visual QA since this machine has no Node. Produces plan-test-preview.html at
the repo root from the fixture JSON + template.html.

Run:  python netlify/plan-template/test-render.py
Then visit:  /plan-test-preview.html in the preview server.

Keep this in sync with netlify/lib/render-plan.js if you change the renderer.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
TEMPLATE_PATH = HERE / "template.html"
FIXTURE_PATH = HERE / "test-fixture.json"
OUT_PATH = HERE.parent.parent / "plan-test-preview.html"


def escape_html(s):
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def render_inline(md):
    if md is None:
        return ""
    esc = escape_html(md)
    esc = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", esc)
    esc = re.sub(r"(^|[^*])\*([^*]+)\*", r"\1<em>\2</em>", esc)
    return esc


def render_paragraphs(md):
    text = (md or "").strip()
    if not text:
        return ""
    paras = re.split(r"\n\s*\n", text)
    return "\n".join(f"<p>{render_inline(p).replace(chr(10), '<br/>')}</p>" for p in paras)


def render_observation(text):
    return f'<div class="obs-item"><div class="dot"></div><p>{render_inline(text)}</p></div>'


def render_tool(tool):
    conditional = ""
    if tool.get("conditional"):
        conditional = ' <em style="font-style:normal;color:#8b6f28;font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-left:8px;">Conditional</em>'
    wont_line = ""
    if tool.get("what_it_wont_fix"):
        wont_line = f'<p class="wont">{render_inline(tool["what_it_wont_fix"])}</p>'
    return f"""
      <div class="rec">
        <div>
          <div class="rec-name">{escape_html(tool["name"])}{conditional}</div>
          <div class="rec-cost">{escape_html(tool["cost"])}</div>
        </div>
        <div class="rec-body">
          <p class="what">What it is: {render_inline(tool["what_it_is"])}</p>
          <p class="why">Why it helps you: {render_inline(tool["why_it_helps_you"])}</p>
          {wont_line}
        </div>
      </div>"""


def render_ruled_item(item):
    return f"""
      <div class="ruled-item">
        <div class="ruled-name">{escape_html(item["name"])}</div>
        <p class="ruled-reason">{render_inline(item["reason"])}</p>
      </div>"""


def render_row(row):
    return (
        f'<tr><td>{escape_html(row["task"])}</td>'
        f'<td>{render_inline(row["today"])}</td>'
        f'<td>{render_inline(row["with_plan"])}</td>'
        f'<td class="num" style="text-align:right">{escape_html(row["weekly_saved"])}</td></tr>'
    )


def render_bullet(md):
    return f"<li>{render_inline(md)}</li>"


def render_line(line):
    return f'<div class="line"><span>{render_inline(line["label"])}</span><span class="v">{escape_html(line["cost"])}</span></div>'


def main():
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    plan = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    prepared_date = "April 23, 2026"

    picking = plan.get("picking", {}) or {}
    practice = plan.get("practice", {}) or {}
    rollout = plan.get("rollout", {}) or {}
    week1 = (rollout.get("week1") or {})
    week2 = (rollout.get("week2") or {})
    numbers = plan.get("numbers", {}) or {}
    ruled = plan.get("ruled_out", {}) or {}

    extra = picking.get("extra_paragraph") or ""
    extra_html = f"<p>{render_inline(extra)}</p>" if extra else ""

    subs = {
        "FIRST_NAME": escape_html(plan["first_name"]),
        "FIRST_NAME_UPPER": escape_html(plan["first_name"].upper()),
        "PREPARED_FOR_NAME": escape_html(plan.get("prepared_for_name") or plan["first_name"]),
        "PREPARED_FOR_TAGLINE": escape_html(plan.get("prepared_for_tagline") or ""),
        "PREPARED_DATE": escape_html(prepared_date),
        "PREPARED_DATE_UPPER": escape_html(prepared_date.upper()),
        "OBSERVATIONS": "\n      ".join(render_observation(o) for o in plan.get("observations", [])),
        "PICKING_TITLE": render_inline(picking.get("title", "")),
        "PICKING_LEDE": render_inline(picking.get("lede", "")),
        "PICKING_EXTRA_PARAGRAPH": extra_html,
        "TOOLS_LEDE": render_inline(plan.get("tools_lede", "")),
        "FOUNDATION_TALLY": escape_html(plan.get("foundation_tally") or f'{len(plan.get("foundation_tools", []))} items'),
        "FOUNDATION_TOOLS": "\n".join(render_tool(t) for t in plan.get("foundation_tools", [])),
        "AI_TALLY": escape_html(plan.get("ai_tally") or f'{len(plan.get("ai_tools", []))} items'),
        "AI_TOOLS": "\n".join(render_tool(t) for t in plan.get("ai_tools", [])),
        "RULED_OUT_LEDE": render_inline(ruled.get("lede", "")),
        "RULED_OUT_ITEMS": "\n".join(render_ruled_item(i) for i in ruled.get("items", [])),
        "PRACTICE_TITLE": render_inline(practice.get("title", "")),
        "PRACTICE_LEDE": render_inline(practice.get("lede", "")),
        "PRACTICE_ROWS": "\n        ".join(render_row(r) for r in practice.get("rows", [])),
        "PRACTICE_WEEKLY_TOTAL": escape_html(practice.get("weekly_total", "")),
        "PRACTICE_CAVEAT": render_inline(practice.get("caveat", "")),
        "ROLLOUT_LEDE": render_inline(rollout.get("lede", "")),
        "WEEK1_TIME": escape_html(week1.get("time", "")),
        "WEEK1_SUMMARY": render_inline(week1.get("summary", "")),
        "WEEK1_BULLETS": "\n        ".join(render_bullet(b) for b in week1.get("bullets", [])),
        "WEEK2_TIME": escape_html(week2.get("time", "")),
        "WEEK2_SUMMARY": render_inline(week2.get("summary", "")),
        "WEEK2_BULLETS": "\n        ".join(render_bullet(b) for b in week2.get("bullets", [])),
        "CHECKIN_NOTE": render_inline(rollout.get("checkin_note", "")),
        "NUMBERS_TITLE": render_inline(numbers.get("title", "")),
        "NUMBERS_LEDE": render_inline(numbers.get("lede", "")),
        "SOFTWARE_LINES": "\n        ".join(render_line(l) for l in numbers.get("software_lines", [])),
        "SOFTWARE_TOTAL": escape_html(numbers.get("software_total", "")),
        "IMPLEMENTATION_LINES": "\n        ".join(render_line(l) for l in numbers.get("implementation_lines", [])),
        "IMPLEMENTATION_TOTAL": escape_html(numbers.get("implementation_total", "")),
        "NET_NOTE_HEADING": render_inline(numbers.get("net_note_heading", "")),
        "NET_NOTE_BODY": render_inline(numbers.get("net_note_body", "")),
    }

    out = template
    for key, val in subs.items():
        out = out.replace("{{" + key + "}}", val)

    # Detect any unfilled slots.
    leftover = re.findall(r"\{\{[A-Z_]+\}\}", out)
    if leftover:
        print(f"WARNING: {len(leftover)} unfilled slots: {sorted(set(leftover))}")

    OUT_PATH.write_text(out, encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(out)} bytes)")


if __name__ == "__main__":
    main()
