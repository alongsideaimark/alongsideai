const { connectLambda, getStore } = require("@netlify/blobs");
const { getPdf } = require("../lib/pdf");

function unauthorized() {
  return { statusCode: 401, body: "unauthorized" };
}

function checkAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || !token || token !== expected) return false;
  return true;
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    if (method !== "GET" && method !== "POST") {
      return { statusCode: 405, body: "method not allowed" };
    }

    if (!checkAuth(event)) return unauthorized();

    connectLambda(event);
    const store = getStore("plans");
    const params = event.queryStringParameters || {};

    // Mode 1: List all plans (filters out .eval.json entries)
    if (params.list === "1") {
      const listing = await store.list();
      const allKeys = (listing && listing.blobs) ? listing.blobs.map((b) => b.key) : [];
      const planKeys = allKeys.filter((k) => k.endsWith(".json") && !k.endsWith(".eval.json"));
      const evalKeys = new Set(allKeys.filter((k) => k.endsWith(".eval.json")));
      const summaries = [];

      for (const key of planKeys) {
        const raw = await store.get(key);
        if (!raw) continue;
        try {
          const r = JSON.parse(raw);
          summaries.push({
            id: r.id,
            name: r.customer_first_name,
            email: r.customer_email,
            status: r.status,
            created_at: r.created_at,
            sent_at: r.sent_at || null,
            test: r.test || false,
            critic_verdict: (r.critique && r.critique.layer2 && r.critique.layer2.verdict) || null,
            critic_score: (r.critique && r.critique.layer2 && r.critique.layer2.score) || null,
            hard_fails: (r.critique && r.critique.hardFails && r.critique.hardFails.length) || 0,
            soft_fails: (r.critique && r.critique.softFails && r.critique.softFails.length) || 0,
            revision_count: Array.isArray(r.customer_revisions) ? r.customer_revisions.length : 0,
            has_eval: evalKeys.has(`${r.id}.eval.json`),
            // Self-correcting loop metadata
            eval_iterations: Array.isArray(r.iterations) ? r.iterations.length : null,
            eval_converged: typeof r.converged === "boolean" ? r.converged : null,
            eval_verdict: r.final_eval && r.final_eval.verdict ? r.final_eval.verdict : null,
            eval_scores: r.final_eval && r.final_eval.scores
              ? Object.fromEntries(Object.entries(r.final_eval.scores).map(([k, v]) => [k, v.score]))
              : null,
          });
        } catch (_) {}
      }

      summaries.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      // Check which plans have archived PDFs
      for (const s of summaries) {
        const pdf = await getPdf(store, s.id);
        s.has_pdf = !!pdf;
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plans: summaries, count: summaries.length }),
      };
    }

    // Mode 2 & 3 & 4 & 5: Get a specific plan / pdf / eval / trigger eval
    const id = params.id;
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      return { statusCode: 400, body: "missing or invalid id" };
    }

    // Mode 3: Get PDF binary
    if (params.pdf === "1") {
      const pdfBuffer = await getPdf(store, id);
      if (!pdfBuffer) {
        return { statusCode: 404, body: "no pdf archived for this plan" };
      }
      return {
        statusCode: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="plan-${id}.pdf"`,
        },
        body: pdfBuffer.toString("base64"),
        isBase64Encoded: true,
      };
    }

    // Mode 4: Get evaluation JSON
    if (params.eval === "1") {
      const evalRaw = await store.get(`${id}.eval.json`);
      if (!evalRaw) {
        return { statusCode: 404, body: "no evaluation for this plan — trigger one with ?evaluate=1&id=" + id };
      }
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: evalRaw,
      };
    }

    // Mode 5: Trigger evaluation (POST or GET both accepted for convenience)
    if (params.evaluate === "1") {
      const planRaw = await store.get(`${id}.json`);
      if (!planRaw) {
        return { statusCode: 404, body: `plan ${id} not found` };
      }

      const baseUrl =
        process.env.DEPLOY_PRIME_URL ||
        process.env.DEPLOY_URL ||
        process.env.URL;

      if (!baseUrl) {
        return { statusCode: 500, body: "no base url env var; cannot trigger background function" };
      }

      const triggerUrl = `${baseUrl}/.netlify/functions/evaluate-plan-background`;
      const triggerRes = await fetch(triggerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (triggerRes.status !== 202 && !triggerRes.ok) {
        const errBody = await triggerRes.text().catch(() => "(no body)");
        return { statusCode: 500, body: `evaluator trigger returned ${triggerRes.status}: ${errBody}` };
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          id,
          message: "evaluation triggered; will be available at ?eval=1&id=" + id + " in 2-5 minutes",
        }),
      };
    }

    // Mode 2: Get full plan JSON
    const raw = await store.get(`${id}.json`);
    if (!raw) {
      return { statusCode: 404, body: "plan not found" };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: raw,
    };
  } catch (err) {
    console.error("[admin-plans] error:", err.stack || err.message);
    return { statusCode: 500, body: `error: ${err.message}` };
  }
};
