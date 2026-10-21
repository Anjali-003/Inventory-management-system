const db = require("/home/claude/temp_ims/backend/src/config/db");
const svc = require("/home/claude/temp_ims/backend/src/modules/order-approvals/order-approval.service");
const q = async (sql, p) => (await db.query(sql, p))[0];
async function world(avail = 19) {
  await q("SET FOREIGN_KEY_CHECKS=0");
  for (const t of ["idempotency_keys","order_production_items","order_purchase_items","order_items","orders","product_bom","inventory","components","products","users"]) await q(`DELETE FROM ${t}`);
  await q("DROP TRIGGER IF EXISTS trg_inv_txn_no_delete"); await q("DELETE FROM inventory_transactions");
  await q("SET FOREIGN_KEY_CHECKS=1");
  await q(`INSERT INTO users (id,name,email,password_hash,role) VALUES (5,'Ops','ops@x.io','x','operations_admin')`);
  await q(`INSERT INTO products (id,sku,name) VALUES (1,'PRD-1','Controller')`);
  await q(`INSERT INTO components (id,sku,name,unit) VALUES (1,'CMP-A','A','pcs'),(2,'CMP-B','B','pcs')`);
  await q(`INSERT INTO product_bom (product_id,component_id,quantity_required) VALUES (1,1,2),(1,2,1)`);
  await q(`INSERT INTO inventory (component_id,quantity_on_hand,quantity_reserved) VALUES (1,${avail},3),(2,100,0)`);
  await q(`INSERT INTO orders (id,order_number,status,approval_status,approval_round,created_by) VALUES (7,'ORD-7','PENDING','PENDING_APPROVAL',0,5)`);
  await q(`INSERT INTO order_items (order_id,product_id,quantity) VALUES (7,1,10)`);
}
const body = (key) => ({ idempotency_key: key, expected_round: 0, production_items: [{ product_id: 1, quantity: 3 }], purchase_items: [{ component_id: 1, quantity: 4 }] });
const tally = (rs) => rs.reduce((m, r) => { const k = r.status === "fulfilled" ? "ok" : (r.reason.code || r.reason.message); m[k] = (m[k] || 0) + 1; return m; }, {});

(async () => {
  let bad = 0;
  console.log("A) 40 concurrent identical requests x 10 rounds (success path)");
  for (let round = 0; round < 10; round++) {
    await world();
    const rs = await Promise.allSettled(Array.from({ length: 40 }, () => svc.dispatch(7, body(`stress-a-${round}-xxxx`), 5)));
    const [{ v }] = await q(`SELECT quantity_on_hand AS v FROM inventory WHERE component_id=1`);
    const t = tally(rs); const good = t.ok === 40 && Number(v) === 13;
    if (!good) { bad++; console.log("  round", round, "BAD", JSON.stringify(t), "stockA=", v); }
  }
  console.log(bad ? `  ${bad} bad rounds` : "  10/10 rounds: all 40 succeeded, stock deducted once");

  console.log("B) first attempt FAILS (stale plan) while 8 identical duplicates wait: x 10 rounds");
  let deadlocks = 0, wrong = 0;
  for (let round = 0; round < 10; round++) {
    await world(11); // only 4 units possible, request asks for 6 -> every attempt is refused STALE_PLAN
    const req = { idempotency_key: `stress-b-${round}-xxxx`, expected_round: 0, production_items: [{ product_id: 1, quantity: 6 }], purchase_items: [{ component_id: 1, quantity: 8 }] };
    const rs = await Promise.allSettled(Array.from({ length: 8 }, () => svc.dispatch(7, req, 5)));
    const t = tally(rs);
    deadlocks += t.ER_LOCK_DEADLOCK || 0;
    const [{ n }] = await q(`SELECT COUNT(*) n FROM idempotency_keys`); const [{ v }] = await q(`SELECT quantity_on_hand v FROM inventory WHERE component_id=1`);
    if (t.STALE_PLAN !== 8 || n !== 0 || Number(v) !== 11) { wrong++; console.log("  round", round, JSON.stringify(t), "keys=", n, "stockA=", v); }
  }
  console.log(`  deadlock errors surfaced: ${deadlocks}; rounds with wrong outcome: ${wrong}`);

  console.log("C) 12 concurrent requests, SAME stale view, DIFFERENT keys (two admins x6): only one may apply");
  let c_bad = 0;
  for (let round = 0; round < 10; round++) {
    await world();
    const rs = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => svc.dispatch(7, body(`stress-c-${round}-k${i}xx`), 5)));
    const t = tally(rs); const [{ v }] = await q(`SELECT quantity_on_hand v FROM inventory WHERE component_id=1`);
    if (t.ok !== 1 || t.STALE_ROUND !== 11 || Number(v) !== 13) { c_bad++; console.log("  round", round, JSON.stringify(t), "stockA=", v); }
  }
  console.log(c_bad ? `  ${c_bad} bad rounds` : "  10/10 rounds: exactly 1 applied, 11 refused STALE_ROUND, stock deducted once");
  await db.end(); process.exit(bad || wrong || c_bad ? 1 : 0);
})().catch(async (e) => { console.error("HARNESS", e); await db.end(); process.exit(2); });
