from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User, Order, Client, Product, OrderItem, Settings
from sqlalchemy import update as sql_update, delete as sql_delete
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

    # Check if user has clients or orders
    client_count = (await db.execute(
        select(func.count()).select_from(Client).where(Client.agent_id == uid)
    )).scalar()
    order_count = (await db.execute(
        select(func.count()).select_from(Order).where(Order.agent_id == uid)
    )).scalar()

    if client_count > 0 or order_count > 0:
        raise HTTPException(
            400,
            f"Нельзя удалить пользователя — у него {client_count} клиентов и {order_count} заказов. "
            f"Сначала переназначьте или удалите их."
        )

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


# ── SMTP Settings ─────────────────────────────────────────────────────────────
from pydantic import BaseModel as PydanticBase

class SmtpSettings(PydanticBase):
    smtp_host: str = "smtp.yandex.ru"
    smtp_port: int = 465
    smtp_user: str
    smtp_password: str


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    rows = (await db.execute(select(Settings))).scalars().all()
    result = {r.key: r.value for r in rows}
    # Never return password
    result.pop("smtp_password", None)
    return result


@router.post("/settings/smtp")
async def save_smtp_settings(
    data: SmtpSettings,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    settings_map = {
        "smtp_host": data.smtp_host,
        "smtp_port": str(data.smtp_port),
        "smtp_user": data.smtp_user,
        "smtp_password": data.smtp_password,
    }
    for key, value in settings_map.items():
        existing = (await db.execute(select(Settings).where(Settings.key == key))).scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            db.add(Settings(key=key, value=value))
    await db.commit()
    return {"ok": True}


@router.post("/settings/smtp/test")
async def test_smtp(db: AsyncSession = Depends(get_db), me=Depends(require_admin)):
    from app.email_service import send_order_email
    rows = (await db.execute(select(Settings))).scalars().all()
    cfg = {r.key: r.value for r in rows}

    if not all(k in cfg for k in ("smtp_host", "smtp_port", "smtp_user", "smtp_password")):
        raise HTTPException(400, "SMTP не настроен")
    if not me.email:
        raise HTTPException(400, "У вашего профиля не указана почта для тестирования")

    ok, msg = await send_order_email(
        smtp_host=cfg["smtp_host"],
        smtp_port=int(cfg["smtp_port"]),
        smtp_user=cfg["smtp_user"],
        smtp_password=cfg["smtp_password"],
        recipients=[me.email],
        agent_name="Тест Тестович",
        client_name="Тестовый клиент ООО",
        client_inn="1234567890",
        client_address="г. Москва, ул. Тестовая, 1",
        client_phone="+7 (999) 123-45-67",
        client_contact="Иванов Иван",
        client_status="active",
        order_comment="Это тестовое письмо из системы Гардарика",
        discount=-5,
        items=[
            {"product_code": "TEST001", "product_name": "Замок врезной Mottura", "qty": 2, "price": 950.0, "total": 1900.0},
            {"product_code": "TEST002", "product_name": "Ручка дверная Abloy", "qty": 4, "price": 475.0, "total": 1900.0},
        ],
        order_id=0,
        grd_filepath=None,
    )
    if ok:
        return {"ok": True, "message": f"Письмо отправлено на {me.email}"}
    raise HTTPException(500, f"Ошибка отправки: {msg}")
