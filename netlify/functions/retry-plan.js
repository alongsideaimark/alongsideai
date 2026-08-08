// Visible front door for dead-letter retries. The real work happens in
// retry-plan-background, but "-background" functions return 202 and discard
// their response body — so clicking that link showed a blank page. This
// wrapper validates the link, kicks off the background retry, and returns a
// page a human can actually read. The retry's outcome still arrives by email.
//
// GET /.netlify/functions/retry-plan?id=DL_ID&secret=RETRY_SECRET

function page(title, body) {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title} — Lantern Plan</title></head>
<body style="margin:0;padding:64px 24px;background:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2C3330;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;font-size:17px;">
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;margin:0 0 16px;">${title}</h1>
    ${body}
  </div>
</body></html>`,
  };
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const dlId = params.id;
  const secret = params.secret;
  const retrySecret = process.env.RETRY_SECRET;

  if (!retrySecret || !secret || secret !== retrySecret) {
    return { statusCode: 403, body: "forbidden" };
  }
  if (!dlId) {
    return page("Something's missing", `<p>This retry link has no id on it. Use the link from the failure email.</p>`);
  }

  const baseUrl =
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    process.env.URL;
  if (!baseUrl) {
    return page("Can't start the retry", `<p>The site URL isn't configured, so the retry couldn't be triggered. Check the Netlify environment settings.</p>`);
  }

  try {
    const triggerUrl = `${baseUrl}/.netlify/functions/retry-plan-background?id=${encodeURIComponent(dlId)}&secret=${encodeURIComponent(secret)}`;
    const res = await fetch(triggerUrl, { method: "GET" });
    if (res.status === 202 || res.ok) {
      return page("Retry started", `
        <p>Plan generation for dead-letter <code style="background:#F3EDE3;padding:2px 6px;border-radius:4px;">${dlId}</code> is running now.</p>
        <p>It usually takes 2&ndash;5 minutes. You'll get an email either way &mdash; a "retry succeeded" note with a link to the plan, or a "retry failed" note if it hit trouble again.</p>
        <p style="color:#8A8780;font-size:14px;">You can close this page.</p>`);
    }
    const bodyText = await res.text().catch(() => "");
    return page("Retry didn't start", `<p>The retry endpoint answered ${res.status}. ${bodyText ? `It said: <em>${bodyText.slice(0, 200)}</em>.` : ""}</p><p>The dead-letter record is preserved &mdash; you can try the link again.</p>`);
  } catch (err) {
    console.error("[retry-plan] trigger failed:", err.message);
    return page("Retry didn't start", `<p>Couldn't reach the retry endpoint (${err.message}). The dead-letter record is preserved &mdash; try the link again in a minute.</p>`);
  }
};
