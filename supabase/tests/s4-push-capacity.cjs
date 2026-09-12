// Deterministic admission/backpressure arithmetic. This does NOT execute SQL,
// the queue, Supabase, cron, or a provider; it is not a throughput/load test.
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
const sql = fs.readFileSync(
  path.join(__dirname, "../migrations/20260908012000_s4_push.sql"),
  "utf8",
);
const queueCap = Number(
  sql.match(/max_queued_jobs integer not null default (\d+)/)[1],
);
const receiptCap = Number(
  sql.match(/max_pending_receipts integer not null default (\d+)/)[1],
);
const sendCap = Number(sql.match(/\('push_send',\d+,(\d+),/)[1]);
function simulate(available) {
  let queue = 0,
    pending = [],
    sent = 0,
    admissionDenied = 0,
    sendDeferred = 0,
    maxQueue = 0,
    maxPending = 0;
  for (let minute = 0; minute < 240; minute++) {
    // Synthetic stress assumes one logical job per device and an enqueue pass
    // every minute, more often than the selected source's every-five-minute cron.
    const accepted = Math.min(sendCap, queueCap - queue);
    queue += accepted;
    admissionDenied += sendCap - accepted;
    maxQueue = Math.max(maxQueue, queue);
    if (available && minute % 15 === 0) {
      let checked = 0;
      pending = pending.filter((t) => t > minute - 15 || checked++ >= 300);
    }
    const oldest = pending[0];
    const count =
      oldest !== undefined && oldest < minute - 120
        ? 0
        : Math.min(sendCap, queue, receiptCap - pending.length);
    sendDeferred += queue - count;
    queue -= count;
    sent += count;
    for (let n = 0; n < count; n++) pending.push(minute);
    maxPending = Math.max(maxPending, pending.length);
    assert.ok(
      queue <= queueCap && pending.length <= receiptCap && count <= sendCap,
    );
  }
  return {
    sent,
    maxQueue,
    maxPending,
    remainingJobs: queue,
    remainingTickets: pending.length,
    admissionDenied,
    sendDeferred,
  };
}
const healthy = simulate(true),
  outage = simulate(false);
assert.equal(healthy.remainingJobs, 0);
assert.equal(healthy.admissionDenied, 0);
assert.ok(healthy.maxPending < receiptCap);
assert.equal(outage.maxPending, receiptCap);
assert.equal(outage.maxQueue, queueCap);
assert.ok(outage.admissionDenied > 0);
console.log(
  JSON.stringify(
    {
      scope:
        "four-hour pure arithmetic, explicitly unpaused fixture; no SQL/load/provider proof",
      policies: {
        sendCap,
        queueCap,
        receiptCap,
        receiptBatch: 300,
        receiptCadenceMinutes: 15,
      },
      healthy,
      outage,
    },
    null,
    2,
  ),
);
