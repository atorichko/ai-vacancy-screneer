# Recruitment MVP

MVP веб-сервиса рекрутинга с автоматизацией:

1. первичный скрининг резюме,
2. анализ тестовых заданий,
3. сопоставление теста с опытом из резюме,
4. итоговый отчет для рекрутера.

## Стек

- Frontend: Next.js + TypeScript
- Backend: FastAPI + Python
- DB: PostgreSQL
- Queue: Redis + Celery
- Storage: MinIO (S3-compatible)
- AI: Polza.ai через OpenAI-compatible SDK

## Роли

- `admin`: создает профили должностей и шаблоны тестовых заданий из DOCX/XLSX
- `recruiter`: создает карточки кандидатов, загружает резюме (PDF/DOCX), загружает тестовые файлы (DOCX/XLSX), запускает анализ

## Быстрый старт

1. Скопируйте переменные:

```bash
cp .env.example .env
```

2. Укажите реальный `POLZA_API_KEY` в `.env`.
3. Запустите сервисы:

```bash
docker compose up --build
```

4. Откройте:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## Сквозной сценарий

1. Зарегистрируйте `admin`, выполните login.
2. Создайте профиль должности с 2 файлами: профиль + тестовое.
3. Зарегистрируйте `recruiter`, выполните login.
4. Создайте карточку кандидата и выберите профиль.
5. Загрузите резюме.
6. Загрузите один или несколько файлов тестового задания.
7. Нажмите `Run analysis`.
8. Дождитесь статуса `done` и проверьте отчеты/риски/вопросы.

## Развертывание на VDS

В проекте есть 2 сценария:

- `deploy/deploy-vds.sh` — первичная инициализация сервера и запуск из GitHub-репозитория.
- `deploy/deploy-on-vds.sh` — обновление кода на сервере через `git pull` и перезапуск контейнеров.

### Рекомендуемый процесс (сначала GitHub, потом VDS)

1. Вносите изменения локально.
2. Делаете `git push` в `main` репозитория `ai-vacancy-screneer`.
3. GitHub Actions workflow `.github/workflows/deploy-vds.yml` подключается по SSH к VDS.
4. На сервере запускается `deploy/deploy-on-vds.sh`, который обновляет код и выполняет `docker compose up -d --build`.

### GitHub Secrets для автодеплоя

Добавьте в репозитории:

- `VDS_HOST` — IP/домен сервера
- `VDS_USER` — SSH-пользователь
- `VDS_SSH_KEY` — приватный SSH-ключ
- `VDS_PORT` — SSH-порт (обычно `22`)

### Первичный запуск вручную на VDS

```bash
git clone https://github.com/atorichko/ai-vacancy-screneer.git /var/www/recruitment-mvp
cd /var/www/recruitment-mvp
cp .env.example .env
# заполните POLZA_API_KEY и другие переменные
bash deploy/deploy-vds.sh
```

### Важно про переменные в Docker Compose

- `api` и `worker` читают переменные из `.env` (а не из `.env.example`).
- Для публикации под nginx-префиксом `/recruitment-mvp` выставьте:

```env
NEXT_PUBLIC_API_URL=/recruitment-mvp-api
API_ROOT_PATH=/recruitment-mvp-api
```

Если порт `8000` на сервере занят, в текущем `docker-compose.yml` API опубликован как `8001:8000`.
В этом случае в nginx для `/recruitment-mvp-api/` используйте upstream `http://127.0.0.1:8001/`.

### Готовый nginx-конфиг (главная страница остается на `/`)

В проект добавлен пример: `deploy/nginx-recruitment-mvp.conf`.

Он делает следующее:

- `https://atorichko.asur-adigital.ru/recruitment-mvp` — фронтенд Recruitment MVP;
- `https://atorichko.asur-adigital.ru/recruitment-mvp/dashboard` — кабинет после авторизации;
- `https://atorichko.asur-adigital.ru/recruitment-mvp-api/docs` — Swagger backend;
- `http://185.28.85.131/recruitment-mvp...` и `http://185.28.85.131/recruitment-mvp-api...` — 301 редирект на новый HTTPS-домен.

Применение на сервере:

```bash
sudo cp /var/www/recruitment-mvp/deploy/nginx-recruitment-mvp.conf /etc/nginx/sites-available/recruitment-mvp.conf
sudo ln -sf /etc/nginx/sites-available/recruitment-mvp.conf /etc/nginx/sites-enabled/recruitment-mvp.conf
sudo nginx -t
sudo systemctl reload nginx
```

Если SSL-сертификат для `atorichko.asur-adigital.ru` еще не выпущен:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d atorichko.asur-adigital.ru
sudo nginx -t
sudo systemctl reload nginx
```

### Единый nginx-конфиг для всех проектов на одном домене

Если на VDS крутится несколько приложений на `atorichko.asur-adigital.ru`, используйте единый файл:

- `deploy/nginx-atorichko-unified.conf`

Он обслуживает:

- `/`
- `/image-resize/`
- `/ymaps-app/`
- `/recruitment-mvp/` (и `/recruitment-mvp-api/`)

Перед включением:

1. Проверьте upstream-порты в начале файла (`app_root_image_resize`, `app_ymaps`, `app_recruitment_frontend`, `app_recruitment_api`).
2. Убедитесь, что для домена включен только один `server_name atorichko.asur-adigital.ru` на `80/443`.

Применение:

```bash
sudo cp /var/www/recruitment-mvp/deploy/nginx-atorichko-unified.conf /etc/nginx/sites-available/atorichko.asur-adigital.ru.conf
sudo ln -sf /etc/nginx/sites-available/atorichko.asur-adigital.ru.conf /etc/nginx/sites-enabled/atorichko.asur-adigital.ru.conf
# отключите старые дубли с тем же server_name:
sudo grep -Rns "server_name .*atorichko.asur-adigital.ru" /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl reload nginx
```
