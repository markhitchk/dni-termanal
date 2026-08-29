# DNI Terminal — Final Security Model

Status: **Steps 1–10 complete**

This document records the production authorization model for the Dreadnought Imperium Database Network. It is the companion to `CLEARANCE_CORE.md` and describes the completed rollout across Documents, Mail, personnel security, operational modules, administration, and audit history.

## Universal authorization invariant

A DNI resource is returned only when all applicable checks succeed:

```text
authenticated when the resource requires membership
AND account is active
AND user has the required capability
AND user effective clearance >= resource clearance
AND resource-specific relationship/routing rules pass
```

Roles/capabilities answer **what the user may do**. Clearance answers **what information the user may receive**. A role does not bypass clearance.

## Clearance ladder

| Level | Code | Name |
|---:|---|---|
| 0 | CL/NON | Unclassified |
| 1 | CL0/UTO | Official |
| 2 | CL1/FOR | Level 1 |
| 3 | CL2/VER | Level 2 |
| 4 | CL3/CON | Level 3 |
| 5 | CL4/MET | Level 4 |
| 6 | CLA/DIS | Absolute |

Visibility is cumulative. A CL3/CON user may receive CL/NON through CL3/CON resources, never CL4/MET or CLA/DIS.

## Effective personnel clearance

The server calculates one effective clearance for every authorized request.

1. A persistent manual administrator override wins exactly, including deliberate downgrades.
2. Without an override, the highest valid rank/default, current server-side Discord-role mapping, or supported active grant is used.
3. Unknown or malformed authorization data grants nothing and fails closed.

Manual overrides survive Discord role synchronization until explicitly removed. Administration cannot be used for self-escalation, assigning above the actor's effective clearance, managing personnel above the actor's clearance, or restoring a rank-derived level above the actor's current clearance.

Canonical personnel ranks now carry explicit database defaults for E-1 through E-9/E-9S, W-1 through W-3, D-9, O-1 through O-9, and HC-1 through HC-3/HC-2S. This means E-1 and D-9 can receive the intended clearance from their authoritative personnel rank even though their Discord role IDs are not guessed. Legacy generic seed ranks remain at the conservative CL0/UTO member baseline and rely on canonical rank assignment or verified Discord roles for higher access.

## Documents

Every document has a mandatory clearance. Drafts use a provisional classification but still carry a real safeguard clearance. New drafts default to the creator's effective clearance.

The workflow is:

```text
DRAFT -> ISB REVIEW -> FINAL CLASSIFICATION -> PUBLISHED
```

Lists, direct record access, Terminal commands, search, downloads, review queues, and publication checks are server-authorized. Restricted records are not sent to the browser. Direct unauthorized record access uses the same not-found behavior as a nonexistent record where appropriate.

Document versions retain classification metadata. Classification and workflow changes are audited.

## DNI Mail

Every message has a mandatory clearance.

Direct mail requires both sufficient clearance and an explicit recipient relationship. Responders/roles do not override the recipient and clearance checks unless the specific mail operation grants that relationship.

Document attachments propagate security upward:

```text
mail clearance >= highest attachment clearance
```

Attachment-specific permission requirements also propagate to the message. Read state is server-side. Notification-safe preview text is generic and does not expose classified subjects, sender labels, body content, or attachment names outside the authenticated mail reader.

## Operational resources

The same clearance boundary now protects:

- sectors
- fleets and other assets
- personnel records
- service requests
- assignment history
- service workflow events
- operational activity/audit records
- Dashboard operational summaries
- DNI Admin operational records

For new operational records, the default classification is the creator/actor's current effective clearance unless an authorized operational classifier intentionally chooses a permitted lower level. A user can never classify above their own effective clearance.

Malformed operational classification fails closed.

## Parent/child filtering

Resource hierarchy cannot be used to infer hidden data.

Examples:

- an asset is omitted if its parent sector is not visible, even when the asset itself has a lower clearance;
- personnel are omitted when their sector or assigned asset is not visible;
- Dashboard names are resolved only from already-authorized sectors/assets;
- aggregate sector/fleet/personnel counts are calculated **after** clearance filtering.

