import { lazy, StrictMode, Suspense, useCallback, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { DataProvider } from "./app/data";
import { Layout } from "./app/Layout";
import { Login } from "./features/auth/Login";
import { LearnPreview } from "./features/auth/Preview";
import { Home } from "./features/home/Home";
import { InterviewHome } from "./features/interview/InterviewHome";
import { TrackPage } from "./features/learn/TrackPage";
import { TracksPage } from "./features/learn/TracksPage";
import { ProblemsPage } from "./features/problems/ProblemsPage";
import { RoadmapPage, RoadmapsPage } from "./features/roadmap/Roadmap";
import { api, setUnauthorizedHandler } from "./lib/api";
import { PageSkeleton } from "./ui/Skeleton";
import "./styles.css";

// Тяжёлые страницы (CodeMirror, markdown, MDX) — отдельными чанками
const page = <T,>(load: () => Promise<T>, name: keyof T) => {
  const C = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<PageSkeleton />}>
      <C />
    </Suspense>
  );
};

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/roadmaps", element: <RoadmapsPage /> },
      { path: "/roadmaps/:profId", element: <RoadmapPage /> },
      { path: "/tracks", element: <TracksPage /> },
      { path: "/t/:trackId", element: <TrackPage /> },
      { path: "/l/*", element: page(() => import("./features/learn/LessonPage"), "LessonPage") },
      { path: "/problems", element: <ProblemsPage /> },
      { path: "/problems/:problemId", element: page(() => import("./features/problems/ProblemPage"), "ProblemPage") },
      { path: "/interview", element: <InterviewHome /> },
      { path: "/interview/:id", element: page(() => import("./features/interview/InterviewSession"), "InterviewSession") },
      { path: "/review", element: page(() => import("./features/review/ReviewPage"), "ReviewPage") },
      { path: "/practice", element: page(() => import("./features/practice/Practice"), "PracticeList") },
      { path: "/practice/:genId", element: page(() => import("./features/practice/Practice"), "PracticePage") },
      { path: "/settings", element: page(() => import("./features/settings/SettingsPage"), "SettingsPage") },
      { path: "/notes", element: page(() => import("./features/notes/NotesPage"), "NotesPage") },
      { path: "*", element: <Home /> },
    ],
  },
]);

// после загрузки — тихо подтянуть самые частые чанки, чтобы переходы были мгновенными
const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
idle(() => {
  void import("./features/learn/LessonPage");
  void import("./features/review/ReviewPage");
  void import("./features/practice/Practice");
});

function App() {
  const [me, setMe] = useState<{ user: string; ai: string } | null | undefined>(undefined);
  const check = useCallback(() => {
    api<{ user: string; ai: string }>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    check();
  }, [check]);

  if (me === undefined)
    return (
      <div className="min-h-dvh md:pl-[248px]">
        <div className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-line bg-surface/60 md:block" />
        <PageSkeleton />
      </div>
    );
  if (me === null)
    return <Login onDone={check} brand="TEMIRSLEARN" title="Подготовка ко всему" subtitle="Уроки, задачи, интервью — в одном месте." preview={<LearnPreview />} />;
  return (
    <DataProvider me={me}>
      <RouterProvider router={router} />
    </DataProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
