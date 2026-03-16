import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.routers import auth, products, clients, orders, admin, departments
from app.init_db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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

# Photos
photos_dir = Path(os.getenv("PHOTOS_DIR", "/app/photos"))
photos_dir.mkdir(exist_ok=True)
os.environ["PHOTOS_DIR"] = str(photos_dir)
app.mount("/photos", StaticFiles(directory=str(photos_dir)), name="photos")

# Static frontend assets (css/js/icons)
frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/css", StaticFiles(directory=str(frontend_dir / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(frontend_dir / "js")), name="js")
    if (frontend_dir / "icons").exists():
        app.mount("/icons", StaticFiles(directory=str(frontend_dir / "icons")), name="icons")

# API routes — must be registered BEFORE the SPA fallback
app.include_router(auth.router,        prefix="/api/auth",        tags=["Авторизация"])
app.include_router(products.router,    prefix="/api/products",    tags=["Прайс"])
app.include_router(clients.router,     prefix="/api/clients",     tags=["Клиенты"])
app.include_router(orders.router,      prefix="/api/orders",      tags=["Заказы"])
app.include_router(admin.router,       prefix="/api/admin",       tags=["Администратор"])
app.include_router(departments.router, prefix="/api/departments", tags=["Отделы"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Гардарика"}


# SPA fallback — only for non-API routes
@app.get("/{full_path:path}")
async def spa_fallback(request: Request, full_path: str):
    # Never intercept API calls
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    index = Path(__file__).parent.parent / "frontend" / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"error": "frontend not found"}, status_code=404)