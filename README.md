# AI Chat

Локальный одностраничный чат с проксированием запросов к OpenRouter.

## Запуск:

1. Установите зависимости (по отдельности для бэкенда и фронтенда):

```bash
# backend
cd backend
npm i

# frontend
cd ../frontend
npm i
```

2. Установите локальные `.env`:

Создайте `backend/.env` на основе `backend/.env.example` и вставьте туда `OPENROUTER_API_KEY`.

```bash
copy backend\.env.example backend\.env
# затем откройте backend\.env и вставьте OPENROUTER_API_KEY
```

3. Запуск локально:

```bash
# запустить бэкенд на порту 3000
cd backend
npm run dev

# запустить фронтенд отдельно (на 3001)
cd frontend
npm run serve
```

Откройте http://localhost:3000 — если вы запустили только бэкенд (он отдаёт `frontend`).

Решения и примечания:

- Ключ хранится на сервере (в .env) и не попадает в браузер.
- Прокси использует stream=true у OpenRouter и ретранслирует чанки клиенту через SSE-like события.
- Отмена реализована через прерывание fetch на стороне клиента (AbortController).
- История хранится только в памяти страницы; при перезагрузке теряется — проще и безопаснее для прототипа. Если нужна персистентность, можно сохранять в localStorage или на сервере и восстанавливать при загрузке.

---

## Описание сервера и эндпоинты

### Основы сервера (`backend/index.js`)

Сервер реализован в файле [`backend/index.js`](backend/index.js) на базе **Express** и выполняет роль безопасного прокси для запросов к OpenRouter API.

- **Стек**: Node.js, Express, `node-fetch`, `cors`, `dotenv`.
- **Переменные окружения**:
  - `OPENROUTER_API_KEY` (обязательно) — ключ API для авторизации в OpenRouter.
  - `OPENROUTER_URL` (опционально, по умолчанию `https://api.openrouter.ai/v1/chat/completions`) — адрес эндпоинта OpenRouter.
  - `DEFAULT_MODEL` (опционально, по умолчанию `gpt-4o-mini:free`) — модель по умолчанию.
  - `PORT` (опционально, по умолчанию `3000`) — порт запуска сервера.
- **Поддержка прерывания (AbortController)**: при отключении клиента (`req.on('close')`) сервер отменяет исходящий запрос к OpenRouter, предотвращая лишний расход токенов.

---

### Эндпоинты API

#### 1. `POST /api/chat`

Принимает историю сообщений и возвращает ответ языковой модели в виде потока событий (SSE).

- **Заголовки запроса**:
  - `Content-Type: application/json`
- **Тело запроса (JSON)**:
  - `messages` *(Array, обязательно)* — массив объектов сообщений вида `[{ role: "user" | "assistant" | "system", content: "..." }]`.
  - `model` *(string, опционально)* — идентификатор модели (по умолчанию значение из `DEFAULT_MODEL` или `gpt-4o-mini:free`).

Пример запроса:
```json
{
  "model": "gpt-4o-mini:free",
  "messages": [
    { "role": "user", "content": "Привет!" }
  ]
}
```

- **Успешный ответ (`200 OK`)**:
  - Заголовки: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  - Сервер ретранслирует чанки от OpenRouter:
    - Порции данных: `data: "<сырой_чанк_OpenRouter>"\n\n`
    - Завершение потока:
      ```
      event: done
      data: [DONE]
      ```
    - Ошибка в процессе стриминга:
      ```
      event: error
      data: "<ошибка>"
      ```

- **Коды ответов и ошибки**:
  - `400 Bad Request` — если не передано поле `messages` (`{"error": "messages required"}`).
  - `499 Client Closed Request` — если клиент разорвал соединение до завершения ответа (`{"error": "client aborted"}`).
  - Статусы OpenRouter (`401`, `402`, `429` и т.д.) — возвращается код ошибки и тело ошибки от OpenRouter.
  - `500 Internal Server Error` — внутренняя ошибка сервера (`{"error": "<сообщение>"}`).

Пример вызова через `curl`:
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Привет!"}]}'
```

---

#### 2. `GET /` (раздача статики)

- Отдает статические файлы фронтенда из папки `../frontend` относительно директории `backend/` с помощью `express.static`.

## ИИ-лог
Я воспользовался IDE Antigravity с моделью Gemini 3.8 Flash. 
Пришлось допилить:
- Добавил описание эндпойнтов в файл README.
- Вынес переменные окружения в файл .env.
- Вынес стили фронта в отдельный файл styles.css.
- Перевел проект на сборщик Vite (создал полноценную структуру со сборкой и App.vue)
- Перенес стили в src и перевел на формат SCSS (`src/styles.scss`)
- Вынес секцию сообщений и форму отправки в отдельные компоненты [`ChatMessages.vue`](frontend/src/components/ChatMessages.vue) и [`ChatControls.vue`](frontend/src/components/ChatControls.vue)

## Дальше 
подключить рендер Markdown, обработку ошибок по типам (429) и тесты.
