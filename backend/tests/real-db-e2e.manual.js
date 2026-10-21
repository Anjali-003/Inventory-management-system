/* Real-engine test: the REAL order-approval service, the REAL pool, REAL InnoDB (MariaDB 10.11), real concurrency. */
const db = require("/home/claude/temp_ims/backend/src/config/db");
const svc = require("/home/claude/temp_ims/backend/src/modules/order-approvals/order-approval.service");
const idem = require("/home/claude/temp_ims/backend/src/shared/idempotency");

let pass = 0, fail = 0;
const ok = (cond, label, detail = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}${detail ? "  — " + detail : ""}`); };
const q = async (sql, p) => (await db.query(sql, p))[0];
const stock = async () => (await q(`SELECT quantity_on_hand AS v FROM inventory ORDER BY component_id`)).map((r) => Number(r.v));
const count = async (t, w = "1=1") => (await q(`SELECT COUNT(*) AS n FROM ${t} WHERE ${w}`))[0].n;

/* fresh world: product P needs 2xA + 1xB. Stock A=19 (8 units), B=100. Order of 10 units. */
async function world() {
  await q("SET FOREIGN_KEY_CHECKS=0");
  for (const t of ["idempotency_keys","inventory_transactions","order_production_items","order_purchase_items","order_items","orders","product_bom","inventory","components","products","users"]) {
    await q(`DELETE FROM ${t}`).catch(async () => { await q(`DROP TRIGGER IF EXISTS trg_inv_txn_no_delete`); await q(`DELETE FROM ${t}`); });
  }
  await q("SET FOREIGN_KEY_CHECKS=1");
  await q(`INSERT INTO users (id,name,email,password_hash,role) VALUES (5,'Ops','ops@x.io','x','operations_admin')`);
  await q(`INSERT INTO products (id,sku,name) VALUES (1,'PRD-1','Controller')`);
  await q(`INSERT INTO components (id,sku,name,unit) VALUES (1,'CMP-A','A','pcs'),(2,'CMP-B','B','pcs')`);
  await q(`INSERT INTO product_bom (product_id,component_id,quantity_required) VALUES (1,1,2),(1,2,1)`);
  await q(`INSERT INTO inventory (component_id,quantity_on_hand,quantity_reserved) VALUES (1,19,3),(2,100,0)`);
  await q(`INSERT INTO orders (id,order_number,status,approval_status,approval_round,created_by) VALUES (7,'ORD-7','PENDING','PENDING_APPROVAL',0,5)`);
  await q(`INSERT INTO order_items (order_id,product_id,quantity) VALUES (7,1,10)`);
}
const body = (key, extra = {}) => ({ idempotency_key: key, expected_round: 0, production_items: [{ product_id: 1, quantity: 3 }], purchase_items: [{ component_id: 1, quantity: 4 }], ...extra });

(async () => {
  console.log("\n[1] DOUBLE CLICK: 8 identical requests fired at the same instant (same key)");
  await world();
  let replays = 0;
  const res = await Promise.allSettled(Array.from({ length: 8 }, () => svc.dispatch(7, body("click-aaaa-0001"), 5, { onReplay: () => replays++ })));
  const okRes = res.filter((r) => r.status === "fulfilled"), bad = res.filter((r) => r.status === "rejected");
  ok(bad.length === 0, "none of the 8 failed", bad.map((b) => b.reason.code || b.reason.message).join(","));
  ok(JSON.stringify([...new Set(okRes.map((r) => JSON.stringify(r.value)))].length) === "1", "all 8 got the identical response");
  ok(replays === 7, "exactly 1 executed, 7 replayed", `replays=${replays}`);
  ok(JSON.stringify(await stock()) === "[13,97]", "stock deducted ONCE (3 units = 6xA + 3xB)", JSON.stringify(await stock()));
  ok((await count("inventory_transactions")) === 2, "2 ledger rows (one per component)");
  ok((await count("order_production_items")) === 1, "1 production row");
  ok((await count("idempotency_keys")) === 1, "1 key stored");

  console.log("\n[2] API RETRY after success: same key again, later");
  const again = await svc.dispatch(7, body("click-aaaa-0001"), 5);
  ok(again.approval_status === "PARTIALLY_APPROVED" && again.approval_round === 1, "retry returns the original success");
  ok(JSON.stringify(await stock()) === "[13,97]", "stock unchanged");

  console.log("\n[3] REPEATED APPROVAL: same numbers, NEW key (second admin / stale tab)");
  const err = await svc.dispatch(7, body("click-bbbb-0002"), 5).catch((e) => e);
  ok(err.code === "STALE_ROUND" && err.status === 409, "refused 409 STALE_ROUND", `${err.status} ${err.code}`);
  ok(JSON.stringify(await stock()) === "[13,97]", "stock unchanged");
  ok((await count("idempotency_keys")) === 1, "refused request left no key behind (claim rolled back)");

  console.log("\n[4] SAME KEY, DIFFERENT REQUEST");
  const err2 = await svc.dispatch(7, body("click-aaaa-0001", { production_items: [{ product_id: 1, quantity: 2 }] }), 5).catch((e) => e);
  ok(err2.code === "IDEMPOTENCY_CONFLICT" && err2.status === 422, "refused 422 IDEMPOTENCY_CONFLICT", `${err2.status} ${err2.code}`);

  console.log("\n[5] FAILED REQUEST can be retried with the same key (claim rolls back with the txn)");
  await world();
  await q(`UPDATE inventory SET quantity_on_hand = 11 WHERE component_id = 1`); // stock changed after the admin looked
  const wanted = { idempotency_key: "click-cccc-0003", expected_round: 0, production_items: [{ product_id: 1, quantity: 6 }], purchase_items: [{ component_id: 1, quantity: 8 }] };
  const e3 = await svc.dispatch(7, wanted, 5).catch((e) => e);
  ok(e3.code === "STALE_PLAN", "first attempt refused STALE_PLAN", e3.code);
  ok((await count("idempotency_keys")) === 0, "no key left behind");
  await q(`UPDATE inventory SET quantity_on_hand = 15 WHERE component_id = 1`);
  const r3 = await svc.dispatch(7, wanted, 5).catch((e) => e);
  ok(r3.approval_status === "PARTIALLY_APPROVED", "same key now succeeds", r3.code || r3.approval_status);

  console.log("\n[6] approve(): 6 concurrent double-clicks");
  await world();
  const ap = await Promise.allSettled(Array.from({ length: 6 }, () => svc.approve(7, { idempotency_key: "click-dddd-0004", expected_round: 0 }, 5)));
  ok(ap.every((r) => r.status === "fulfilled"), "none failed", ap.filter((r) => r.status === "rejected").map((r) => r.reason.code || r.reason.message).join(","));
  ok(JSON.stringify(await stock()) === "[3,92]", "stock deducted once (8 units = 16xA + 8xB)", JSON.stringify(await stock()));
  ok((await count("inventory_transactions")) === 2, "2 ledger rows");

  console.log("\n[7] DIFFERENT orders/keys concurrently don't deadlock or oversell");
  await world();
  await q(`INSERT INTO orders (id,order_number,status,approval_status,approval_round,created_by) VALUES (8,'ORD-8','PENDING','PENDING_APPROVAL',0,5)`);
  await q(`INSERT INTO order_items (order_id,product_id,quantity) VALUES (8,1,10)`);
  const two = await Promise.allSettled([svc.approve(7, { idempotency_key: "click-eeee-0005", expected_round: 0 }, 5), svc.approve(8, { idempotency_key: "click-ffff-0006", expected_round: 0 }, 5)]);
  ok(two.every((r) => r.status === "fulfilled"), "both complete", two.filter((r) => r.status === "rejected").map((r) => r.reason.code || r.reason.message).join(","));
  const [a] = await q(`SELECT quantity_on_hand AS v, quantity_reserved AS r FROM inventory WHERE component_id = 1`);
  ok(Number(a.v) >= Number(a.r), "no oversell: on_hand >= reserved", `on_hand=${a.v} reserved=${a.r}`);

  console.log("\n[8] PURGE removes only old keys");
  await q(`UPDATE idempotency_keys SET created_at = NOW() - INTERVAL 8 DAY WHERE idem_key = 'click-eeee-0005'`);
  const removed = await idem.purgeExpired(db);
  ok(removed === 1 && (await count("idempotency_keys")) === 1, "purged the 8-day-old key, kept the fresh one", `removed=${removed}`);

  console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"}: ${pass} passed, ${fail} failed`);
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("HARNESS ERROR", e); await db.end(); process.exit(2); });
