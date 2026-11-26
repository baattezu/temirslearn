import { lazy, StrictMode, Suspense, useCallback, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { DataProvider } from "./app/data";
import { Layout } from "./app/Layout";
import { Login } from "./features/auth/Login";
import { Home } from "./features/home/Home";
import { InterviewHome } from "./features/interview/InterviewHome";
import { TrackPage } from "./features/learn/TrackPage";
import { TracksPage } from "./features/learn/TracksPage";
import { ProblemsPage } from "./features/problems/ProblemsPage";
import { api, setUnauthorizedHandler } from "./lib/api";
import { Spinner } from "./ui/misc";
import "./styles.css";

// Тяжёлые страницы (CodeMirror, markdown, MDX) — отдельными чанками
const page = <T,>(load: () => Promise<T>, name: keyof T) => {
  const C = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60dvh] items-center justify-center text-mute">
          <Spinner />
        </div>
      }
    >
      <C />
    </Suspense>
  );
};

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/tracks", element: <TracksPage /> },
      { path: "/t/:trackId", element: <TrackPage /> },
      { path: "/l/*", element: page(() => import("./features/learn/LessonPage"), "LessonPage") },
      { path: "/problems", element: <ProblemsPage /> },
      { path: "/problems/:problemId", element: page(() => import("./features/problems/ProblemPage"), "ProblemPage") },
      { path: "/interview", element: <InterviewHome /> },
      { path: "/interview/:id", element: page(() => import("./features/interview/InterviewSession"), "InterviewSession") },
      { path: "/notes", element: page(() => import("./features/notes/NotesPage"), "NotesPage") },
      { path: "*", element: <Home /> },
    ],
  },
]);

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
      <div className="flex min-h-dvh items-center justify-center text-mute">
        <Spinner />
      </div>
    );
  if (me === null) return <Login onDone={check} />;
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
