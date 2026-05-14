// Background function — runs the internal evaluator against a stored plan and
// writes the evaluation back to the same blob store as `${id}.eval.json`.
// "-background" suffix gives 15-min timeout (evaluator is slow due to web search).
//
// Triggered by admin-plans.js when called with ?evaluate=1&id=X.
// Internal-only — never customer-facing.

const { connectLambda, getStore } = require("@netlify/blobs");
const { evaluatePlan } = require("../lib/evaluator");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method not allowed" };
    }

    connectLambda(event);

    const payload = JSON.parse(event.body || "{}");
    const id = payload.id;
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      return { statusCode: 400, body: "missing or invalid id" };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[evaluate-plan] ANTHROPIC_API_KEY not set");
      return { statusCode: 500, body: "no anthropic key" };
    }

    const store = getStore("plans");
    const raw = await store.get(`${id}.json`);
    if (!raw) {
      return { statusCode: 404, body: `plan ${id} not found` };
    }

    const record = JSON.parse(raw);
    if (!record.plan || !record.briefing) {
      return { statusCode: 400, body: `plan ${id} missing briefing or plan content` };
    }

    console.log(`[evaluate-plan] evaluating ${id} (${record.customer_first_name})`);
    const started = Date.now();

    const { evaluation, usage, searchCount } = await evaluatePlan({
      briefing: record.briefing,
      plan: record.plan,
      apiKey,
    });

    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`[evaluate-plan] ${id} done in ${elapsed}s; ${searchCount} searches; verdict: ${evaluation.verdict}`);

    const evalRecord = {
      plan_id: id,
      evaluated_at: new Date().toISOString(),
      evaluation,
      usage,
      search_count: searchCount,
      elapsed_seconds: elapsed,
    };

    await store.set(`${id}.eval.json`, JSON.stringify(evalRecord));
    console.log(`[evaluate-plan] stored eval for ${id}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        id,
        verdict: evaluation.verdict,
        scores: evaluation.scores,
      }),
    };
  } catch (err) {
    console.error("[evaluate-plan] failed:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