This prevents counts and child metadata from leaking the existence of higher-classified resources.

## Services

A service request is visible only when the caller has sufficient effective clearance and a valid relationship:

- requester;
- claimant;
- authorized responder for the service type; or
- authorized administrator within the same clearance boundary.

Creating a request classifies it at the requester's effective clearance. Claim/start/complete operations recheck authorization on the server. Service history inherits the request security boundary.

## DNI Admin

Admin capability does not bypass effective clearance.

A manually downgraded Owner/Admin is immediately limited to the lower effective clearance across personnel, sectors, assets, services, documents, mail, aggregates, and administration workspaces.

The Admin UI contains two security workspaces:

- **Clearances** — persistent personnel manual overrides and return-to-automatic controls;
- **Operational CL** — classification of sectors, assets/fleets, and personnel records.

Clearance administration now separates **view** and **mutation** capabilities. `clearance.view` is read-only. A persistent manual assignment requires both `clearance.assign` and `clearance.override_rank`; assigning `CLA/DIS` additionally requires `clearance.assign_absolute`. Returning a member to automatic rank/Discord clearance also requires the mutation capabilities. The `admin` capability may satisfy operation capabilities, but still does not bypass effective-clearance ceilings.

Classification/clearance mutations require CSRF protection and a reason where security state changes.

## Audit history

Security histories are append-only at the database layer for normal application operation.

Protected histories include:

- general DNI audit log;
- personnel clearance events;
- document classification events;
- document workflow events;
- personnel assignment history;
- service request events.

MariaDB triggers reject UPDATE and DELETE attempts against these histories. Security changes are represented as new events rather than rewriting previous events.

As with any relational database, an infrastructure-level database superuser or root administrator can ultimately alter physical database state. The DNI application does not expose such a bypass and its normal database/application paths treat these histories as immutable.

## Legacy route isolation

The historical MariaDB compatibility dispatcher is read-only for operational data. Its older mutation paths are disabled rather than kept as a second authorization implementation.

Supported legacy reads use the same clearance-filtered network/service/document helpers as current server endpoints. Current writes go through the dedicated secured bridges.

## Web/session hardening

The production application also uses:

- strict server sessions;
- secure and HttpOnly session cookies;
- SameSite cookie policy;
- CSRF checks on protected writes;
- no-store handling for sensitive API responses;
- clickjacking/content-type protection;
- production CSP/HSTS/Permissions-Policy headers through the Rocky/Apache configuration;
- server-held credentials for Star Comms and other private integrations.

Client state, React/browser state, query parameters, localStorage, and browser-controlled claims are not authorization authorities.

## Regression coverage

The final verification suite checks the entire clearance stack together, including:

- all seven clearance levels;
- manual override persistence and downgrade behavior;
- self-escalation denial;
- above-actor assignment denial;
- read-only `clearance.view` separation from mutation capabilities;
- `CLA/DIS` assignment capability requirements;
- canonical rank-default mappings;
- secure document reads/search/workflow;
- secure Mail recipient and clearance rules;
- hidden sector/asset/personnel hierarchy behavior;
- aggregate counts after filtering;
- Services requester/responder isolation;
- manually downgraded administrator restrictions;
- operational classification bounds;
- append-only audit triggers;
- disabled legacy mutation routes;
- PHP and JavaScript syntax;
- production Node and Rocky/LAMP build outputs.

Repository verification entrypoint:

```text
npm run verify
```

## Completed rollout

1. Clearance database/core foundation
2. Effective clearance engine and Discord/rank mapping
3. Document read/search/download enforcement
4. Officer/ISB document creation and classification workflow
5. DNI Mail and announcement clearance enforcement
6. Persistent personnel clearance administration and audit history
7. Dashboard/Sectors/Fleets/Assets/Personnel/Services/Admin operational enforcement
8. Append-only audit hardening and legacy-route isolation
9. Full negative regression matrix and production verification/deployment
10. Clearance-admin capability separation, canonical rank defaults, and final regression cleanup

The security foundation is considered complete. Future modules must reuse these server-side authorization helpers and must not introduce separate client-trusted clearance logic.
