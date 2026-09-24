import test from "node:test";
import assert from "node:assert/strict";

import { sendBatch } from "../index.js";
import { parseNumbers } from "../server.js";

test("parseNumbers accepts common separators and removes duplicates", () => {
    assert.deepEqual(
        parseNumbers("09120000000\n09120000001, +989120000002; 09120000000"),
        ["09120000000", "09120000001", "+989120000002"],
    );
});

test("parseNumbers rejects invalid input", () => {
    assert.throws(() => parseNumbers("09120000000\nnot-a-number"), /1 invalid number/);
});

test("sendBatch processes the entire list with bounded concurrency", async () => {
    const numbers = Array.from({ length: 25 }, (_, index) => `0912${String(index).padStart(7, "0")}`);
    let active = 0;
    let peakActive = 0;

    const fetchImpl = async () => {
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;

        return {
            status: 200,
            text: async () => JSON.stringify({ code: "1", msg: "queued" }),
        };
    };

    const results = await sendBatch(numbers, {
        config: { apiKey: "test", src: "test", audioId: "test" },
        fetchImpl,
        logger: { log() {} },
    });

    assert.equal(results.length, numbers.length);
    assert.equal(results.every((result) => result.data?.code === "1"), true);
    assert.equal(peakActive, 10);
});
