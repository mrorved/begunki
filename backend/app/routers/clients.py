from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import os, httpx
from app.database import get_db
from app.models import Client, User
from app.auth import get_current_user

router = APIRouter()


class ClientIn(BaseModel):
    name: str
    inn: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    comment: Optional[str] = None


@router.get("")
async def list_clients(
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    q = select(Client).order_by(Client.name)
    if me.role != "admin":
        q = q.where(Client.agent_id == me.id)
    rows = (await db.execute(q)).scalars().all()
    return [_to_dict(c) for c in rows]


@router.post("")
async def create_client(
    data: ClientIn,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    client = Client(**data.model_dump(), agent_id=me.id)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return _to_dict(client)


@router.get("/{cid}")
async def get_client(cid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    client = await _get_own(cid, db, me)
    return _to_dict(client)


@router.put("/{cid}")
async def update_client(
    cid: int, data: ClientIn,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    client = await _get_own(cid, db, me)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(client, k, v)
    await db.commit()
    await db.refresh(client)
    return _to_dict(client)


@router.delete("/{cid}")
async def delete_client(cid: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    client = await _get_own(cid, db, me)
    await db.delete(client)
    await db.commit()
    return {"ok": True}


@router.get("/inn/{inn}")
async def lookup_inn(inn: str, _=Depends(get_current_user)):
    """Lookup company by INN using Dadata API."""
    api_key = os.getenv("DADATA_API_KEY", "")
    if not api_key:
        raise HTTPException(400, "DADATA_API_KEY не настроен в .env")

    url = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Token {api_key}",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json={"query": inn}, headers=headers)

    if resp.status_code != 200:
        raise HTTPException(502, "Ошибка запроса к Dadata")

    data = resp.json()
    suggestions = data.get("suggestions", [])
    if not suggestions:
        raise HTTPException(404, "Организация по ИНН не найдена")

    s = suggestions[0]
    d = s.get("data", {})
    address = d.get("address", {})

    # Extract city from address
    city = ""
    addr_data = address.get("data", {})
    if addr_data:
        city = addr_data.get("city") or addr_data.get("region") or ""

    return {
        "name": s.get("value", ""),
        "inn": d.get("inn", inn),
        "address": address.get("value", ""),
        "city": city,
        "kpp": d.get("kpp", ""),
        "ogrn": d.get("ogrn", ""),
    }


async def _get_own(cid: int, db: AsyncSession, me: User) -> Client:
    result = await db.execute(select(Client).where(Client.id == cid))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Клиент не найден")
    if me.role != "admin" and client.agent_id != me.id:
        raise HTTPException(403, "Доступ запрещён")
    return client


def _to_dict(c: Client) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "inn": c.inn,
        "phone": c.phone,
        "email": c.email,
        "contact_person": c.contact_person,
        "city": c.city,
        "address": c.address,
        "comment": c.comment,
        "agent_id": c.agent_id,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
