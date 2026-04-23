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

  const revisionCount = Array.isArray(record.revisions) ? record.revisions.length : 0;
  const revisedTag = revisionCount > 0
    ? ` · <span style="color:#C9B88C;">${revisionCount} revision${revisionCount === 1 ? "" : "s"}</span>`
    : "";

  const banner =
`<div id="mark-review-bar" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1F1F1D;color:#FAF6F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;box-shadow:0 2px 12px rgba(0,0,0,.2);">
  <div style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div>
      <strong style="color:#FAF6F1;">Draft for ${record.customer_first_name}</strong>
      <span style="color:#9E9E9C;margin-left:10px;">· ${record.customer_email || "no email"} · created ${new Date(record.created_at).toLocaleString()}${revisedTag}</span>
    </div>
    <div style="display:flex;gap:10px;">
      <button id="mark-revise-toggle" style="background:transparent;color:#FAF6F1;border:1px solid #555;padding:8px 14px;border-radius:6px;font-weight:500;cursor:pointer;font-size:14px;">Revise draft</button>
      <button id="mark-approve-btn" style="background:#7A8B6F;color:#FAF6F1;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;">Approve &amp; send to customer</button>
    </div>
  </div>
  <div id="mark-revise-panel" style="display:none;padding:0 20px 18px;border-top:1px solid #333;">
    <div style="padding:14px 0 10px;color:#C9C9C7;font-size:13px;line-height:1.5;">
      Plain English. Specific edits, scoped critiques, or agentic audits (<em style="color:#9E9E9C;font-style:italic;">e.g., "verify the tool picks are still current," "re-read the briefing and tell me what threads I missed," "tighten section 03"</em>). Claude can run fresh web searches if the instruction calls for it.
    </div>
    <textarea id="mark-revise-input" rows="4" placeholder="What would you like changed or reviewed?" style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:8px;border:1px solid #555;background:#2a2a28;color:#FAF6F1;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical;min-height:90px;"></textarea>
    <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div id="mark-revise-status" style="color:#9E9E9C;font-size:13px;"></div>
      <button id="mark-revise-submit" style="background:#9E7B84;color:#FAF6F1;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;">Apply revision</button>
    </div>
  </div>
</div>
<style>
  @media print { #mark-review-bar { display: none !important; } }
  body { padding-top: 60px; }
</style>
<script>
(function(){
  var PLAN_ID = ${JSON.stringify(record.id)};
  var approveBtn = document.getElementById("mark-approve-btn");
  var reviseToggle = document.getElementById("mark-revise-toggle");
  var revisePanel = document.getElementById("mark-revise-panel");
  var reviseInput = document.getElementById("mark-revise-input");
  var reviseSubmit = document.getElementById("mark-revise-submit");
  var reviseStatus = document.getElementById("mark-revise-status");

  if (approveBtn){
    approveBtn.addEventListener("click", function(){
      var ok = confirm("Send this plan to ${record.customer_first_name}${record.customer_email ? ' at ' + record.customer_email : ''}?\\n\\nThis converts it to a PDF and emails the customer.");
      if (!ok) return;
      approveBtn.disabled = true;
      approveBtn.textContent = "Sending...";
      fetch("/.netlify/functions/approve-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: PLAN_ID })
      }).then(function(r){
        if (!r.ok) return r.text().then(function(t){ throw new Error(t); });
        return r.json();
      }).then(function(){
        approveBtn.textContent = "Sent";
        approveBtn.style.background = "#5e6f56";
        setTimeout(function(){ window.location.reload(); }, 1200);
      }).catch(function(err){
        alert("Send failed: " + err.message);
        approveBtn.disabled = false;
        approveBtn.textContent = "Approve & send to customer";
      });
    });
  }

  if (reviseToggle){
    reviseToggle.addEventListener("click", function(){
      var open = revisePanel.style.display !== "none";
      revisePanel.style.display = open ? "none" : "block";
      reviseToggle.textContent = open ? "Revise draft" : "Hide revision panel";
      if (!open){ setTimeout(function(){ reviseInput.focus(); }, 50); }
    });
  }

  if (reviseSubmit){
    var INITIAL_REVISION_COUNT = ${Array.isArray(record.revisions) ? record.revisions.length : 0};

    var pollForRevision = function(startedAt){
      // Poll the status endpoint; resolve when revision_count has gone up.
      var POLL_INTERVAL_MS = 5000;
      var MAX_WAIT_MS = 4 * 60 * 1000; // 4 minutes — plenty for a long revision
      fetch("/.netlify/functions/view-plan?id=" + encodeURIComponent(PLAN_ID) + "&status=1", {
        cache: "no-store",
      }).then(function(r){
        if (!r.ok) throw new Error("status poll returned " + r.status);
        return r.json();
      }).then(function(meta){
        if ((meta.revision_count || 0) > INITIAL_REVISION_COUNT){
          reviseStatus.textContent = "Revision applied. Reloading...";
          setTimeout(function(){ window.location.reload(); }, 500);
          return;
        }
        if (Date.now() - startedAt > MAX_WAIT_MS){
          reviseStatus.textContent = "";
          alert("Revision is taking longer than expected. Check the generate-plan-background logs on Netlify.");
          reviseSubmit.disabled = false;
          reviseSubmit.textContent = "Apply revision";
          return;
        }
        var elapsed = Math.round((Date.now() - startedAt) / 1000);
        reviseStatus.textContent = "Revising... " + elapsed + "s elapsed. Claude may be running web searches.";
        setTimeout(function(){ pollForRevision(startedAt); }, POLL_INTERVAL_MS);
      }).catch(function(err){
        // Transient poll failure — just try again.
        setTimeout(function(){ pollForRevision(startedAt); }, POLL_INTERVAL_MS);
      });
    };

    var runRevision = function(){
      var instruction = (reviseInput.value || "").trim();
      if (!instruction){ reviseInput.focus(); return; }
      reviseSubmit.disabled = true;
      reviseSubmit.textContent = "Revising...";
      reviseStatus.textContent = "Revision kicked off. This usually takes 30–180 seconds.";
      // Background function: returns 202 accepted, work continues server-side.
      fetch("/.netlify/functions/revise-plan-background", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: PLAN_ID, instruction: instruction })
      }).then(function(r){
        if (r.status !== 202 && !r.ok) return r.text().then(function(t){ throw new Error(t); });
        // Whether 202 or 200, start polling for the revision to land.
        pollForRevision(Date.now());
      }).catch(function(err){
        reviseStatus.textContent = "";
        alert("Revision failed: " + err.message);
        reviseSubmit.disabled = false;
        reviseSubmit.textContent = "Apply revision";
      });
    };
    reviseSubmit.addEventListener("click", runRevision);
    reviseInput.addEventListener("keydown", function(e){
      // Cmd/Ctrl + Enter submits.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter"){ e.preventDefault(); runRevision(); }
    });
  }
})();
</script>`;

  // Inject right after <body>.
  return html.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
}

