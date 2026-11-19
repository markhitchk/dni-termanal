# Funding & Treasury — Veyner-approved contribution launch

Location: `/operations?department=logistics&section=treasury` → **Imperial Logistics Corps → Funding & Treasury**.

This feature is based on Veyner's six answers on 18 November 2026. Contributions launch first; it is **not** an autonomous Star Citizen wallet, credit-transfer integration or payout tool. The rejected proposal that all requests must pass through Logistics with Veyner as final approver has NOT been implemented.

## Approved rules

1. Funding & Treasury is one section of existing DNI Operations → Logistics; no new top-level app.
2. No universal Logistics intake or owner-only funding approval flow; funding requests are deferred until the replacement workflow is separately specified.
3. Directors of Engineering and Logistics choose Treasurer appointments and future payment limits. A Director must be HC-2+ within one of those departments **and** hold an explicit department-scoped `operations.treasury.director` grant. An existing authorized Operations administrator configures these grants. Neither ordinary HC-2+ status nor website administrator status alone permits Treasurer appointments, transfers or contribution reviews.
4. Verified contribution totals are available to authenticated HC-2+ department leaders and appointed Treasury staff. Ordinary members may only see their own reports and opted-in public contributor credits.
5. Public contributor identification is **off by default** and recorded as an explicit submission-time opt-in. Only verified opted-in contributions appear in the public credits. No private names, review evidence or transfer details are disclosed publicly.
6. Phase 1 provides reporting and independent manual verification of contributions, verification history, an accounting total of verified reports, and director-controlled Treasurer appointments. Subsequent funding requests, campaigns, budgets, reconciliation, payouts, approvals and spending are not enabled.

## API and lifecycle

Reuses `/operations-data.php`, canonical Discord sessions/roles, CSRF checks, transaction boundaries, idempotency keys, audit events and existing DNI personnel IDs. `GET ?resource=treasury` supplies a permission-filtered view.

- `POST action=treasury.contribute`: integer `amountAuec` 1–2,147,483,647, optional purpose/reference, explicit boolean `publicCredit`. Creates **pending** (no balance increase).
- `POST action=treasury.review`: authorized independent reviewer, `id`, `status=verified|rejected`, mandatory reference for verification or note for rejection. Terminal status cannot be reviewed again. Verification alone increases the recorded verified total.
- `POST action=treasury.staff.set`: Engineering/Logistics director, existing DNI `userId`, active boolean and nonnegative `paymentLimitAuec`. Limits are recorded for future policy use and DO NOT authorize or initiate payouts.

Totals represent only verified reported contributions, **not a reconciled spendable wallet balance**. Do not treat them as authorization to make a payout or perform an automatic in-game transfer. Correction workflows and a full double-entry treasury ledger are intentionally deferred; reported facts and verification events are never silently overwritten.

## Setup and deployment

1. Back up the live SQLite database `data/dni_terminal.db`.
2. Deploy the application files together, including `database/migrations/019_dni_ops_treasury.sql` and `server/php/dni-operations-treasury.php`. Do not edit the previously deployed 018 SQL.
3. Run `npm run db:migrate`, then `npm run test:operations` and `npm run verify` in the normal CI/release pipeline. Migration 019 is checksum-tracked in `dni_ops_schema_migrations`; this does not change the independent Bounty migration version.
4. DNI Operations → Access Settings: explicitly grant `operations.treasury.director` to verified Engineering and/or Logistics Directors, scoped to their own department, using existing personnel/Discord IDs. No IDs are seeded or invented. Directors can then appoint Treasurers.
5. Test contributions with real authorized DNI member sessions: pending total remains unchanged; an independent appointed Treasurer verifies a genuine transfer; total rises; uncredited names remain private; denied staff and non-leaders cannot access restricted data.

Deployment to the live host requires the repository's normal production deployment workflow. There is no automated transfer of funds or external payment collection.
