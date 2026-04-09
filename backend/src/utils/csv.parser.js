/**
 * @file backend/src/utils/csv.parser.js
 * @description CSV parsing utility for lead ingestion (MOD-04).
 *
 * Exports:
 *   - parseCSVBuffer : Parses a raw Buffer of CSV content into an array
 *                      of row objects with headers `customer_name`,
 *                      `phone_number`, and `email`.
 *
 * The parser is configured in strict mode:
 *   - Columns are validated against an exact expected header set.
 *   - Whitespace is trimmed from all fields.
 *   - Empty lines and BOM are handled gracefully.
 */

const { parse } = require('csv-parse/sync');

/**
 * Expected CSV column headers — order-insensitive but name-exact.
 * Any header not in this set triggers a rejection.
 */
const EXPECTED_HEADERS = ['customer_name', 'phone_number', 'email'];

/**
 * parseCSVBuffer — Synchronously parses a CSV buffer into row objects.
 *
 * @param {Buffer} buffer — Raw file buffer from multer memory storage.
 * @returns {{ rows: Array<{ customer_name: string, phone_number: string, email: string }>, error: string | null }}
 *   On success: `{ rows: [...], error: null }`
 *   On header/parse failure: `{ rows: [], error: "description" }`
 */
const parseCSVBuffer = (buffer) => {
  try {
    const content = buffer.toString('utf-8');

    // ── Parse with strict header validation ──────────────────────────────────
    const records = parse(content, {
      columns: true,         // Use the first row as column names.
      skip_empty_lines: true,
      trim: true,            // Trim whitespace from all values.
      bom: true,             // Handle UTF-8 BOM if present.
      relax_column_count: false, // Reject rows with mismatched column count.
    });

    // ── Validate that parsed headers match expected set ──────────────────────
    if (records.length > 0) {
      const parsedHeaders = Object.keys(records[0]);
      const missing = EXPECTED_HEADERS.filter(
        (h) => h !== 'email' && !parsedHeaders.includes(h)
      );

      if (missing.length > 0) {
        return {
          rows: [],
          error: `CSV is missing required headers: ${missing.join(', ')}. Expected: ${EXPECTED_HEADERS.join(', ')}`,
        };
      }

      // Check for unexpected extra headers.
      const unexpected = parsedHeaders.filter((h) => !EXPECTED_HEADERS.includes(h));
      if (unexpected.length > 0) {
        return {
          rows: [],
          error: `CSV contains unexpected headers: ${unexpected.join(', ')}. Allowed: ${EXPECTED_HEADERS.join(', ')}`,
        };
      }
    }

    return { rows: records, error: null };
  } catch (err) {
    return {
      rows: [],
      error: `CSV parsing failed: ${err.message}`,
    };
  }
};

module.exports = { parseCSVBuffer, EXPECTED_HEADERS };
