import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { Button } from "../../ui/Button";
import { Input, Label } from "../../ui/Field";
import { ErrorNote } from "../../ui/misc";

export function Login({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", json: { user, pass } });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-end px-5 pb-[max(24px,env(safe-area-inset-bottom))] md:items-center md:justify-center md:p-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-accent)_9%,transparent),transparent)]" />
      <form onSubmit={submit} className="relative w-full md:max-w-[380px]">
        <div className="mb-8 md:mb-10 md:text-center">
          <div className="font-mono text-[13px] tracking-[0.2em] text-accent">TEMIRSLEARN</div>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-ink">Подготовка ко всему</h1>
          <p className="mt-1.5 text-[15px] text-mute">Уроки, задачи, интервью — в одном месте.</p>
        </div>
        <div className="grid gap-4">
          <label>
            <Label>Логин</Label>
            <Input autoComplete="username" autoCapitalize="none" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
          </label>
          <label>
            <Label>Пароль</Label>
            <Input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button variant="primary" size="lg" type="submit" loading={busy} disabled={!user || !pass} block className="mt-2">
            Войти <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
