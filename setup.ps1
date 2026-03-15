# Гардарика — Setup Script (PowerShell)
# Запускать из корневой папки проекта
# Правой кнопкой мыши -> Run with PowerShell

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Гардарика Setup"

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Гардарика — Начальная настройка" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Python ───────────────────────────────────────────────────────────
Write-Host "[1/5] Проверка Python..." -ForegroundColor Yellow
try {
    $pyVersion = python --version 2>&1
    Write-Host "      OK: $pyVersion" -ForegroundColor Green
} catch {
    Write-Host "      ОШИБКА: Python не найден. Установите Python 3.10+ и повторите." -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"
    exit 1
}

# ── 2. Check PostgreSQL ────────────────────────────────────────────────────────
Write-Host "[2/5] Проверка PostgreSQL..." -ForegroundColor Yellow
try {
    $pgVersion = psql --version 2>&1
    Write-Host "      OK: $pgVersion" -ForegroundColor Green
} catch {
    Write-Host "      ПРЕДУПРЕЖДЕНИЕ: psql не в PATH. Убедитесь что PostgreSQL запущен и доступен." -ForegroundColor Yellow
}

# ── 3. Create database ────────────────────────────────────────────────────────
Write-Host "[3/5] Создание базы данных gardarika..." -ForegroundColor Yellow
Write-Host "      Введите пароль пользователя postgres если потребуется" -ForegroundColor Gray
try {
    psql -U postgres -c "CREATE DATABASE gardarika;" 2>&1 | Out-Null
    Write-Host "      OK: База данных создана" -ForegroundColor Green
} catch {
    Write-Host "      INFO: База данных возможно уже существует, продолжаем..." -ForegroundColor Gray
}

# ── 4. Create venv and install deps ──────────────────────────────────────────
Write-Host "[4/5] Настройка Python окружения..." -ForegroundColor Yellow
$backendDir = Join-Path $PSScriptRoot "backend"
Set-Location $backendDir

if (-not (Test-Path "venv")) {
    python -m venv venv
    Write-Host "      OK: Virtual environment создан" -ForegroundColor Green
}

& ".\venv\Scripts\pip.exe" install -r requirements.txt -q
Write-Host "      OK: Зависимости установлены" -ForegroundColor Green

# ── 5. Done ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[5/5] Готово!" -ForegroundColor Green
Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Следующий шаг:" -ForegroundColor Cyan
Write-Host ""
Write-Host " 1. Запустите: start_backend.bat" -ForegroundColor White
Write-Host " 2. Запустите: start_frontend.bat" -ForegroundColor White
Write-Host " 3. Откройте:  http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host " Логин: admin" -ForegroundColor Yellow
Write-Host " Пароль: admin123" -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Нажмите Enter для выхода"
