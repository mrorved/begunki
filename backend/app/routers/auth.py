from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User
from app.auth import verify_password, create_access_token, get_current_user, get_password_hash

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт отключён")

    token = create_access_token({"sub": user.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name or user.username,
        "user_id": user.id,
    }


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "email": current_user.email,
        "phone": current_user.phone,
        "department_id": current_user.department_id,
    }


@router.put("/profile")
async def update_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.email is not None:
        current_user.email = data.email
    if data.phone is not None:
        current_user.phone = data.phone

    # Password change
    if data.new_password:
        if not data.current_password:
            raise HTTPException(400, "Введите текущий пароль")
        if not verify_password(data.current_password, current_user.hashed_password):
            raise HTTPException(400, "Неверный текущий пароль")
        if len(data.new_password) < 6:
            raise HTTPException(400, "Новый пароль должен быть не менее 6 символов")
        current_user.hashed_password = get_password_hash(data.new_password)

    await db.commit()
    return {
        "ok": True,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "phone": current_user.phone,
    }
