// Stripe webhook handler. Listens for checkout.session.completed events
// and writes a payment token to the "tokens" blob store. The questionnaire
// page reads this token to gate access.
//
// POST /.netlify/functions/stripe-webhook

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { connectLambda, getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  const sig = event.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error("[stripe-webhook] missing signature or webhook secret");
    return { statusCode: 400, body: "missing signature" };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err.message);
    return { statusCode: 400, body: "signature verification failed" };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "ignored" };
  }

  const session = stripeEvent.data.object;
  const sessionId = session.id;
  const customerEmail = session.customer_details && session.customer_details.email;

  const store = getStore("tokens");
  await store.set(sessionId, JSON.stringify({
    session_id: sessionId,
    customer_email: customerEmail || null,
    paid_at: new Date().toISOString(),
    used: false,
  }));

  console.log(`[stripe-webhook] token written for session ${sessionId}`);
  return { statusCode: 200, body: "ok" };
};
