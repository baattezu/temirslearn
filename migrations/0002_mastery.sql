-- Интервальные повторения: одна строка на урок
CREATE TABLE reviews (
  lesson_id  TEXT PRIMARY KEY,
  reps       INTEGER NOT NULL,   -- сколько раз прошёл/повторил успешно подряд (шаг лестницы)
  total      INTEGER NOT NULL,   -- всего прохождений
  last_at    INTEGER NOT NULL,
  lapses     INTEGER NOT NULL DEFAULT 0
);

-- Выделения в уроках: якорь по тексту, а не по позиции
CREATE TABLE highlights (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT NOT NULL,
  color      TEXT NOT NULL,
  quote      TEXT NOT NULL,
  prefix     TEXT NOT NULL DEFAULT '',
  suffix     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX highlights_lesson ON highlights(lesson_id);

-- Тренажёр по математике
CREATE TABLE practice (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gen        TEXT NOT NULL,
  seed       INTEGER NOT NULL,
  correct    INTEGER NOT NULL,   -- 1 верно, 0 неверно, -1 посмотрел решение
  ai         TEXT,               -- JSON разбора фото
  created_at INTEGER NOT NULL
);
CREATE INDEX practice_gen ON practice(gen, created_at DESC);

-- Настройки (режим повторений и т.п.)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Интервью по одной теме (зачёт урока)
ALTER TABLE interviews ADD COLUMN topic TEXT;

-- уже пройденные уроки — первое прохождение
INSERT INTO reviews (lesson_id, reps, total, last_at, lapses)
SELECT lesson_id, 1, 1, updated_at, 0 FROM progress WHERE status = 'done';
