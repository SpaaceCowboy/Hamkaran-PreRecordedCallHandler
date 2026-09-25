import test from "node:test";
import assert from "node:assert/strict";

import { sendBatch } from "../index.js";
import { parseNumbers } from "../server.js";
import { extractColumnValues, inspectWorksheetData } from "../spreadsheet.js";

test("parseNumbers accepts common separators and removes duplicates", () => {
    assert.deepEqual(
        parseNumbers("09120000000\n09120000001, +989120000002; 09120000000"),
        ["09120000000", "09120000001", "+989120000002"],
    );
});

test("parseNumbers rejects invalid input", () => {
    assert.throws(() => parseNumbers("09120000000\nnot-a-number"), /1 invalid number/);
});

test("parseNumbers accepts up to 3,000 unique numbers", () => {
    const numbers = Array.from({ length: 3_000 }, (_, index) => {
        return `0912${String(index).padStart(7, "0")}`;
    });

    assert.equal(parseNumbers(numbers.join("\n")).length, 3_000);
    assert.throws(
        () => parseNumbers([...numbers, "09129999999"].join("\n")),
        /maximum of 3000 unique numbers/i,
    );
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

test("Excel import identifies columns and extracts the selected values", () => {
    const rows = [
        ["Phone", "Name"],
        ["09123456789", "First customer"],
        ["+989120000001", "Second customer"],
    ];

    const columns = inspectWorksheetData(rows);
    assert.deepEqual(
        columns.map((column) => [column.letter, column.firstValue]),
        [["A", "Phone"], ["B", "Name"]],
    );

    const imported = extractColumnValues(rows, {
        columnIndex: 1,
        hasHeader: true,
    });
    assert.deepEqual(imported.values, ["09123456789", "+989120000001"]);
});

test("Excel import accepts up to 3,000 non-empty cells", () => {
    const rows = Array.from({ length: 3_000 }, (_, index) => [`0912${String(index).padStart(7, "0")}`]);

    assert.equal(extractColumnValues(rows, { columnIndex: 1, hasHeader: false }).values.length, 3_000);
    assert.throws(
        () => extractColumnValues([...rows, ["09129999999"]], { columnIndex: 1, hasHeader: false }),
        /more than 3000 values/i,
    );
});
