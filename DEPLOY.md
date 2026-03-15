# Деплой Гардарика — Portainer + GitHub

## Что нужно
- Сервер с Docker + Portainer
- GitHub репозиторий с кодом
- Домен направлен на IP сервера (через Кинетик или DNS)

---

## Шаг 1 — Залить код на GitHub

На своём компе в папке проекта:

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/ВАШ_ЛОГИН/gardarika.git
git push -u origin main
```

> ⚠️ Файл `.env` в `.gitignore` — секреты НЕ попадут в репозиторий.

---

## Шаг 2 — Создать Stack в Portainer

1. Откройте Portainer → **Stacks** → **+ Add stack**
2. Название: `gardarika`
3. Build method: **Repository**
4. Заполните:
   - **Repository URL**: `https://github.com/ВАШ_ЛОГИН/gardarika`
   - **Repository reference**: `refs/heads/main`
   - **Compose path**: `docker-compose.yml`
5. В блоке **Environment variables** добавьте:

| Name | Value |
|------|-------|
| `POSTGRES_PASSWORD` | придумайте пароль |
| `SECRET_KEY` | случайная строка 64 символа |
| `POSTGRES_DB` | `gardarika` |
| `POSTGRES_USER` | `gardarika` |

6. Нажмите **Deploy the stack**

---

## Шаг 3 — Проверить

Откройте `http://begunki.orved.netcraze.pro`

Логин: `admin` / Пароль: `admin123`

> ⚠️ Сразу смените пароль через Админ панель → Пользователи → ⋮ → Редактировать

---

## Обновление после изменений в коде

В Portainer: **Stacks** → **gardarika** → **Pull and redeploy**

Или на сервере по SSH:
```bash
cd /opt/gardarika && git pull && docker compose up -d --build
```

---

## Перенос фотографий с локальной машины

```bash
# Скопировать фото на сервер (с Windows, в PowerShell)
scp D:\GITHUB\begunki\photos\* root@ВАШ_IP:/tmp/photos/

# На сервере — скопировать в контейнер
docker cp /tmp/photos/. gardarika_backend:/app/photos/
```

---

## Миграция БД (добавить колонки inn и email)

```bash
docker exec -it gardarika_db psql -U gardarika -d gardarika -c "
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS inn VARCHAR(20);
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS email VARCHAR(200);
"
```

---

## Генерация SECRET_KEY

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```
