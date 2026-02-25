import FormData from 'form-data'

const API_URL = "https://api.hamkaran.cloud/api/hamkaran/v1/send-pre-recorded";

const API_KEY = process.env.HAMKARAN_API_KEY;
const SRC = process.env.HAMKARAN_SRC;
const AUDIO_ID = process.env.HAMKARAN_AUDIO_ID;
const MAX_CONCURRENT = 10;

if (!API_KEY || !SRC || !AUDIO_ID) {
    console.error(
        "missing env vars"
    );
    process.exit(1)
}

//send a single call

async function sendCall(dest) {
    const form = new FormData();
    form.append("dest", dest);
    form.append("src", SRC);
    form.append("audio", AUDIO_ID);
    
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            key: API_KEY,
            ...form.getHeaders(),
        },
        body: form,
    })

    const text = await response.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text};
    }

    return { dest, status: response.status, data}
}

// send to multiple numbers

async function sendBatch(numbers) {
    if (numbers.length > MAX_CONCURRENT) {
        console.warn(
            `GOT ${numbers.length} numbers but limit is ${MAX_CONCURRENT}. Processing first ${MAX_CONCURRENT}`
        )
        numbers = numbers.slice(0, MAX_CONCURRENT);
    }

    console.log(`sending ${numbers.length} call(s)...\n`);

    const results = await Promise.allSettled(numbers.map((n) => sendCall(n)));

    const summary = results.map((r, i) => {
        if (r.status === "fulfilled") {
            const {dest, status, data} = r.value;
            const ok = data.code === "1";
            console.log(
                `${ok ? "done" : "failed"} ${dest} -> ${data.msg || data.raw || "Unknown response"} ${data.actionIDUuid ? `(ID: ${data.actionIDUuid})` : ""}`
            )

            return r.value;
        } else {
            console.log(`failed ${numbers[i]} -> Error: ${r.reason.message}`);
            return { dest: numbers[i], error: r.reason.message};
        }
    })
    console.log(`\n📊 Done. ${summary.filter((s) => s.data?.code === "1").length}/${numbers.length} queued successfully.`)
    return summary
}


// --- Main ---
const numbers = process.argv.slice(2);

if (numbers.length === 0) {
  console.log(`
Hamkaran Cloud Pre-Recorded Caller
───────────────────────────────────
Usage:
  node index.js 09123456789 09198765432 ...

Environment variables (required):
  HAMKARAN_API_KEY   Your Hamkaran webservice key
  HAMKARAN_SRC       Source number/extension
  HAMKARAN_AUDIO_ID  Pre-recorded audio ID (e.g. "844-001")

Pass up to 10 phone numbers as arguments.
`);
  process.exit(0);
}

sendBatch(numbers);