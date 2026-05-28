#!/usr/bin/env node
// One-off migration: backfill `state` + `history` onto existing plan records
// that only have the legacy `status` field.
//
// Run locally:  node netlify/lib/migrate-plan-states.js
//
// Requires NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in the environment (or
// run via `netlify dev` which sets them automatically).
//
// Dry-run by default — pass --write to actually persist changes.

const { getStore } = require("@netlify/blobs");

const STATUS_TO_STATE = {
  draft: "review",
  needs_review: "review",
  sent: "sent",
  pending: "pending",
  generating: "generating",
  review: "review",
  revising: "revising",
  approved: "approved",
  failed: "failed",
};

async function migrate() {
  const dryRun = !process.argv.includes("--write");
  if (dryRun) {
    console.log("DRY RUN — pass --write to persist changes\n");
  }

  const store = getStore("plans");
  const listing = await store.list();
  const keys = (listing && listing.blobs) ? listing.blobs.map((b) => b.key) : [];
  const planKeys = keys.filter((k) => k.endsWith(".json") && !k.endsWith(".eval.json") && !k.endsWith(".pdf.json"));

  let migrated = 0;
  let skipped = 0;
  let warnings = 0;

  for (const key of planKeys) {
    const raw = await store.get(key);
    if (!raw) continue;

    let record;
    try {
      record = JSON.parse(raw);
    } catch (_) {
      console.warn(`  WARN: ${key} — not valid JSON, skipping`);
      warnings++;
      continue;
    }

    if (record.state && record.history) {
      skipped++;
      continue;
    }

    const legacyStatus = record.status;
    if (!legacyStatus) {
      console.warn(`  WARN: ${key} (${record.id}) — no status field, skipping`);
      warnings++;
      continue;
    }

    const newState = STATUS_TO_STATE[legacyStatus];
    if (!newState) {
      console.warn(`  WARN: ${key} (${record.id}) — unknown status "${legacyStatus}", skipping`);
      warnings++;
      continue;
    }

    record.state = newState;
    record.history = [{
      from: null,
      to: newState,
      at: record.created_at || new Date().toISOString(),
      reason: `migrated from legacy status "${legacyStatus}"`,
    }];

    if (legacyStatus === "needs_review") {
      record.flags = { ...record.flags, hasHardFails: true };
    }

    console.log(`  ${record.id}: status="${legacyStatus}" → state="${newState}"${legacyStatus === "needs_review" ? " +hasHardFails" : ""}`);

    if (!dryRun) {
      await store.set(key, JSON.stringify(record));
    }
    migrated++;
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped (already had state): ${skipped}, Warnings: ${warnings}`);
  if (dryRun && migrated > 0) {
    console.log("Re-run with --write to persist.");
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
