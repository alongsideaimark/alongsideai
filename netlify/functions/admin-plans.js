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
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "method not allowed" };
    }

    if (!checkAuth(event)) return unauthorized();

    connectLambda(event);
    const store = getStore("plans");
    const params = event.queryStringParameters || {};

    // Mode 1: List all plans
    if (params.list === "1") {
      const listing = await store.list();
      const keys = (listing && listing.blobs) ? listing.blobs.map((b) => b.key) : [];
      const summaries = [];

      for (const key of keys) {
        if (!key.endsWith(".json")) continue;
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

    // Mode 2 & 3: Get a specific plan
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
