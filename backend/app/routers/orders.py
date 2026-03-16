import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db
from sqlalchemy.orm import selectinload
from app.models import Order, OrderItem, Client, Product, User
from app.auth import get_current_user, can_view_all, can_manage_orders

router = APIRouter()

VALID_DISCOUNTS = {-10, -5, 0, 10, 20}
PROCESSING_STATUS = 'processing'


def get_orders_dir() -> str:
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    d = os.path.join(base, "orders")
    os.makedirs(d, exist_ok=True)
    return d


class ItemIn(BaseModel):
    product_code: str
    qty: int


class OrderIn(BaseModel):
    client_id: int
    discount: float = 0
    items: List[ItemIn]


@router.get("")
async def list_orders(
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
    status: str = Query(None),
    agent_id: int = Query(None),
    department_id: int = Query(None),
    client_id: int = Query(None),
):
    q = (
        select(Order)
        .options(selectinload(Order.client), selectinload(Order.agent), selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )

    # Role-based visibility
    if me.role == "agent":
        # Agent sees only own orders, excluding processing by default
        q = q.where(Order.agent_id == me.id)
    elif me.role == "head":
        # Head sees own department's orders
        dept_users = (await db.execute(
            select(User).where(User.department_id == me.department_id)
        )).scalars().all()
        dept_user_ids = [u.id for u in dept_users]
        q = q.where(Order.agent_id.in_(dept_user_ids))
    elif me.role in ("admin", "director"):
        # Admin/director see everything
        if department_id:
            dept_users = (await db.execute(
                select(User).where(User.department_id == department_id)
            )).scalars().all()
            dept_user_ids = [u.id for u in dept_users]
            q = q.where(Order.agent_id.in_(dept_user_ids))
        if agent_id:
            q = q.where(Order.agent_id == agent_id)
        if client_id:
            q = q.where(Order.client_id == client_id)

    # Status filter
    if status:
        q = q.where(Order.status == status)
    elif me.role in ("agent", "head"):
        # Hide processing orders from default view
        q = q.where(Order.status != "processing")

    rows = (await db.execute(q)).scalars().all()
    return [_to_dict(o) for o in rows]


@router.post("")
async def create_order(data: OrderIn, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    if data.discount not in VALID_DISCOUNTS:
        raise HTTPException(400, f"Допустимые значения скидки: {sorted(VALID_DISCOUNTS)}")

    client = await _check_client(data.client_id, db, me)

    order = Order(agent_id=me.id, client_id=client.id, discount=data.discount, status="draft")
    db.add(order)
    await db.flush()

    total = await _fill_items(order.id, data.items, data.discount, db)
    order.total = total
    await db.commit()

    return await _reload(order.id, db)


@router.get("/{oid}")
async def get_order(oid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    order = await _get_own(oid, db, me)
    return _to_dict(order)


@router.put("/{oid}")
async def update_order(
    oid: int, data: OrderIn,
    db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user),
):
    order = await _get_own(oid, db, me, load_items=True)
    if order.status == "exported":
        raise HTTPException(400, "Экспортированный заказ нельзя редактировать")

    if data.discount not in VALID_DISCOUNTS:
        raise HTTPException(400, f"Допустимые значения скидки: {sorted(VALID_DISCOUNTS)}")

    await _check_client(data.client_id, db, me)

    # Delete old items
    for item in order.items:
        await db.delete(item)
    await db.flush()

    order.client_id = data.client_id
    order.discount = data.discount
    order.total = await _fill_items(order.id, data.items, data.discount, db)
    await db.commit()

    return await _reload(order.id, db)


@router.delete("/{oid}")
async def delete_order(oid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    order = await _get_own(oid, db, me)
    await db.delete(order)
    await db.commit()
    return {"ok": True}


@router.post("/{oid}/submit")
async def submit_order(oid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    order = await _get_own(oid, db, me)
    order.status = "submitted"
    await db.commit()
    return {"ok": True, "status": "submitted"}


@router.post("/{oid}/process")
async def process_order(oid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    if not can_manage_orders(me):
        raise HTTPException(403, "Доступ запрещён")
    order = await _get_own(oid, db, me)
    order.status = "processing"
    await db.commit()
    return {"ok": True, "status": "processing"}


@router.get("/{oid}/export")
async def export_order(oid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    order = await _get_own(oid, db, me, load_items=True)

    lines = [f"{item.grd_code}@{item.qty}@{int(round(item.price))}" for item in order.items]
    filename = f"order_{order.id}.grd"
    filepath = os.path.join(get_orders_dir(), filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    order.status = "exported"
    await db.commit()

    return FileResponse(path=filepath, filename=filename, media_type="application/octet-stream")


# ── helpers ───────────────────────────────────────────────────────────────────

async def _check_client(client_id: int, db: AsyncSession, me: User) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Клиент не найден")
    if me.role != "admin" and client.agent_id != me.id:
        raise HTTPException(403, "Это не ваш клиент")
    return client


async def _get_own(oid: int, db: AsyncSession, me: User, load_items: bool = False) -> Order:
    q = select(Order).options(
        selectinload(Order.client), selectinload(Order.agent),
        *(([selectinload(Order.items)]) if load_items else [])
    ).where(Order.id == oid)
    order = (await db.execute(q)).scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Заказ не найден")
    if me.role != "admin" and order.agent_id != me.id:
        raise HTTPException(403, "Доступ запрещён")
    return order


async def _fill_items(order_id: int, items: List[ItemIn], discount: float, db: AsyncSession) -> float:
    total = 0.0
    for item_data in items:
        result = await db.execute(select(Product).where(Product.code == item_data.product_code))
        product = result.scalar_one_or_none()
        if not product:
            continue
        price = round(product.price * (1 - discount / 100), 2)
        item_total = round(price * item_data.qty, 2)
        db.add(OrderItem(
            order_id=order_id,
            product_code=product.code,
            grd_code=product.grd_code,
            product_name=product.name,
            qty=item_data.qty,
            price=price,
            total=item_total,
        ))
        total += item_total
    return round(total, 2)


async def _reload(oid: int, db: AsyncSession) -> dict:
    q = select(Order).options(
        selectinload(Order.client), selectinload(Order.agent), selectinload(Order.items)
    ).where(Order.id == oid)
    order = (await db.execute(q)).scalar_one()
    return _to_dict(order)


def _to_dict(o: Order) -> dict:
    return {
        "id": o.id,
        "agent_id": o.agent_id,
        "agent_name": o.agent.full_name if o.agent else None,
        "agent_department": o.agent.department.name if o.agent and o.agent.department else None,
        "client_id": o.client_id,
        "client_name": o.client.name if o.client else None,
        "client_city": o.client.city if o.client else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "discount": o.discount,
        "total": o.total,
        "status": o.status,
        "items": [
            {
                "id": i.id,
                "product_code": i.product_code,
                "grd_code": i.grd_code,
                "product_name": i.product_name,
                "qty": i.qty,
                "price": i.price,
                "total": i.total,
            }
            for i in (o.items or [])
        ],
    }
