// Takes a plain-English revision instruction from Mark, re-calls Claude with
// the current plan + briefing + instruction (web_search enabled so agentic
// critiques can pull fresh info), stores the revised plan, and returns the
// same preview URL so the page can reload with the update in place.
//
// Runs synchronously — Claude revisions take 30–180s, which fits inside the
// default function timeout. If a revision ever hits a timeout we'll switch
// to a -background suffix.

const { connectLambda, getStore } = require("@netlify/blobs");
const { revisePlan } = require("../lib/call-claude");
const { renderPlan } = require("../lib/render-plan");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method not allowed" };
    }

    connectLambda(event);

    const { id, instruction } = JSON.parse(event.body || "{}");
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      return { statusCode: 400, body: "invalid id" };
    }
    if (!instruction || typeof instruction !== "string" || !instruction.trim()) {
      return { statusCode: 400, body: "missing instruction" };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, body: "ANTHROPIC_API_KEY missing" };

    const store = getStore("plans");
    const raw = await store.get(`${id}.json`);
    if (!raw) return { statusCode: 404, body: "plan not found" };

    const record = JSON.parse(raw);
    if (record.status === "sent") {
      return { statusCode: 409, body: "plan already sent — can't revise" };
    }

    console.log(`[revise-plan] ${id} revising with instruction (${instruction.length} chars)`);
    const { plan, usage, searchCount } = await revisePlan({
      currentPlan: record.plan,
      briefing: record.briefing,
      instruction: instruction.trim(),
      apiKey,
    });
    console.log(`[revise-plan] ${id} revision returned; web searches: ${searchCount || 0}; tokens:`, JSON.stringify(usage));

    // Re-render HTML and overwrite the stored record. Keep the revision
    // history in a small array so we can see what's been changed.
    const html = renderPlan(plan);
    const revisions = Array.isArray(record.revisions) ? record.revisions.slice() : [];
    revisions.push({
      at: new Date().toISOString(),
      instruction: instruction.trim(),
      searchCount,
      usage,
    });

    const updated = {
      ...record,
      plan,
      html,
      revisions,
      revised_at: new Date().toISOString(),
    };
    await store.set(`${id}.json`, JSON.stringify(updated));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, id, revisionCount: revisions.length }),
    };
  } catch (err) {
    console.error("[revise-plan] failed:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
