from sqlalchemy.orm import Session

from ..models.tables import AuditLog


def log_action(db: Session, actor_user_id, action: str, entity=None, entity_id=None, details=None):
    db.add(AuditLog(actor_user_id=actor_user_id, action=action, entity=entity,
                    entity_id=str(entity_id) if entity_id is not None else None, details=details))
    db.commit()
