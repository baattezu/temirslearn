-- Прогресс по урокам: todo | doing | done
CREATE TABLE progress (
  lesson_id  TEXT PRIMARY KEY,
  status     TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Заметки: привязанные к уроку (lesson_id) или свободные (NULL)
CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX notes_lesson ON notes(lesson_id);
CREATE INDEX notes_updated ON notes(updated_at DESC);

-- Попытки задач (судья работает в браузере, сюда — итог)
CREATE TABLE submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id TEXT NOT NULL,
  lang       TEXT NOT NULL,
  code       TEXT NOT NULL,
  passed     INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX submissions_problem ON submissions(problem_id, created_at DESC);

-- ИИ-интервью
CREATE TABLE interviews (
  id          TEXT PRIMARY KEY,
  role        TEXT NOT NULL,
  level       TEXT NOT NULL,
  lang        TEXT NOT NULL,
  questions   TEXT NOT NULL,  -- JSON: [{q, topic, expects}]
  summary     TEXT,           -- JSON итог
  score       REAL,
  created_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE interview_answers (
  interview_id TEXT NOT NULL,
  idx          INTEGER NOT NULL,
  transcript   TEXT NOT NULL,
  grade        TEXT NOT NULL,  -- JSON оценка
  score        REAL NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (interview_id, idx)
);

-- Лента активности для календаря на главной
CREATE TABLE activity (
  day   TEXT NOT NULL,  -- YYYY-MM-DD (UTC+5)
  kind  TEXT NOT NULL,  -- lesson | problem | interview | note
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, kind)
);

-- Неудачные входы — простой лимит перебора
CREATE TABLE login_failures (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX login_failures_ip ON login_failures(ip, ts);
