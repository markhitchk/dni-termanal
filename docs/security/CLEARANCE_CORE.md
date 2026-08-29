# DNI Clearance Core

Clearance is the primary security boundary for DNI Terminal.

## Security invariant

A protected resource may be returned only when:

```text
user_effective_clearance >= resource_clearance
AND
user_has_required_capability
AND
resource_specific_rules_pass
```

A failed clearance check must fail closed. Restricted rows, titles, counts, attachment names, search results, and other metadata must not be returned to the client.

## Exact clearance ladder

| Level | Code | Name | Normal assignment |
| ---: | --- | --- | --- |
| 0 | `CL/NON` | Unclassified | Guests, Civilians, public-release information |
| 1 | `CL0/UTO` | Official | All DNI members |
| 2 | `CL1/FOR` | Level 1 | E-1 through E-4 |
| 3 | `CL2/VER` | Level 2 | E-5 through E-8, W-1 through W-3 |
| 4 | `CL3/CON` | Level 3 | E-9, D-9s, O-1 through O-5 |
| 5 | `CL4/MET` | Level 4 | O-6 through O-9 |
| 6 | `CLA/DIS` | Absolute | HC-1, HC-2s, HC-3 |

Higher clearances inherit access to lower-clearance resources. Roles and capabilities never bypass the clearance comparison.

## Rank-derived clearance and manual override

Normal personnel clearance is derived from rank/approved Discord role mappings.

Authorized administrators can create a persistent manual override using `dni_users.clearance_override_level`. A manual override is deliberately separate from synchronized Discord roles so a role refresh, logout, deployment, or server restart cannot silently remove the administrator-assigned clearance.

An override remains in force until an authorized administrator explicitly removes it and returns the user to normal rank/role-derived clearance.

Every assignment/removal must create an append-only `dni_user_clearance_events` entry with the actor, previous level, new level, reason, and timestamp.

Rules for the administration API:

- Never permit a normal user to change their own clearance.
- Never permit an actor to grant a clearance above the actor's effective clearance.
- `CLA/DIS` additionally requires `clearance.assign_absolute`.
- Manual persistence additionally requires `clearance.override_rank`.
- All changes require a non-empty reason.
- The backend/database is authoritative; client values are never trusted.

## Documents

Every document has a required clearance from the moment the row exists. The existing `dni_documents.minimum_clearance` column remains the authoritative clearance field and is `NOT NULL` with a foreign key into `dni_clearance_levels`.

`classification_status` is separate from the security level:

- `provisional`: awaiting final classification/review.
- `final`: classification has been finalized.

A provisional document is **not** unclassified. New provisional drafts should be protected at a safe level, normally the creator's effective clearance, until an authorized classifier makes a final decision.

Document workflow states are:

```text
draft -> in_review -> published -> archived
```

Every historical version carries its own clearance in `dni_document_versions`. Classification changes are recorded in append-only `dni_document_classification_events`.

## Information-flow requirements

Clearance filtering applies to all modules and all metadata, including:

- Terminal records and commands
- Documents and document versions
- Downloads and attachments
- Mail subjects, bodies, and attachments
- Dashboard cards, totals, and aggregates
- Search and autocomplete
- Notifications
- Logistics and stock records
- Army/Navy requests
- Medical records/requests
- ISB review queues
- Officer/NCO reports

A restricted resource should generally be indistinguishable from a nonexistent resource to unauthorized users. Do not return a classified title with an `ACCESS DENIED` marker.

## Implementation sequence

1. **Database foundation** — exact clearance ladder, document classification/version tables, persistent user overrides, audit events.
2. **Server clearance engine** — one authoritative effective-clearance resolver and fail-closed access helpers.
3. **Document API** — create/review/classify/reclassify/archive/read/download with server-side filtering.
4. **Administration API** — personnel clearance editor + persistent manual override + audit history.
5. **UI** — clearance badges, document workflow, admin clearance controls, role-aware tabs.
6. **Other modules** — apply the same resource-clearance invariant to Mail, Dashboard, services, inventory, reports, and notifications.

The UI is a convenience layer only. The server/database security decision must remain authoritative.
