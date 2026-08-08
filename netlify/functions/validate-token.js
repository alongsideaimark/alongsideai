// Payment token validation.
// GET /.netlify/functions/validate-token?token=cs_xxx — check if token is valid
//
// Tokens are consumed server-side by submission-created.js when the
// questionnaire is actually submitted — there is deliberately no public
// "mark used" endpoint anymore. If the webhook hasn't written the token yet,
// lookupToken() recovers it straight from Stripe (see lib/payment-token.js),
// so a paying customer never sees "invalid payment link" during that race.

const { connectLambda, getStore } = require("@netlify/blobs");
const { lookupToken } = require("../lib/payment-token");

function json(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "method not allowed" };
  }

  const token = (event.queryStringParameters && event.queryStringParameters.token) || "";
  if (!token) {
    return json({ valid: false, reason: "missing" });
  }

  try {
    const { status, record } = await lookupToken(getStore("tokens"), token);
    if (status === "valid") {
      return json({ valid: true, email: (record && record.customer_email) || null });
    }
    if (status === "used") {
      return json({ valid: false, reason: "already_used" });
    }
    if (status === "error") {
      return json({ valid: false, reason: "error" });
    }
    return json({ valid: false, reason: "not_found" });
  } catch (err) {
    console.error("[validate-token] error:", err.message);
    return json({ valid: false, reason: "error" });
  }
};
