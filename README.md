# temirslearn

Личная платформа подготовки: интерактивные уроки, свои задачи с судьёй в браузере, ИИ-интервью голосом, заметки.
Живёт на https://temirslearn.verylabs.dev (Cloudflare Workers + D1 + Workers AI).

```bash
npm install
cp .dev.vars.example .dev.vars        # логин, хеш пароля (npm run hash-password -- 'пароль'), секрет сессии
npm run db:migrate:local
npm run dev                           # http://localhost:6630
npm run deploy                        # сборка + выкладка
```

## Где что

```
src/content/catalog.ts        треки, уроки, маршруты — план целиком
src/content/lessons/<track>/  уроки в MDX; урок «готов», когда файл существует
src/widgets/                  интерактивные виджеты уроков
src/problems/index.ts         задачи: условие, сигнатура, тесты
src/features/problems/        судья: Python (Pyodide) и JS в Web Worker
src/features/interview/       интервью: запись голоса, оценка, итог
src/ui/                       один компонент на контрол: Button, Chip, Segmented, Field, Sheet, CodeEditor
worker/                       Hono API: auth, прогресс, заметки, попытки, интервью
shared/interview.ts           роли и типы интервью — общие для фронта и API
migrations/                   схема D1
```

## Добавить урок

1. `src/content/lessons/<track>/<slug>.mdx` — текст + `import { Widget } from "../../../widgets/Widget"`.
2. Строка с этим `slug` уже есть в `catalog.ts` (или добавь её).
3. Внутри MDX доступны `<Callout>`, `<Quiz>`, `<Takeaways>`, формулы `$...$`.

## ИИ

- Транскрипция — Whisper (`whisper-large-v3-turbo`) на Workers AI.
- Вопросы и оценка — `gpt-oss-120b` на Workers AI; с секретом `OPENROUTER_API_KEY` — OpenRouter
  (модель в `OPENROUTER_MODEL`, по умолчанию `anthropic/claude-sonnet-5.5`).
