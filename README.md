# Гардарика — Система заказов

Веб-сервис для торговых представителей: прайс, клиенты, заказы, экспорт в 1С.

---

## Быстрый старт (Windows, локально)

### Требования

| Компонент | Версия | Ссылка |
|-----------|--------|--------|
| Python | 3.10+ | https://python.org |
| PostgreSQL | 14+ | https://postgresql.org |

---

### Шаг 1 — Клонировать / распаковать проект

Распакуйте папку `gardarika` в удобное место, например `C:\gardarika`.

---

### Шаг 2 — Создать базу данных

Откройте **pgAdmin** или **psql** и выполните:

```sql
CREATE DATABASE gardarika;
```

> Пользователь по умолчанию: `postgres`, пароль: `postgres`  
> Если у вас другой пароль — отредактируйте файл `backend/.env`

---

### Шаг 3 — Настроить `.env`

Откройте файл `backend/.env` и проверьте строку подключения:

```
DATABASE_URL=postgresql+asyncpg://postgres:ВАШ_ПАРОЛЬ@localhost:5432/gardarika
```

---

### Шаг 4 — Запустить backend

Дважды кликните **`start_backend.bat`**  
или откройте терминал и выполните:

```bat
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Таблицы создадутся автоматически при первом запуске.  
Будет создан администратор: **логин `admin`**, **пароль `admin123`**.

---

### Шаг 5 — Запустить frontend

Дважды кликните **`start_frontend.bat`**  
или выполните:

```bat
cd frontend
python -m http.server 3000
```

---

### Шаг 6 — Открыть браузер

```
http://localhost:3000
```

Войдите: `admin` / `admin123`

---

## Структура проекта

```
gardarika/
├── backend/
│   ├── app/
│   │   ├── main.py          ← точка входа FastAPI
│   │   ├── database.py      ← подключение к БД
│   │   ├── models.py        ← таблицы (SQLAlchemy)
│   │   ├── auth.py          ← JWT + bcrypt
│   │   ├── init_db.py       ← создание admin при запуске
│   │   └── routers/
│   │       ├── auth.py      ← /api/auth
│   │       ├── products.py  ← /api/products
│   │       ├── clients.py   ← /api/clients
│   │       ├── orders.py    ← /api/orders
│   │       └── admin.py     ← /api/admin
│   ├── requirements.txt
│   └── .env                 ← настройки (DB, JWT)
│
├── frontend/
│   ├── index.html           ← SPA (Bootstrap 5)
│   ├── css/style.css
│   ├── js/
│   │   ├── api.js           ← все API-вызовы
│   │   ├── app.js           ← логин, роутинг, хелперы
│   │   ├── price.js         ← прайс-лист
│   │   ├── clients.js       ← клиенты
│   │   ├── orders.js        ← заказы
│   │   └── admin.js         ← админ-панель
│   ├── manifest.json        ← PWA манифест
│   └── sw.js                ← Service Worker
│
├── photos/                  ← фото товаров (код_товара.jpg)
├── orders/                  ← экспортированные .grd файлы
│
├── start_backend.bat        ← запуск бэкенда
├── start_frontend.bat       ← запуск фронтенда
├── setup.ps1                ← первоначальная настройка
└── README.md
```

---

## Роли пользователей

| Роль | Возможности |
|------|-------------|
| **admin** | Всё + загрузка прайса, управление пользователями, статистика |
| **agent** | Просмотр прайса, свои клиенты, свои заказы, экспорт .grd |

---

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/auth/login` | Авторизация |
| GET | `/api/products` | Список товаров (поиск, фильтры, пагинация) |
| POST | `/api/products/import` | Загрузка прайса из Excel (admin) |
| GET | `/api/clients` | Список клиентов |
| POST | `/api/clients` | Создать клиента |
| GET | `/api/orders` | Список заказов |
| POST | `/api/orders` | Создать заказ |
| GET | `/api/orders/{id}/export` | Скачать .grd файл |
| GET | `/api/admin/stats` | Статистика (admin) |
| GET | `/api/admin/users` | Список пользователей (admin) |

Swagger UI: `http://localhost:8000/docs`

---

## Формат прайса Excel (1С)

| № | Наименование товаров | Код | Код ГРД | Прайс | Упаковка | Наличие | Тип | Производитель |
|---|---------------------|-----|---------|-------|----------|---------|-----|---------------|
| 1 | Замок врезной Mottura | 00015574 | 22226 | 17333.42 | 1 | 0 | ВРЕЗНЫЕ ЗАМКИ | MOTTURA |

---

## Формат .grd (экспорт в 1С)

```
КодГРД@Количество@Цена
22226@4@446
22230@3@439
```

---

## Фотографии товаров

Поместите фотографии в папку `photos/`.  
Имя файла = код товара:

```
photos/
├── 00015574.jpg
├── 00010684.jpg
└── ...
```

Или загрузите через **Админ панель → Фото товаров**.

---

## Переезд в Portainer (Docker)

Когда будете готовы переносить на сервер:

1. В корне проекта создайте `docker-compose.yml` (шаблон ниже)
2. Измените в `backend/.env` хост БД с `localhost` на `db`
3. `docker compose up -d`

```yaml
version: '3.9'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: gardarika
      POSTGRES_USER: gardarika
      POSTGRES_PASSWORD: СМЕНИТЬ_ПАРОЛЬ
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://gardarika:СМЕНИТЬ_ПАРОЛЬ@db:5432/gardarika
      SECRET_KEY: СМЕНИТЬ_СЕКРЕТ
    volumes:
      - ./photos:/app/photos
      - ./orders:/app/orders
    depends_on: [db]

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./frontend:/usr/share/nginx/html:ro
      - ./photos:/usr/share/nginx/photos:ro
    depends_on: [backend]

volumes:
  postgres_data:
```

---

## Смена пароля admin

Войдите в систему → Админ панель → Пользователи → ⋮ → Редактировать.

---

## Частые проблемы

**Backend не запускается — ошибка подключения к БД**
- Убедитесь что PostgreSQL запущен (Services → postgresql)
- Проверьте пароль в `backend/.env`
- Проверьте что база `gardarika` создана

**Фронтенд показывает ошибку "Failed to fetch"**
- Убедитесь что backend запущен на порту 8000
- Проверьте что браузер обращается к `http://localhost:8000`

**CORS ошибка**
- Не открывайте `index.html` напрямую из файловой системы
- Используйте `start_frontend.bat` (http://localhost:3000)
