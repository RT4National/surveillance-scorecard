PRAGMA foreign_keys = ON;
CREATE TABLE drafts (id TEXT PRIMARY KEY, dataset TEXT NOT NULL CHECK(json_valid(dataset)), summary TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL CHECK(status IN ('draft','review','published')), author TEXT NOT NULL, reviewer TEXT, updated_at TEXT NOT NULL);
CREATE TABLE publications (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE REFERENCES drafts(id), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_at TEXT NOT NULL);
CREATE TABLE current_publication (singleton INTEGER PRIMARY KEY CHECK(singleton=1), publication_id TEXT REFERENCES publications(id), revision INTEGER NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL);
INSERT INTO current_publication VALUES (1,NULL,0,'system','initial');
CREATE TABLE audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL);
CREATE TRIGGER immutable_publication_update BEFORE UPDATE ON publications BEGIN SELECT RAISE(ABORT,'Publications are immutable'); END;
CREATE TRIGGER immutable_publication_delete BEFORE DELETE ON publications BEGIN SELECT RAISE(ABORT,'Publications are immutable'); END;
CREATE TRIGGER immutable_audit_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TRIGGER immutable_audit_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TRIGGER publish_snapshot AFTER INSERT ON publications BEGIN
 UPDATE drafts SET status='published',version=version+1,updated_at=NEW.created_at WHERE id=NEW.draft_id;
 UPDATE current_publication SET publication_id=NEW.id,revision=revision+1,actor=json_extract(NEW.snapshot,'$.publishedBy'),reason=json_extract(NEW.snapshot,'$.summary') WHERE singleton=1;
END;
CREATE TRIGGER pointer_audit AFTER UPDATE ON current_publication BEGIN
 INSERT INTO audit(actor,action,target,detail) VALUES(NEW.actor,'select-publication',NEW.publication_id,json_object('previousId',OLD.publication_id,'reason',NEW.reason,'revision',NEW.revision));
END;
CREATE TRIGGER draft_audit AFTER UPDATE ON drafts BEGIN
 INSERT INTO audit(actor,action,target,detail) VALUES(COALESCE(NEW.reviewer,NEW.author),'draft-'||NEW.status,NEW.id,json_object('version',NEW.version));
END;
CREATE TABLE corrections(id TEXT PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES publications(id), evidence_id TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')), resolution TEXT, created_at TEXT NOT NULL);
CREATE TABLE rate_limits(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL);
