ALTER TABLE drafts ADD COLUMN base_publication_id TEXT REFERENCES publications(id);
CREATE TRIGGER draft_base_audit AFTER UPDATE OF base_publication_id ON drafts BEGIN
 INSERT INTO audit(actor,action,target,detail) VALUES(NEW.author,'rebase-draft',NEW.id,json_object('previousBase',OLD.base_publication_id,'basePublicationId',NEW.base_publication_id,'version',NEW.version));
END;
