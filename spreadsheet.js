import readExcelFile from "read-excel-file/node";

export const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;

const MAX_WORKSHEETS = 50;
const MAX_ROWS_PER_SHEET = 5_000;
const MAX_COLUMNS_PER_SHEET = 100;
const MAX_IMPORTED_CELLS = 3_000;

function assertWorkbookSize(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("The Excel file is empty");
    }
    if (buffer.length > MAX_WORKBOOK_BYTES) {
        throw new Error("The Excel file must be 10 MB or smaller");
    }
}

async function loadWorkbook(buffer) {
    assertWorkbookSize(buffer);

    let worksheets;
    try {
        worksheets = await readExcelFile(buffer);
    } catch {
        throw new Error("The file is not a readable .xlsx workbook");
    }

    if (worksheets.length === 0) {
        throw new Error("The workbook has no worksheets");
    }
    if (worksheets.length > MAX_WORKSHEETS) {
        throw new Error(`The workbook may contain at most ${MAX_WORKSHEETS} worksheets`);
    }

    for (const worksheet of worksheets) {
        const columnCount = Math.max(0, ...worksheet.data.map((row) => row.length));

        if (worksheet.data.length > MAX_ROWS_PER_SHEET) {
            throw new Error(`A worksheet exceeds ${MAX_ROWS_PER_SHEET} populated rows`);
        }
        if (columnCount > MAX_COLUMNS_PER_SHEET) {
            throw new Error(`A worksheet exceeds ${MAX_COLUMNS_PER_SHEET} populated columns`);
        }
    }

    return worksheets;
}

function cellText(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (value instanceof Date) {
        return value.toISOString();
    }

    return String(value).trim();
}

function columnName(index) {
    let value = index;
    let result = "";

    while (value > 0) {
        value -= 1;
        result = String.fromCharCode(65 + (value % 26)) + result;
        value = Math.floor(value / 26);
    }

    return result;
}

export function inspectWorksheetData(rows) {
    const columnCount = Math.max(0, ...rows.map((row) => row.length));
    const columns = [];

    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
        const samples = [];

        for (let rowIndex = 1; rowIndex <= rows.length && samples.length < 3; rowIndex += 1) {
            const text = cellText(rows[rowIndex - 1]?.[columnIndex - 1]);
            if (text) {
                samples.push(text);
            }
        }

        if (samples.length > 0) {
            columns.push({
                index: columnIndex,
                letter: columnName(columnIndex),
                firstValue: samples[0],
                samples: samples.slice(1),
            });
        }
    }

    return columns;
}

export function extractColumnValues(rows, options) {
    const startRow = options.hasHeader ? 2 : 1;
    const values = [];
    let emptyCells = 0;

    for (let rowIndex = startRow; rowIndex <= rows.length; rowIndex += 1) {
        const text = cellText(rows[rowIndex - 1]?.[options.columnIndex - 1]);
        if (!text) {
            emptyCells += 1;
            continue;
        }

        values.push(text);
        if (values.length > MAX_IMPORTED_CELLS) {
            throw new Error(`The selected column contains more than ${MAX_IMPORTED_CELLS} values`);
        }
    }

    if (values.length === 0) {
        throw new Error("The selected column contains no values");
    }

    return { values, emptyCells };
}

export async function inspectWorkbook(buffer) {
    const worksheets = await loadWorkbook(buffer);

    return worksheets.map((worksheet, worksheetIndex) => {
        return {
            id: worksheetIndex + 1,
            name: worksheet.sheet,
            rowCount: worksheet.data.length,
            columns: inspectWorksheetData(worksheet.data),
        };
    });
}

export async function extractWorkbookColumn(buffer, options) {
    const worksheets = await loadWorkbook(buffer);
    const worksheet = worksheets[options.worksheetId - 1];

    if (!worksheet) {
        throw new Error("The selected worksheet does not exist");
    }
    if (!Number.isInteger(options.columnIndex) || options.columnIndex < 1) {
        throw new Error("The selected column is invalid");
    }

    return extractColumnValues(worksheet.data, options);
}
