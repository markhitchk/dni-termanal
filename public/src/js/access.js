const records = Object.freeze({
  "173": Object.freeze({
    id: "DNI-173",
    sector: "SECTOR 01",
    classification: "STANDARD",
    status: "ACTIVE",
    summary: "Local archive record used to validate DNI terminal routing, clearance display, and document rendering."
  }),
  "410": Object.freeze({
    id: "DNI-410",
    sector: "SECTOR 04",
    classification: "RESTRICTED",
    status: "INDEXED",
    summary: "Dreadnought Imperium network operations archive. Detailed operational material is intentionally stored locally."
  }),
  "900": Object.freeze({
    id: "DNI-900",
    sector: "SECTOR 09",
    classification: "COMMAND",
    status: "SEALED",
    summary: "High-command archive index. This public terminal exposes only the non-sensitive record header."
  })
});

export function normalizeDniNumber(value) {
  const raw = String(value ?? "").trim().toUpperCase().replace(/^DNI-/, "");
  if (!/^\d{1,6}$/.test(raw)) return null;
  return raw.padStart(3, "0");
}

export function getDniRecord(value) {
  const normalized = normalizeDniNumber(value);
  if (!normalized) return null;
  const key = String(Number(normalized));
  return records[key] || Object.freeze({
    id: `DNI-${normalized}`,
    sector: "DNI ARCHIVE",
    classification: "INDEXED",
    status: "RESERVED",
    summary: "This DNI identifier is reserved in the local Dreadnought Imperium archive. No external database is queried."
  });
}

export function listDniRecords() {
  return Object.values(records);
}
