// Creates a Stripe Checkout Session for the Lantern Plan product.
// POST /.netlify/functions/create-checkout
// Returns JSON: { url: "https://checkout.stripe.com/..." }

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error("[create-checkout] STRIPE_PRICE_ID not set");
    return { statusCode: 500, body: "checkout not configured" };
  }

  const siteUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    "https://lanternplan.com";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/questionnaire/?token={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?cancelled=1`,
      payment_method_types: ["card"],
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("[create-checkout] Stripe error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create checkout session" }),
    };
  }
};
