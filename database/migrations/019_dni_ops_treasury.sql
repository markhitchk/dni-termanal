-- DNI Operations 019: Contributions-first aUEC Funding & Treasury.
-- All figures are internal records, NOT a live Star Citizen wallet.
-- Existing roster, Discord sessions and Operations grants remain authoritative.
CREATE TABLE dni_ops_treasury_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reported_by INTEGER NOT NULL,
  amount_auec INTEGER NOT NULL CHECK(amount_auec BETWEEN 1 AND 2147483647),
  purpose TEXT NOT NULL DEFAULT '',
  reported_reference TEXT NOT NULL DEFAULT '',
  public_credit INTEGER NOT NULL DEFAULT 0 CHECK(public_credit IN (0,1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  reviewed_by INTEGER,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  verified_reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
     OR (status IN ('verified','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TRIGGER dni_ops_treasury_contributions_immutable
BEFORE UPDATE ON dni_ops_treasury_contributions
WHEN OLD.status!='pending' OR NEW.reported_by!=OLD.reported_by
  OR NEW.amount_auec!=OLD.amount_auec OR NEW.purpose!=OLD.purpose
  OR NEW.reported_reference!=OLD.reported_reference
  OR NEW.public_credit!=OLD.public_credit OR NEW.status='pending'
BEGIN SELECT RAISE(ABORT,'Cannot rewrite recorded contribution facts'); END;
CREATE TRIGGER dni_ops_treasury_contributions_no_delete
BEFORE DELETE ON dni_ops_treasury_contributions
BEGIN SELECT RAISE(ABORT,'Immutable treasury contributions'); END;
CREATE INDEX dni_ops_treasury_contribution_status ON dni_ops_treasury_contributions(status,id);
CREATE INDEX dni_ops_treasury_contribution_person ON dni_ops_treasury_contributions(reported_by,id);
CREATE TABLE dni_ops_treasury_staff (
  user_id INTEGER PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  payment_limit_auec INTEGER NOT NULL DEFAULT 0 CHECK(payment_limit_auec BETWEEN 0 AND 2147483647),
  appointed_by INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE dni_ops_treasury_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('contribution','staff')),
  entity_id INTEGER NOT NULL,
  actor_user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('submitted','verified','rejected','appointed','updated','revoked')),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX dni_ops_treasury_events_entity ON dni_ops_treasury_events(entity_type,entity_id,id);
CREATE TRIGGER dni_ops_treasury_events_no_update
BEFORE UPDATE ON dni_ops_treasury_events BEGIN SELECT RAISE(ABORT,'Immutable treasury history'); END;
CREATE TRIGGER dni_ops_treasury_events_no_delete
BEFORE DELETE ON dni_ops_treasury_events BEGIN SELECT RAISE(ABORT,'Immutable treasury history'); END;
