from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from database.db import get_db
from api.auth import get_current_user, get_current_admin, get_password_hash
from database.models import User

router = APIRouter()

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    desk: Optional[str]
    title: Optional[str]
    is_active: int
    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str
    desk: Optional[str] = None
    title: Optional[str] = None

@router.get("/", response_model=List[UserOut])
async def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    return db.query(User).filter(User.is_active == 1).all()

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/", response_model=UserOut)
async def create_user(data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=data.email, hashed_password=get_password_hash(data.password),
        full_name=data.full_name, role=data.role, desk=data.desk, title=data.title
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}")
async def deactivate_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = 0
    db.commit()
    return {"message": f"User {user.email} deactivated"}
