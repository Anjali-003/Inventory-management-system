const crypto = require("crypto");
const AppError = require("./AppError");

/*
    Request-level idempotency: "this exact request is applied at most once, however many times it arrives".

    How it works (all inside the caller's database transaction):

      1. claim   INSERT a row keyed by the client's idempotency key. idempotency_keys.idem_key is UNIQUE, so if the same
                 key is already being applied by another transaction, our INSERT WAITS for it (InnoDB takes a lock on
                 the unique-index entry) and then fails with 1062 once that transaction commits. Two requests with
                 one key can therefore never both run the business logic.
      2. replay  Key already used and the request is identical -> return the response stored by the first request and
                 skip the work entirely (no second deduction, and the client still gets the success it was waiting for
                 if its first response was lost). Same key but a different request -> 422, a client bug.
      3. work    Run the real work (lock the order, deduct stock, write the ledger ...).
      4. store   UPDATE the row with the response. Because the claim, the work and the stored response commit together,
                 a failure anywhere rolls the claim back too: a request that did NOT apply can always be retried with
                 the same key.

    This is the first line of defence against double clicks and network retries. It is deliberately not the only one:
    the order is also checked against `expected_round` (so a second admin / stale tab with a DIFFERENT key is refused)
    and the stock ledger has its own UNIQUE idempotency_key per approval pass. See order-approval.service.js.
*/

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const RETENTION_DAYS = 7;

/* Same rule and error code as the inventory API's idempotency_key, so one client helper serves both. */
function parseKey(raw) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!KEY_RE.test(key)) {
        throw new AppError(400, "Missing or invalid idempotency_key (8-64 letters, digits, - or _)", "IDEMPOTENCY_KEY_REQUIRED");
    }
    return key;
}

/* JSON with sorted keys, so { a, b } and { b, a } hash the same. */
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
}

const fingerprint = (action, userId, payload) =>
    crypto.createHash("sha256").update(canonical({ action, userId: userId ?? null, payload })).digest("hex");

/*
    Step 1 + 2. Returns { id } when this request must run, or { replay } (the stored response) when it already ran.
    Must be called as the FIRST statement of the transaction, before any other lock is taken, so a waiting duplicate
    holds nothing the first request needs.
*/
async function claim(conn, { key, action, userId, payload }) {
    const hash = fingerprint(action, userId, payload);
    try {
        const [result] = await conn.query(
            `INSERT INTO idempotency_keys (idem_key, action, request_hash, user_id) VALUES (?, ?, ?, ?)`,
            [key, action, hash, userId ?? null]
        );
        return { id: result.insertId };
    } catch (error) {
        if (error.errno !== 1062) throw error;
    }

    // Duplicate key: the first request has committed (our INSERT waited for it). The failed INSERT left us holding a
    // SHARED lock on that index entry, so read it with a shared lock too (latest committed row). Asking for FOR UPDATE
    // here would deadlock as soon as two duplicates wait together: each holds S and waits for X.
    const [rows] = await conn.query(`SELECT request_hash, response FROM idempotency_keys WHERE idem_key = ? LOCK IN SHARE MODE`, [key]);
    const first = rows[0];
    if (!first) {
        // the row vanished between the failed INSERT and the read (purged): treat as a clash and let the caller retry
        throw AppError.conflict("Please try again.", "IDEMPOTENCY_RETRY");
    }
    if (first.request_hash !== hash) {
        throw new AppError(422, "This request id was already used for a different request. Refresh the page and try again.", "IDEMPOTENCY_CONFLICT");
    }
    if (first.response === null || first.response === undefined) {
        // cannot normally be seen: the response is written in the same transaction as the claim
        throw AppError.conflict("This request is still being processed. Wait a moment and refresh.", "IDEMPOTENCY_IN_PROGRESS");
    }
    return { replay: JSON.parse(first.response) };
}

/*
    Runs `work()` at most once per key. Call inside inventory.inTransaction(async (conn) => ...).
    options: { key, action, userId, payload, onReplay }  (onReplay is called when a stored response is returned)
*/
async function once(conn, { key, action, userId, payload, onReplay }, work) {
    const claimed = await claim(conn, { key, action, userId, payload });
    if ("replay" in claimed) {
        if (onReplay) onReplay();
        return claimed.replay;
    }
    const response = await work();
    await conn.query(`UPDATE idempotency_keys SET response = ? WHERE id = ?`, [JSON.stringify(response), claimed.id]);
    return response;
}

/* Keys only matter while a client could still retry. Deletes a bounded batch so it never holds locks for long. */
async function purgeExpired(db, days = RETENTION_DAYS) {
    const [result] = await db.query(`DELETE FROM idempotency_keys WHERE created_at < (NOW() - INTERVAL ? DAY) LIMIT 1000`, [days]);
    return result.affectedRows;
}

/* Hourly cleanup. unref() so it never keeps the process (or a test run) alive. */
function startPurgeJob(db, { everyMs = 60 * 60 * 1000 } = {}) {
    const tick = () =>
        purgeExpired(db).catch((error) => console.warn("[idempotency] purge skipped:", error.message));
    setTimeout(tick, 30_000).unref();
    return setInterval(tick, everyMs).unref();
}

module.exports = { parseKey, fingerprint, canonical, claim, once, purgeExpired, startPurgeJob, RETENTION_DAYS };