exports.handler = async (event) => {
  try {
    connectLambda(event);

    // Try to recover the id from either the query string (redirect path) or
    // the URL path itself (direct /plans/:id hit that somehow bypassed the
    // redirect substitution).
    const queryId = (event.queryStringParameters && event.queryStringParameters.id) || "";
    const pathMatch = /\/plans\/([A-Za-z0-9_-]+)/.exec(event.path || event.rawUrl || "");
    const pathId = pathMatch ? pathMatch[1] : "";
    const id = queryId || pathId;

    // Status mode: return lightweight JSON metadata for the client-side
    // revision poller (so it can tell when a background revision completes).
    const statusMode = event.queryStringParameters && event.queryStringParameters.status === "1";

    if (!statusMode) {
      console.log(`[view-plan] path="${event.path || ""}" rawUrl="${event.rawUrl || ""}" queryId="${queryId}" pathId="${pathId}" finalId="${id}"`);
    }

    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      if (!statusMode) console.log("[view-plan] id failed regex, returning 404");
      return statusMode
        ? { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "invalid id" }) }
        : notFound();
    }

    const store = getStore("plans");
    const raw = await store.get(`${id}.json`);
    if (!raw) {
      if (!statusMode) {
        try {
          const listing = await store.list();
          const keys = (listing && listing.blobs) ? listing.blobs.map((b) => b.key) : [];
          console.log(`[view-plan] blob "${id}.json" not found. store has ${keys.length} keys: ${JSON.stringify(keys.slice(0, 10))}`);
        } catch (listErr) {
          console.error(`[view-plan] also failed to list keys: ${listErr.message}`);
        }
      }
      return statusMode
        ? { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "not found" }) }
        : notFound();
    }
    if (!statusMode) console.log(`[view-plan] found blob for id="${id}" (${raw.length} bytes)`);

    const record = JSON.parse(raw);

    // Status mode returns just the metadata the revision poller needs.
    if (statusMode) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({
          id: record.id,
          status: record.status,
          revision_count: Array.isArray(record.revisions) ? record.revisions.length : 0,
          revised_at: record.revised_at || null,
        }),
      };
    }

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
