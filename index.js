import { pathToFileURL } from "node:url";

const API_URL = "https://api.hamkaran.cloud/api/hamkaran/v1/send-pre-recorded";
const REQUEST_TIMEOUT_MS = 15_000;

export const MAX_CONCURRENT = 10;

function loadConfig() {
    const apiKey = process.env.HAMKARAN_API_KEY;
    const src = process.env.HAMKARAN_SRC;
    const audioId = process.env.HAMKARAN_AUDIO_ID;

    if (!apiKey || !src || !audioId) {
        throw new Error(
            "Missing required environment variables: HAMKARAN_API_KEY, HAMKARAN_SRC, HAMKARAN_AUDIO_ID",
        );
    }

    return { apiKey, src, audioId };
}

export async function sendCall(dest, options = {}) {
    const { apiKey, src, audioId } = options.config ?? loadConfig();
    const fetchImpl = options.fetchImpl ?? fetch;
    const startedAt = Date.now();
    const form = new FormData();
    form.append("dest", dest);
    form.append("src", src);
    form.append("audio", audioId);

    const response = await fetchImpl(API_URL, {
        method: "POST",
        headers: { key: apiKey },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }

    return {
        dest,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        data,
    };
}

export async function sendBatch(numbers, options = {}) {
    const logger = options.logger ?? console;
    const results = new Array(numbers.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < numbers.length) {
            const index = nextIndex++;

            try {
                results[index] = await sendCall(numbers[index], options);
            } catch (error) {
                results[index] = {
                    dest: numbers[index],
                    error: error instanceof Error ? error.message : "Unknown error",
                };
            }
        }
    }

    const workerCount = Math.min(MAX_CONCURRENT, numbers.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    results.forEach((result, index) => {
        const ok = result.data?.code === "1";
        logger.log(
            `Call ${index + 1}/${numbers.length}: ${ok ? "queued" : "failed"}` +
                `${result.status ? ` (HTTP ${result.status}, ${result.latencyMs}ms)` : ""}`,
        );
    });

    const queued = results.filter((result) => result.data?.code === "1").length;
    logger.log(`Done. ${queued}/${numbers.length} queued successfully.`);
    return results;
}

export async function runCli(args = process.argv.slice(2)) {
    if (args.length === 0) {
        console.log(`
Hamkaran Cloud Pre-Recorded Caller
───────────────────────────────────
Usage:
  node index.js 09123456789 09198765432 ...

Environment variables (required):
  HAMKARAN_API_KEY   Your Hamkaran webservice key
  HAMKARAN_SRC       Source number/extension
  HAMKARAN_AUDIO_ID  Pre-recorded audio ID (e.g. "844-001")

Calls are submitted with at most ${MAX_CONCURRENT} concurrent requests.
`);
        return;
    }

    await sendBatch(args);
}

const isMainModule =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
    runCli().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
