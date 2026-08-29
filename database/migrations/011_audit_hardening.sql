-- DNI Audit Hardening — Step 8
-- Security and classification histories are append-only. Normal application
-- code may insert events but may not rewrite or delete the historical record.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TRIGGER trg_dni_audit_log_no_update
BEFORE UPDATE ON dni_audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI audit history is append-only';
CREATE TRIGGER trg_dni_audit_log_no_delete
BEFORE DELETE ON dni_audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI audit history is append-only';

CREATE TRIGGER trg_dni_clearance_events_no_update
BEFORE UPDATE ON dni_user_clearance_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI clearance history is append-only';
CREATE TRIGGER trg_dni_clearance_events_no_delete
BEFORE DELETE ON dni_user_clearance_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI clearance history is append-only';

CREATE TRIGGER trg_dni_document_classification_no_update
BEFORE UPDATE ON dni_document_classification_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI classification history is append-only';
CREATE TRIGGER trg_dni_document_classification_no_delete
BEFORE DELETE ON dni_document_classification_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI classification history is append-only';

CREATE TRIGGER trg_dni_document_workflow_no_update
BEFORE UPDATE ON dni_document_workflow_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI workflow history is append-only';
CREATE TRIGGER trg_dni_document_workflow_no_delete
BEFORE DELETE ON dni_document_workflow_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI workflow history is append-only';

CREATE TRIGGER trg_dni_assignment_history_no_update
BEFORE UPDATE ON dni_personnel_assignment_history
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI assignment history is append-only';
CREATE TRIGGER trg_dni_assignment_history_no_delete
BEFORE DELETE ON dni_personnel_assignment_history
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI assignment history is append-only';

CREATE TRIGGER trg_dni_service_events_no_update
BEFORE UPDATE ON dni_service_request_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI service history is append-only';
CREATE TRIGGER trg_dni_service_events_no_delete
BEFORE DELETE ON dni_service_request_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DNI service history is append-only';
