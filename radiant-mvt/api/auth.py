from datetime import datetime, timedelta
from typing import Optional
import os

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from database.db import get_db
from api.rate_limit import limiter

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY", "radiant-mvt-jwt-secret-2026-ineos-trading")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "480"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


# ── Pydantic models ──────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    email: str
    full_name: str
    role: str
    desk: str
    title: Optional[str] = None

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
    role: Optional[str] = None


# ── Password utilities ───────────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ── Token utilities ──────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return TokenData(user_id=int(user_id), email=email, role=role)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Auth dependency ──────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> dict:
    token_data = decode_token(credentials.credentials)
    row = db.execute(
        text("SELECT id, email, full_name, role, desk, title, is_active FROM users WHERE id = :uid"),
        {"uid": token_data.user_id}
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not row.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated")
    return {
        "id": row.id,
        "email": row.email,
        "full_name": row.full_name,
        "role": row.role,
        "desk": row.desk,
        "title": row.title,
    }

async def require_role(*roles: str):
    """Return a dependency that enforces one of the given roles."""
    async def _check(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(roles)}"
            )
        return current_user
    return _check


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
async def login(request: Request, body: LoginRequest = Body(...), db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, email, hashed_password, full_name, role, desk, title, is_active FROM users WHERE email = :email"),
        {"email": body.email.lower().strip()}
    ).fetchone()

    if row is None or not verify_password(body.password, row.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not row.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated")

    # Update last_login
    db.execute(
        text("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = :uid"),
        {"uid": row.id}
    )
    db.commit()

    access_token = create_access_token(data={
        "sub": str(row.id),
        "email": row.email,
        "role": row.role,
    })

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=row.id,
        email=row.email,
        full_name=row.full_name,
        role=row.role,
        desk=row.desk or "INEOS Trading & Shipping",
        title=row.title,
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    # JWT is stateless; client discards token. Audit log hook can go here.
    return {"message": "Logged out successfully", "user_id": current_user["id"]}


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> dict:
    """Dependency that requires admin or head_trader role."""
    user = await get_current_user(credentials, db)
    if user["role"] not in ("admin", "head_trader"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or head_trader role required"
        )
    return user
