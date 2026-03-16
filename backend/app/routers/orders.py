import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db
from sqlalchemy.orm import selectinload
from app.models import Order, OrderItem, Client, Product, User, Settings
from app.auth import get_current_user, can_view_all, can_manage_orders

router = APIRouter()

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
    comment: Optional[str] = None
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
        .options(selectinload(Order.client), selectinload(Order.agent).selectinload(User.department), selectinload(Order.items))
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
    else:
        # Hide processing orders from default view for everyone
        q = q.where(Order.status != "processing")

    rows = (await db.execute(q)).scalars().all()
    return [_to_dict(o) for o in rows]


@router.post("")
async def create_order(data: OrderIn, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    if not (-99 <= data.discount <= 99):
        raise HTTPException(400, "Скидка должна быть от -99% до +99%")

    client = await _check_client(data.client_id, db, me)

    order = Order(agent_id=me.id, client_id=client.id, discount=data.discount, status="draft", comment=data.comment)
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

    if not (-99 <= data.discount <= 99):
        raise HTTPException(400, "Скидка должна быть от -99% до +99%")

    await _check_client(data.client_id, db, me)

    # Delete old items
    for item in order.items:
        await db.delete(item)
    await db.flush()

    order.client_id = data.client_id
    order.discount = data.discount
    order.comment = data.comment
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

    order = await _get_own(oid, db, me, load_items=True)
    order.status = "processing"
    await db.commit()

    # Send email notification
    try:
        await _send_order_notification(order, db)
    except Exception as e:
        print(f"[EMAIL] Failed to send notification: {e}")

    return {"ok": True, "status": "processing"}


async def _send_order_notification(order: Order, db):
    from app.email_service import send_order_email

    # Load SMTP settings
    rows = (await db.execute(select(Settings))).scalars().all()
    cfg = {r.key: r.value for r in rows}

    if not all(k in cfg for k in ("smtp_host", "smtp_port", "smtp_user", "smtp_password")):
        print("[EMAIL] SMTP not configured, skipping")
        return

    # Collect recipients
    recipients = []

    # Agent email
    agent = (await db.execute(select(User).where(User.id == order.agent_id))).scalar_one_or_none()
    if agent and agent.email:
        recipients.append(agent.email)

    # Head of department email
    if agent and agent.department_id:
        head = (await db.execute(
            select(User).where(
                User.department_id == agent.department_id,
                User.role == "head",
                User.is_active == True,
            )
        )).scalar_one_or_none()
        if head and head.email and head.email not in recipients:
            recipients.append(head.email)

    if not recipients:
        print("[EMAIL] No recipients with email, skipping")
        return

    # Load client info
    client = (await db.execute(select(Client).where(Client.id == order.client_id))).scalar_one_or_none()

    # Build .grd file path
    import os
    orders_dir = os.getenv("ORDERS_DIR", "/app/orders")
    grd_path = os.path.join(orders_dir, f"order_{order.id}.grd")
    # Generate .grd if not exists
    if not os.path.exists(grd_path):
        lines = [f"{item.product_code}@{item.qty}" for item in order.items]
        os.makedirs(orders_dir, exist_ok=True)
        with open(grd_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    ok, msg = await send_order_email(
        smtp_host=cfg["smtp_host"],
        smtp_port=int(cfg["smtp_port"]),
        smtp_user=cfg["smtp_user"],
        smtp_password=cfg["smtp_password"],
        recipients=recipients,
        agent_name=agent.full_name or agent.username if agent else "—",
        client_name=client.name if client else "—",
        client_inn=client.inn if client else None,
        client_address=client.address if client else None,
        client_phone=client.phone if client else None,
        client_contact=client.contact_person if client else None,
        client_status=client.status if client else None,
        order_comment=order.comment,
        discount=order.discount,
        items=[
            {
                "product_code": i.product_code,
                "product_name": i.product_name,
                "qty": i.qty,
                "price": i.price,
                "total": i.total,
            }
            for i in order.items
        ],
        order_id=order.id,
        grd_filepath=grd_path if os.path.exists(grd_path) else None,
    )

    if ok:
        print(f"[EMAIL] Order #{order.id} notification sent to: {recipients}")
    else:
        print(f"[EMAIL] Failed: {msg}")


@router.get("/{oid}/export")
async def export_order(oid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    order = await _get_own(oid, db, me, load_items=True)

    lines = [f"{item.product_code}@{item.qty}" for item in order.items]
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
        selectinload(Order.client),
        selectinload(Order.agent).selectinload(User.department),
        *(([selectinload(Order.items)]) if load_items else [])
    ).where(Order.id == oid)
    order = (await db.execute(q)).scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Заказ не найден")

    if me.role in ("admin", "director"):
        pass  # full access
    elif me.role == "head":
        # Head can access orders of agents in their department
        dept_users = (await db.execute(
            select(User).where(User.department_id == me.department_id)
        )).scalars().all()
        dept_user_ids = [u.id for u in dept_users]
        if order.agent_id not in dept_user_ids:
            raise HTTPException(403, "Доступ запрещён")
    else:
        # Agent sees only own orders
        if order.agent_id != me.id:
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
        selectinload(Order.client), selectinload(Order.agent).selectinload(User.department), selectinload(Order.items)
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
        "comment": o.comment,
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
