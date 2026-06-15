// Payment token validation and consumption.
// GET  /.netlify/functions/validate-token?token=cs_xxx — check if token is valid
// POST /.netlify/functions/validate-token { token } — mark token as used

const { connectLambda, getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  connectLambda(event);

  // POST: mark a token as used after successful questionnaire submission.
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    const token = body.token || "";
    if (!token) {
      return { statusCode: 400, body: "missing token" };
    }
    const store = getStore("tokens");
    try {
      const raw = await store.get(token);
      if (raw) {
        const record = JSON.parse(raw);
        record.used = true;
        record.used_at = new Date().toISOString();
        await store.set(token, JSON.stringify(record));
        console.log(`[validate-token] marked ${token} as used`);
      }
    } catch (err) {
      console.error("[validate-token] error marking used:", err.message);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  }

  const token = (event.queryStringParameters && event.queryStringParameters.token) || "";
  if (!token) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valid: false, reason: "missing" }),
    };
  }

  const store = getStore("tokens");
  try {
    const raw = await store.get(token);
    if (!raw) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valid: false, reason: "not_found" }),
      };
    }

    const record = JSON.parse(raw);
    if (record.used) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valid: false, reason: "already_used" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valid: true,
        email: record.customer_email || null,
      }),
    };
  } catch (err) {
    console.error("[validate-token] error:", err.message);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valid: false, reason: "error" }),
    };
  }
};
