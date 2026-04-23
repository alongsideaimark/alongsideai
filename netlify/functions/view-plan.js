// Serves a rendered plan HTML page by id, plus an "approve and send" bar
// overlayed on top that lets Mark ship the plan to the customer in one click.
// URL shape: /plans/:id  (via the netlify.toml redirect).

const { connectLambda, getStore } = require("@netlify/blobs");

function notFound() {
  return {
    statusCode: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<!doctype html><meta charset="utf-8"><title>Not found</title>
<style>body{font-family:-apple-system,sans-serif;background:#FAF6F1;color:#1F1F1D;padding:80px 24px;text-align:center}
a{color:#7A8B6F}</style>
<h1 style="font-family:Georgia,serif;">This plan link is no longer valid.</h1>
<p>It may have been sent already, or the link is mistyped. If you think this is an error, email <a href="mailto:mark@alongsideai.ai">mark@alongsideai.ai</a>.</p>`,
  };
}

function injectReviewBar(html, record) {
  if (record.status !== "draft") {
    // Already approved/sent — don't show review controls.
    return html;
  }

  const banner =
`<div id="mark-review-bar" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1F1F1D;color:#FAF6F1;padding:14px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 2px 12px rgba(0,0,0,.2);">
  <div>
    <strong style="color:#FAF6F1;">Draft for ${record.customer_first_name}</strong>
    <span style="color:#9E9E9C;margin-left:10px;">· ${record.customer_email || "no email"} · created ${new Date(record.created_at).toLocaleString()}</span>
  </div>
  <div style="display:flex;gap:10px;">
    <button id="mark-approve-btn" style="background:#7A8B6F;color:#FAF6F1;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;">Approve &amp; send to customer</button>
  </div>
</div>
<style>
  @media print { #mark-review-bar { display: none !important; } }
  body { padding-top: 60px; }
</style>
<script>
(function(){
  var btn = document.getElementById("mark-approve-btn");
  if (!btn) return;
  btn.addEventListener("click", function(){
    var ok = confirm("Send this plan to ${record.customer_first_name}${record.customer_email ? ' at ' + record.customer_email : ''}?\\n\\nThis converts it to a PDF and emails the customer.");
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = "Sending...";
    fetch("/.netlify/functions/approve-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: ${JSON.stringify(record.id)} })
    }).then(function(r){
      if (!r.ok) return r.text().then(function(t){ throw new Error(t); });
      return r.json();
    }).then(function(){
      btn.textContent = "Sent";
      btn.style.background = "#5e6f56";
      setTimeout(function(){ window.location.reload(); }, 1200);
    }).catch(function(err){
      alert("Send failed: " + err.message);
      btn.disabled = false;
      btn.textContent = "Approve & send to customer";
    });
  });
})();
</script>`;

  // Inject right after <body>.
  return html.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
}

exports.handler = async (event) => {
  try {
    connectLambda(event);
    const id = (event.queryStringParameters && event.queryStringParameters.id) || "";
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      return notFound();
    }

    const store = getStore("plans");
    const raw = await store.get(`${id}.json`);
    if (!raw) return notFound();

    const record = JSON.parse(raw);
    const withBar = injectReviewBar(record.html, record);

    return {
      statusCode: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
      body: withBar,
    };
  } catch (err) {
    console.error("[view-plan] error", err);
    return { statusCode: 500, body: "server error" };
  }
};
