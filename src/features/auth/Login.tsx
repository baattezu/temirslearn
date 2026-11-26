import { ArrowRight } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../lib/api";
import { Button } from "../../ui/Button";
import { Input, Label } from "../../ui/Field";
import { ErrorNote } from "../../ui/misc";

/**
 * Вход поверх размытого превью интерфейса. Превью — статичная демо-разметка без настоящих данных:
 * до входа API ничего не отдаёт.
 */
export function Login({
  onDone,
  brand,
  title,
  subtitle,
  preview,
}: {
  onDone: () => void;
  brand: string;
  title: string;
  subtitle: string;
  preview: ReactNode;
}) {
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
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 origin-top scale-[1.03] select-none opacity-95 blur-[3px]">
        {preview}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-bg/5 via-bg/30 to-bg/85 md:bg-none md:bg-bg/35" />

      <div className="relative flex min-h-dvh flex-col justify-end md:items-center md:justify-center md:p-6">
        <form
          onSubmit={submit}
          className="anim-pop w-full rounded-t-3xl border-t border-line bg-surface/95 px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-6 shadow-2xl backdrop-blur-xl md:max-w-[400px] md:rounded-3xl md:border md:p-8"
        >
          <div className="mb-6">
            <div className="font-mono text-[12px] tracking-[0.2em] text-accent">{brand}</div>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
            <p className="mt-1 text-[14.5px] text-mute">{subtitle}</p>
          </div>
          <div className="grid gap-4">
            <label>
              <Label>Логин</Label>
              <Input autoComplete="username" autoCapitalize="none" value={user} onChange={(e) => setUser(e.target.value)} />
            </label>
            <label>
              <Label>Пароль</Label>
              <Input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </label>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="primary" size="lg" type="submit" loading={busy} disabled={!user || !pass} block className="mt-1">
              Войти <ArrowRight className="size-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
