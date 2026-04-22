// Fires automatically after every Netlify Forms submission.
// Sends a warm auto-reply to questionnaire submitters via Resend.
// If anything fails, we log and return 200 so Netlify doesn't retry.

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.payload || {};

    if (payload.form_name !== "questionnaire") {
      return { statusCode: 200, body: "skipped: not the questionnaire form" };
    }

    const data = payload.data || {};
    const email = String(data.contact || "").trim();
    const firstName = String(data.name || "").trim().split(/\s+/)[0] || "there";

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      console.log("[auto-reply] skipping: no valid email on submission");
      return { statusCode: 200, body: "skipped: no email" };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[auto-reply] RESEND_API_KEY not set");
      return { statusCode: 200, body: "skipped: no api key" };
    }

    const subject = `We got it, ${firstName} — here's what happens next`;

    const text =
`Thanks for sending that through. I'm Mark, the person who'll be reading your answers and writing your plan.

Here's what the next couple of days look like.

I'll sit down with what you told me — probably tonight or tomorrow — and go through it carefully. Your answers to the friction question and the magic-wand question are usually where the real plan comes from. From there I'll draft something specific to your setup, not a template. Three to five pages, usually. It'll say plainly what I think would help, in what order, and roughly what it would look like week to week if we worked together. If something you're hoping for isn't realistic — or if you'd be better off with someone else entirely — I'll tell you that.

You'll get the plan as a PDF, within two business days. It's yours to keep either way.

If anything pops into your head between now and then that you wish you'd added — the fifteenth thing that drives you crazy, a screenshot of an inbox that's stressing you out, anything — just reply to this email. It comes straight to me.

— Mark
Alongside AI`;

    const html =
`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:32px 16px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;font-size:16px;">
    <p style="margin:0 0 20px;">Thanks for sending that through. I'm Mark, the person who'll be reading your answers and writing your plan.</p>
    <p style="margin:0 0 20px;">Here's what the next couple of days look like.</p>
    <p style="margin:0 0 20px;">I'll sit down with what you told me &mdash; probably tonight or tomorrow &mdash; and go through it carefully. Your answers to the friction question and the magic-wand question are usually where the real plan comes from. From there I'll draft something specific to your setup, not a template. Three to five pages, usually. It'll say plainly what I think would help, in what order, and roughly what it would look like week to week if we worked together. If something you're hoping for isn't realistic &mdash; or if you'd be better off with someone else entirely &mdash; I'll tell you that.</p>
    <p style="margin:0 0 20px;">You'll get the plan as a PDF, within two business days. It's yours to keep either way.</p>
    <p style="margin:0 0 20px;">If anything pops into your head between now and then that you wish you'd added &mdash; the fifteenth thing that drives you crazy, a screenshot of an inbox that's stressing you out, anything &mdash; just reply to this email. It comes straight to me.</p>
    <p style="margin:32px 0 0;">&mdash; Mark<br/><span style="color:#7B9E87;">Alongside AI</span></p>
  </div>
</body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Mark Skeehan <mark@alongsideai.ai>",
        to: [email],
        reply_to: "mark@alongsideai.ai",
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[auto-reply] resend error", res.status, errBody);
      return { statusCode: 200, body: "resend failed (logged)" };
    }

    console.log("[auto-reply] sent to", email);
    return { statusCode: 200, body: "sent" };
  } catch (err) {
    console.error("[auto-reply] handler error", err);
    return { statusCode: 200, body: "error handled" };
  }
};
