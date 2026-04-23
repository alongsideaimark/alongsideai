// Local sanity check — renders the test fixture through the real renderer
// and writes the output to /plan-test-preview.html at the repo root. Open
// that in the preview server to eyeball the template end-to-end.
//
// Run from the repo root:  node netlify/plan-template/test-render.js
// Then visit /plan-test-preview.html in the preview.

const fs = require("fs");
const path = require("path");
const { renderPlan } = require("../lib/render-plan");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "test-fixture.json"), "utf8"));
const html = renderPlan(fixture, { preparedDate: "April 23, 2026" });

const outPath = path.join(__dirname, "..", "..", "plan-test-preview.html");
fs.writeFileSync(outPath, html, "utf8");
console.log("Wrote", outPath, `(${html.length} bytes)`);
