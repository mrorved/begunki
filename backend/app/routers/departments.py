from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import Department, User
from app.auth import get_current_user, require_admin

router = APIRouter()


class DepartmentIn(BaseModel):
    name: str


@router.get("")
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    rows = (await db.execute(select(Department).order_by(Department.name))).scalars().all()
    return [{"id": d.id, "name": d.name} for d in rows]


@router.post("")
async def create_department(
    data: DepartmentIn,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    dept = Department(name=data.name)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return {"id": dept.id, "name": dept.name}


@router.put("/{dept_id}")
async def update_department(
    dept_id: int,
    data: DepartmentIn,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    dept = (await db.execute(select(Department).where(Department.id == dept_id))).scalar_one_or_none()
    if not dept:
        raise HTTPException(404, "Отдел не найден")
    dept.name = data.name
    await db.commit()
    return {"id": dept.id, "name": dept.name}


@router.delete("/{dept_id}")
async def delete_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    dept = (await db.execute(select(Department).where(Department.id == dept_id))).scalar_one_or_none()
    if not dept:
        raise HTTPException(404, "Отдел не найден")
    # Check if any users are in this department
    users = (await db.execute(select(User).where(User.department_id == dept_id))).scalars().all()
    if users:
        raise HTTPException(400, f"Нельзя удалить отдел — в нём {len(users)} пользователей")
    await db.delete(dept)
    await db.commit()
    return {"ok": True}
