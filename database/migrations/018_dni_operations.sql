-- DNI Operations 018: SQLite runtime schema.
-- Adapted from the supplied Phase 1 MariaDB design. Existing identities,
-- rank assignments and document records remain in dni_store.payload_json.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS dni_ops_schema_migrations (
  version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dni_ops_settings (
  key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  updated_by INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dni_ops_divisions (
  corp_code TEXT PRIMARY KEY,
  purpose TEXT NOT NULL DEFAULT '',
  leadership_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(leadership_json)),
  subdivisions_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(subdivisions_json)),
  minimum_clearance INTEGER NOT NULL DEFAULT 1 CHECK(minimum_clearance BETWEEN 0 AND 6),
  updated_by INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dni_ops_training_documents (
  corp_code TEXT NOT NULL, file_code TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(corp_code,file_code)
);
CREATE TABLE IF NOT EXISTS dni_ops_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, corp_code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'task' CHECK(kind IN ('task','contract')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','completed','cancelled')),
  minimum_clearance INTEGER NOT NULL DEFAULT 1 CHECK(minimum_clearance BETWEEN 0 AND 6),
  deadline_at TEXT, created_by INTEGER NOT NULL, updated_by INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_tasks_corp ON dni_ops_tasks(corp_code,status,deadline_at);
CREATE TABLE IF NOT EXISTS dni_ops_task_assignees (
  task_id INTEGER NOT NULL REFERENCES dni_ops_tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL, assigned_by INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(task_id,user_id)
);
CREATE TABLE IF NOT EXISTS dni_ops_task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES dni_ops_tasks(id) ON DELETE RESTRICT,
  actor_user_id INTEGER, event_type TEXT NOT NULL, note TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_task_events ON dni_ops_task_events(task_id,id);
CREATE TABLE IF NOT EXISTS dni_ops_inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, corp_code TEXT NOT NULL CHECK(corp_code IN ('logistics','engineering')),
  category TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 2147483647),
  unit TEXT NOT NULL DEFAULT 'unit', minimum_clearance INTEGER NOT NULL DEFAULT 1 CHECK(minimum_clearance BETWEEN 0 AND 6),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_inventory_corp ON dni_ops_inventory_items(corp_code,category,active);
CREATE TABLE IF NOT EXISTS dni_ops_inventory_stock_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES dni_ops_inventory_items(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL CHECK(delta != 0), reason TEXT NOT NULL,
  related_request_id INTEGER, actor_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_stock_events ON dni_ops_inventory_stock_events(item_id,id);
CREATE TABLE IF NOT EXISTS dni_ops_loadout_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_code TEXT NOT NULL CHECK(branch_code IN ('army','navy')),
  name TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', wiki_url TEXT,
  is_standard_issue INTEGER NOT NULL DEFAULT 0 CHECK(is_standard_issue IN (0,1)),
  cost_auec INTEGER CHECK(cost_auec BETWEEN 0 AND 2147483647),
  inventory_item_id INTEGER REFERENCES dni_ops_inventory_items(id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(is_standard_issue = 0 OR cost_auec IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_loadout_branch ON dni_ops_loadout_items(branch_code,active);
CREATE TABLE IF NOT EXISTS dni_ops_requisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_code TEXT NOT NULL CHECK(branch_code IN ('army','navy')),
  requester_user_id INTEGER NOT NULL,
  fulfilling_corp_code TEXT NOT NULL CHECK(fulfilling_corp_code IN ('logistics','engineering')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','fulfilled','cancelled')),
  notes TEXT NOT NULL DEFAULT '', reviewed_by INTEGER, reviewed_at TEXT, fulfilled_by INTEGER, fulfilled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_req_queue ON dni_ops_requisitions(fulfilling_corp_code,status,created_at);
CREATE TABLE IF NOT EXISTS dni_ops_requisition_items (
  request_id INTEGER NOT NULL REFERENCES dni_ops_requisitions(id) ON DELETE RESTRICT,
  loadout_item_id INTEGER NOT NULL REFERENCES dni_ops_loadout_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
  name_snapshot TEXT NOT NULL, cost_auec_snapshot INTEGER,
  standard_issue_snapshot INTEGER NOT NULL CHECK(standard_issue_snapshot IN (0,1)),
  inventory_item_id INTEGER REFERENCES dni_ops_inventory_items(id) ON DELETE RESTRICT,
  PRIMARY KEY(request_id,loadout_item_id)
);
CREATE TABLE IF NOT EXISTS dni_ops_requisition_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES dni_ops_requisitions(id) ON DELETE RESTRICT,
  actor_user_id INTEGER, event_type TEXT NOT NULL, note TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dni_ops_isb_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op_type TEXT NOT NULL CHECK(op_type IN ('investigation','field_ops','reconnaissance')),
  title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', restricted_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','assigned','active','completed','rejected')),
  minimum_clearance INTEGER NOT NULL DEFAULT 6 CHECK(minimum_clearance BETWEEN 0 AND 6),
  requested_by INTEGER NOT NULL, assigned_to INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_isb_status ON dni_ops_isb_operations(status,created_at);
CREATE TABLE IF NOT EXISTS dni_ops_isb_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER NOT NULL REFERENCES dni_ops_isb_operations(id) ON DELETE RESTRICT,
  actor_user_id INTEGER, event_type TEXT NOT NULL, note TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dni_ops_isb_case_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER NOT NULL REFERENCES dni_ops_isb_operations(id) ON DELETE RESTRICT,
  actor_user_id INTEGER NOT NULL, note TEXT NOT NULL CHECK(length(note) BETWEEN 1 AND 20000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dni_ops_case_notes ON dni_ops_isb_case_notes(operation_id,id);
CREATE TABLE IF NOT EXISTS dni_ops_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id INTEGER NOT NULL,
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dni_ops_inventory_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_corp_code TEXT NOT NULL CHECK(requester_corp_code IN ('logistics','engineering')),
  fulfilling_corp_code TEXT NOT NULL CHECK(fulfilling_corp_code IN ('logistics','engineering')),
  item_id INTEGER NOT NULL REFERENCES dni_ops_inventory_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 2147483647),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','fulfilled','cancelled')),
  requested_by INTEGER NOT NULL, reviewed_by INTEGER, fulfilled_by INTEGER, fulfilled_at TEXT, notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(requester_corp_code != fulfilling_corp_code)
);
CREATE TABLE IF NOT EXISTS dni_ops_inventory_request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES dni_ops_inventory_requests(id) ON DELETE RESTRICT,
  actor_user_id INTEGER NOT NULL, event_type TEXT NOT NULL, note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dni_ops_idempotency (
  actor_user_id INTEGER NOT NULL, request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL, response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(actor_user_id,request_key)
);
-- Operational history is append-only. Application routes never delete records.
CREATE TRIGGER IF NOT EXISTS dni_ops_task_events_no_update
BEFORE UPDATE ON dni_ops_task_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_task_events_no_delete
BEFORE DELETE ON dni_ops_task_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_inventory_stock_events_no_update
BEFORE UPDATE ON dni_ops_inventory_stock_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_inventory_stock_events_no_delete
BEFORE DELETE ON dni_ops_inventory_stock_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_requisition_events_no_update
BEFORE UPDATE ON dni_ops_requisition_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_requisition_events_no_delete
BEFORE DELETE ON dni_ops_requisition_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_isb_events_no_update
BEFORE UPDATE ON dni_ops_isb_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_isb_events_no_delete
BEFORE DELETE ON dni_ops_isb_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_audit_no_update
BEFORE UPDATE ON dni_ops_audit BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_audit_no_delete
BEFORE DELETE ON dni_ops_audit BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_inventory_request_events_no_update
BEFORE UPDATE ON dni_ops_inventory_request_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_inventory_request_events_no_delete
BEFORE DELETE ON dni_ops_inventory_request_events BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;

CREATE TRIGGER IF NOT EXISTS dni_ops_case_notes_no_update
BEFORE UPDATE ON dni_ops_isb_case_notes BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
CREATE TRIGGER IF NOT EXISTS dni_ops_case_notes_no_delete
BEFORE DELETE ON dni_ops_isb_case_notes BEGIN SELECT RAISE(ABORT,'Immutable operations history'); END;
