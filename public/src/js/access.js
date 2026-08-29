import './document-terminal.js';

// DNI document metadata is never stored in browser JavaScript.
//
// The active Terminal document commands are implemented by document-terminal.js
// and call the server-side clearance-gated document endpoint. These legacy
// exports remain only so the base Terminal bundle fails closed if that module
// cannot load for any reason.

export function normalizeDniNumber(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/^DNI-/, '');
  if (!/^\d{1,6}$/.test(raw)) return null;
  return String(Number(raw)).padStart(3, '0');
}

export function getDniRecord() {
  return null;
}

export function listDniRecords() {
  return [];
}
