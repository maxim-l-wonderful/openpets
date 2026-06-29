import assert from "node:assert/strict";

import { SessionStore, reactionToSessionStatus } from "../src/session-store.js";

// --- reactionToSessionStatus mapping ---------------------------------------
assert.equal(reactionToSessionStatus("working"), "in_progress");
assert.equal(reactionToSessionStatus("thinking"), "in_progress");
assert.equal(reactionToSessionStatus("testing"), "in_progress");
assert.equal(reactionToSessionStatus("waiting"), "waiting");
assert.equal(reactionToSessionStatus("success"), "done");
assert.equal(reactionToSessionStatus("celebrating"), "done");
assert.equal(reactionToSessionStatus("error"), "error");
assert.equal(reactionToSessionStatus("idle"), "idle");
assert.equal(reactionToSessionStatus("waving"), "idle");
assert.equal(reactionToSessionStatus(undefined), undefined);

// --- ordinal assignment + stable board ordering ----------------------------
let now = 1_000;
let changes = 0;
const store = new SessionStore({ now: () => now, onChange: () => { changes += 1; } });

store.upsert("lease-a", { message: "starting" });
store.upsert("lease-b", { name: "web ui", status: "waiting", question: "v4?" });
const board1 = store.getBoard();
assert.equal(board1.length, 2);
assert.equal(board1[0].leaseId, "lease-a");
assert.equal(board1[0].ordinal, 1);
assert.equal(board1[0].status, "in_progress", "default status when none provided is in_progress");
assert.equal(board1[0].name, undefined, "name is left unset for the renderer to fall back");
assert.equal(board1[1].leaseId, "lease-b");
assert.equal(board1[1].ordinal, 2);
assert.equal(board1[1].name, "web ui");
assert.equal(board1[1].question, "v4?");
assert.equal(changes, 2, "each upsert fired onChange");

// --- merge keeps prior fields, ordinal stable ------------------------------
store.upsert("lease-a", { status: "done" });
const a = store.getBoard().find((card) => card.leaseId === "lease-a");
assert.equal(a?.ordinal, 1, "ordinal stays stable across updates");
assert.equal(a?.message, "starting", "unspecified fields are preserved on merge");
assert.equal(a?.status, "done");

// --- question is cleared when a non-waiting status arrives ------------------
store.upsert("lease-b", { status: "in_progress" });
const b = store.getBoard().find((card) => card.leaseId === "lease-b");
assert.equal(b?.status, "in_progress");
assert.equal(b?.question, undefined, "question is dropped once the session is no longer waiting");

// --- no-op update does not fire onChange -----------------------------------
const before = changes;
store.upsert("lease-b", { status: "in_progress" });
assert.equal(changes, before, "an identical update is a no-op and does not notify");

// --- removal ----------------------------------------------------------------
assert.equal(store.remove("lease-a"), true);
assert.equal(store.remove("lease-a"), false, "removing an absent lease is a no-op");
assert.equal(store.size(), 1);
assert.equal(store.getBoard()[0].leaseId, "lease-b");

// --- a new session after removals keeps incrementing ordinals --------------
store.upsert("lease-c", { name: "docs" });
assert.equal(store.getBoard().find((card) => card.leaseId === "lease-c")?.ordinal, 3, "ordinals are monotonic, not reused");

console.log("Session store validation passed.");
