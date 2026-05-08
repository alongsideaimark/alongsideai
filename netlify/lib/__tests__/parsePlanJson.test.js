const assert = require("assert");
const { parsePlanJson } = require("../call-claude");

// Literal newlines inside a JSON string value — the exact production failure.
// Without the fix, JSON.parse throws "Bad control character in string literal".
// After the fix, the literal newline is escaped to \n in the JSON text, and
// JSON.parse interprets it as a real newline in the parsed value.
const withLiteralNewlines = '{"title": "line one\nline two\nline three", "ok": true}';
const parsed1 = parsePlanJson(withLiteralNewlines);
assert.strictEqual(parsed1.title, "line one\nline two\nline three");
assert.strictEqual(parsed1.ok, true);
console.log("PASS: literal newlines escaped");

// Literal tabs inside a JSON string value
const withLiteralTabs = '{"desc": "col1\tcol2\tcol3"}';
const parsed2 = parsePlanJson(withLiteralTabs);
assert.strictEqual(parsed2.desc, "col1\tcol2\tcol3");
console.log("PASS: literal tabs escaped");

// Literal carriage returns
const withCR = '{"text": "hello\r\nworld"}';
const parsed3 = parsePlanJson(withCR);
assert.strictEqual(parsed3.text, "hello\r\nworld");
console.log("PASS: literal CR+LF escaped");

// Already-escaped sequences should pass through unchanged
const alreadyEscaped = '{"msg": "line one\\nline two"}';
const parsed4 = parsePlanJson(alreadyEscaped);
assert.strictEqual(parsed4.msg, "line one\nline two");
console.log("PASS: already-escaped \\n preserved");

// Surrounding preamble text stripped (Claude often wraps JSON in prose)
const withPreamble = 'Here is the plan:\n{"name": "test"}  \nDone.';
const parsed5 = parsePlanJson(withPreamble);
assert.strictEqual(parsed5.name, "test");
console.log("PASS: preamble/trailing text stripped");

// No JSON at all throws
assert.throws(() => parsePlanJson("no json here"), /no JSON object found/);
console.log("PASS: missing JSON throws");

// Nested objects with control chars
const nested = '{"outer": {"inner": "has\nnewline"}, "arr": ["a\tb"]}';
const parsed6 = parsePlanJson(nested);
assert.strictEqual(parsed6.outer.inner, "has\nnewline");
assert.strictEqual(parsed6.arr[0], "a\tb");
console.log("PASS: nested objects with control chars");

console.log("\nAll parsePlanJson tests passed.");
