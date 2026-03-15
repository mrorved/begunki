from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import User
from app.auth import get_password_hash


async def init_db():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin = User(
                username="admin",
                full_name="Администратор",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            await db.commit()
            print("✅ Создан администратор: admin / admin123")
        else:
            print("ℹ️  Администратор уже существует")
