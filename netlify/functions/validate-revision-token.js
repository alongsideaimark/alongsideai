// Validates a customer revision token and returns plan metadata for the
// /revise/ page. Does NOT modify any data — read-only lookup.
//
// GET /.netlify/functions/validate-revision-token?token=xxx
//
// Returns 200 + JSON on success, 404 if token not found, 400 if missing.

const { connectLambda, getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    connectLambda(event);

    const token = (event.queryStringParameters && event.queryStringParameters.token) || "";
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return { statusCode: 400, body: "missing or invalid token" };
    }

    const store = getStore("plans");
    const listing = await store.list();
    const keys = (listing && listing.blobs) ? listing.blobs.map((b) => b.key) : [];

    let record = null;
    for (const key of keys) {
      const raw = await store.get(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.revision_token === token) {
          record = parsed;
          break;
        }
      } catch (_) {}
    }

    if (!record) {
      return { statusCode: 404, body: "token not found" };
    }

    const now = new Date();
    const expires = record.revision_window_expires_at ? new Date(record.revision_window_expires_at) : null;
    const expired = expires ? now > expires : false;
    const remaining = record.customer_revisions_remaining || 0;

    const priorRevisions = Array.isArray(record.customer_revisions)
      ? record.customer_revisions.map((r) => ({
          instruction: r.instruction || "",
          at: r.at ? new Date(r.at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "",
        }))
      : [];

    const createdAt = record.created_at
      ? new Date(record.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({
        firstName: record.customer_first_name || "",
        createdAt,
        remaining,
        expired,
        priorRevisions,
      }),
    };
  } catch (err) {
    console.error("[validate-revision-token] error:", err.stack || err.message);
    return { statusCode: 500, body: "server error" };
  }
};
