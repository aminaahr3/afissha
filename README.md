# Biletiks - Self-Hosted Version

Автономная версия платформы бронирования билетов. Работает на любом VPS, локально или в Docker.

## Требования

- Node.js 18+ (или Docker)
- PostgreSQL 14+

## Быстрый старт (Docker)

```bash
# 1. Создайте .env файл
cp .env.example .env
# Отредактируйте .env и заполните все переменные

# 2. Запустите
docker compose up -d

# Приложение доступно на http://localhost:5000
```

## Установка без Docker

```bash
# 1. Установите зависимости
npm install

# 2. Создайте .env файл
cp .env.example .env
# Отредактируйте .env

# 3. Создайте базу данных PostgreSQL и выполните init.sql
psql -U your_user -d your_db -f init.sql

# 4. Соберите проект
npm run build

# 5. Запустите
npm start
```

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | Строка подключения к PostgreSQL |
| `PORT` | Порт сервера (по умолчанию 5000) |
| `APP_URL` | Публичный URL приложения (для Telegram webhook) |
| `ADMIN_PASSWORD` | Пароль администратора |
| `TELEGRAM_GROUP_BOT_TOKEN` | Токен Telegram-бота |
| `TELEGRAM_ADMIN_CHAT_ID` | ID чата администратора в Telegram |
| `TELEGRAM_GROUP_ID` | ID группы/канала для уведомлений |

## Настройка Telegram-бота

1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Получите токен бота
3. Узнайте свой chat ID через [@userinfobot](https://t.me/userinfobot)
4. Создайте группу/канал и добавьте туда бота
5. Заполните переменные `TELEGRAM_*` в `.env`

## Деплой на VPS

```bash
# На сервере
git clone <repo-url>
cd self-hosted-version
cp .env.example .env
nano .env  # заполните переменные
docker compose up -d
```

Настройте nginx как reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }
}
```

## Структура

```
self-hosted-version/
├── src/
│   ├── server.ts      # Основной сервер Express
│   ├── telegram.ts     # Сервис Telegram-бота
│   └── database.ts     # Инициализация БД
├── public/             # HTML-страницы фронтенда
├── init.sql            # Схема базы данных
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example
```

## Разработка

```bash
npm install
npm run dev
```

## Лицензия

Private / Proprietary
