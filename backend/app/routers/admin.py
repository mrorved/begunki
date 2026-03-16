from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User, Order, Client, Product
from app.auth import require_admin, get_password_hash

router = APIRouter()


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: str = "agent"  # admin | director | head | agent
    department_id: Optional[int] = None


class UserUpdate(BaseModel):
    password: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None
    department_id: Optional[int] = None


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    from sqlalchemy.orm import selectinload
    rows = (await db.execute(select(User).options(selectinload(User.department)).order_by(User.role, User.username))).scalars().all()
    return [
        {
            "id": u.id, "username": u.username, "full_name": u.full_name,
            "role": u.role, "is_active": u.is_active,
            "department_id": u.department_id,
            "department_name": u.department.name if u.department else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in rows
    ]


@router.post("/users")
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    exists = (await db.execute(select(User).where(User.username == data.username))).scalar_one_or_none()
    if exists:
        raise HTTPException(400, "Пользователь с таким логином уже существует")
    user = User(
        username=data.username,
        full_name=data.full_name or data.username,
        hashed_password=get_password_hash(data.password),
        role=data.role,
        department_id=data.department_id,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role}


@router.put("/users/{uid}")
async def update_user(uid: int, data: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    if data.password:
        user.hashed_password = get_password_hash(data.password)
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.role is not None:
        user.role = data.role
    if data.department_id is not None:
        user.department_id = data.department_id
    await db.commit()
    return {"ok": True}


@router.delete("/users/{uid}")
async def delete_user(uid: int, db: AsyncSession = Depends(get_db), me=Depends(require_admin)):
    if uid == me.id:
        raise HTTPException(400, "Нельзя удалить самого себя")
    user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    await db.delete(user)
    await db.commit()
    return {"ok": True}


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    total_orders = (await db.execute(select(func.count()).select_from(Order))).scalar()
    total_sum = (await db.execute(select(func.coalesce(func.sum(Order.total), 0)))).scalar()
    total_clients = (await db.execute(select(func.count()).select_from(Client))).scalar()
    total_products = (await db.execute(select(func.count()).select_from(Product))).scalar()

    agents = (await db.execute(select(User).where(User.role == "agent"))).scalars().all()
    by_agent = []
    for a in agents:
        cnt = (await db.execute(select(func.count()).select_from(Order).where(Order.agent_id == a.id))).scalar()
        sm = (await db.execute(select(func.coalesce(func.sum(Order.total), 0)).where(Order.agent_id == a.id))).scalar()
        by_agent.append({
            "agent_id": a.id,
            "agent_name": a.full_name or a.username,
            "orders_count": cnt,
            "orders_sum": float(sm),
        })

    return {
        "total_orders": total_orders,
        "total_sum": float(total_sum),
        "total_clients": total_clients,
        "total_products": total_products,
        "by_agent": by_agent,
    }
