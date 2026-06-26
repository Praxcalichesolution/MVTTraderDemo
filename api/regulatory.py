from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.db import get_db
from api.auth import get_current_user
from database.models import User, RegulatoryFiling

router = APIRouter()

@router.get("/")
async def get_regulatory_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    filings = db.query(RegulatoryFiling).all()
    return [
        {
            "id": f.id, "regulation": f.regulation, "filing_type": f.filing_type,
            "status": f.status, "next_deadline": f.next_deadline,
            "last_submitted": f.last_submitted, "notes": f.notes,
            "missing_fields": f.missing_fields
        }
        for f in filings
    ]
