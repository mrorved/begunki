import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.routers import auth, products, clients, orders, admin
from app.init_db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed initial data
    await init_db()
    yield


app = FastAPI(
    title="Гардарика — Система заказов",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve product photos
photos_dir = Path(__file__).parent.parent.parent / "photos"
photos_dir.mkdir(exist_ok=True)
# Set env var so all routers resolve to the same directory
os.environ["PHOTOS_DIR"] = str(photos_dir)
app.mount("/photos", StaticFiles(directory=str(photos_dir)), name="photos")

# API routes
app.include_router(auth.router, prefix="/api/auth", tags=["Авторизация"])
app.include_router(products.router, prefix="/api/products", tags=["Прайс"])
app.include_router(clients.router, prefix="/api/clients", tags=["Клиенты"])
app.include_router(orders.router, prefix="/api/orders", tags=["Заказы"])
app.include_router(admin.router, prefix="/api/admin", tags=["Администратор"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Гардарика"}
