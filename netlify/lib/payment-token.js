// Shared payment-token helpers. Used by validate-token (the questionnaire's
// gate check) and submission-created (the server-side enforcement point).
//
// Tokens are Stripe Checkout session ids (cs_...), written to the "tokens"
// blob store by stripe-webhook.js. Because Stripe redirects the customer to
// the questionnaire *before* the webhook necessarily fires, lookupToken falls
// back to asking Stripe directly: if the session is paid but the webhook
// hasn't landed yet, we write the token record ourselves and carry on. That
// closes the race where a paying customer sees "invalid payment link."

const stripeLib = require("stripe");

let stripeClient = null;
function stripe() {
  if (!stripeClient && process.env.STRIPE_SECRET_KEY) {
    stripeClient = stripeLib(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

// Returns { status: "valid" | "used" | "not_found" | "error", record }
async function lookupToken(store, token) {
  if (!token) return { status: "not_found", record: null };

  let raw = null;
  let storeErrored = false;
  try {
    raw = await store.get(token);
  } catch (err) {
    console.error("[payment-token] store read failed:", err.message);
    storeErrored = true;
  }

  if (raw) {
    const record = JSON.parse(raw);
    return { status: record.used ? "used" : "valid", record };
  }

  // Not in the store — recover directly from Stripe if this looks like a
  // checkout session id. Covers the webhook race and lost webhooks.
  if (token.startsWith("cs_") && stripe()) {
    try {
      const session = await stripe().checkout.sessions.retrieve(token);
      if (session && session.payment_status === "paid") {
        const record = {
          session_id: token,
          customer_email: (session.customer_details && session.customer_details.email) || null,
          paid_at: new Date().toISOString(),
          used: false,
          recovered_from_stripe: true,
        };
        try {
          await store.set(token, JSON.stringify(record));
          console.log(`[payment-token] recovered ${token} from Stripe (webhook hadn't landed)`);
        } catch (err) {
          console.error("[payment-token] recovered token but store write failed:", err.message);
        }
        return { status: "valid", record };
      }
      // Session exists but isn't paid — treat like no payment.
      return { status: "not_found", record: null };
    } catch (err) {
      // resource_missing means the id genuinely doesn't exist.
      if (err && err.code === "resource_missing") {
        return { status: "not_found", record: null };
      }
      console.error("[payment-token] Stripe lookup failed:", err.message);
      return { status: "error", record: null };
    }
  }

  return { status: storeErrored ? "error" : "not_found", record: null };
}

// Mark a token as consumed so one payment buys exactly one plan.
async function consumeToken(store, token, record) {
  const r = record || { session_id: token };
  r.used = true;
  r.used_at = new Date().toISOString();
  await store.set(token, JSON.stringify(r));
  console.log(`[payment-token] consumed ${token}`);
}

module.exports = { lookupToken, consumeToken };
