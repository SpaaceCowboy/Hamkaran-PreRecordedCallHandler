import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { sendBatch } from "./index.js";
import {
    extractWorkbookColumn,
    inspectWorkbook,
    MAX_WORKBOOK_BYTES,
} from "./spreadsheet.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT ?? "3005", 10);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_NUMBERS = 3_000;
const PHONE_PATTERN = /^\+?\d{3,15}$/;
const page = await readFile(new URL("./public/index.html", import.meta.url));

export function parseNumbers(value) {
    if (typeof value !== "string") {
        throw new Error("numbers must be text");
    }

    const tokens = value
        .split(/[\s,;]+/u)
        .map((token) => token.trim())
        .filter(Boolean);
    const numbers = [...new Set(tokens)];

    if (numbers.length === 0) {
        throw new Error("Paste at least one phone number");
    }
    if (numbers.length > MAX_NUMBERS) {
        throw new Error(`A maximum of ${MAX_NUMBERS} unique numbers is allowed`);
    }

    const invalid = numbers.filter((number) => !PHONE_PATTERN.test(number));
    if (invalid.length > 0) {
        throw new Error(
            `${invalid.length} invalid number${invalid.length === 1 ? "" : "s"}; use 3–15 digits with an optional leading +`,
        );
    }

    return numbers;
}

function sendJson(response, status, body) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(body));
}

async function readJson(request) {
    const buffer = await readBody(request, MAX_BODY_BYTES);

    try {
        return JSON.parse(buffer.toString("utf8"));
    } catch {
        throw new Error("Request body must be valid JSON");
    }
}

async function readBody(request, maxBytes) {
    const chunks = [];
    let size = 0;

    for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBytes) {
            throw new Error("Request body is too large");
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

function isCrossOrigin(request) {
    return request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin";
}

export function createApp(options = {}) {
    const batchSender = options.batchSender ?? sendBatch;
    const workbookInspector = options.workbookInspector ?? inspectWorkbook;
    const workbookColumnExtractor = options.workbookColumnExtractor ?? extractWorkbookColumn;

    return createServer(async (request, response) => {
        const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

        if (request.method === "GET" && url.pathname === "/") {
            response.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
            });
            response.end(page);
            return;
        }

        if (request.method === "POST" && url.pathname === "/api/calls") {
            if (isCrossOrigin(request)) {
                sendJson(response, 403, { error: "Cross-origin requests are not allowed" });
                return;
            }
            if (!request.headers["content-type"]?.startsWith("application/json")) {
                sendJson(response, 415, { error: "Content-Type must be application/json" });
                return;
            }

            try {
                const body = await readJson(request);
                const numbers = parseNumbers(body.numbers);
                const results = await batchSender(numbers, { logger: { log() {} } });
                const calls = results.map((result) => ({
                    number: result.dest,
                    ok: result.data?.code === "1",
                    httpStatus: result.status ?? null,
                    latencyMs: result.latencyMs ?? null,
                    message: result.data?.msg ?? result.data?.raw ?? result.error ?? "Unknown response",
                    actionId: result.data?.actionIDUuid ?? null,
                }));

                sendJson(response, 200, {
                    total: calls.length,
                    queued: calls.filter((call) => call.ok).length,
                    calls,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unexpected error";
                console.error(`Call submission failed: ${message}`);
                sendJson(response, 400, { error: message });
            }
            return;
        }

        if (request.method === "POST" && url.pathname === "/api/import") {
            if (isCrossOrigin(request)) {
                sendJson(response, 403, { error: "Cross-origin requests are not allowed" });
                return;
            }

            try {
                const workbook = await readBody(request, MAX_WORKBOOK_BYTES);

                if (url.searchParams.get("mode") === "inspect") {
                    const worksheets = await workbookInspector(workbook);
                    sendJson(response, 200, { worksheets });
                    return;
                }

                const worksheetId = Number.parseInt(url.searchParams.get("worksheet") ?? "", 10);
                const columnIndex = Number.parseInt(url.searchParams.get("column") ?? "", 10);
                const hasHeader = url.searchParams.get("header") === "1";
                const extracted = await workbookColumnExtractor(workbook, {
                    worksheetId,
                    columnIndex,
                    hasHeader,
                });
                sendJson(response, 200, extracted);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unable to read workbook";
                console.error(`Workbook import failed: ${message}`);
                sendJson(response, 400, { error: message });
            }
            return;
        }

        sendJson(response, 404, { error: "Not found" });
    });
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    createApp().listen(PORT, HOST, () => {
        console.log(`Hamkaran caller UI: http://${HOST}:${PORT}`);
    });
}
