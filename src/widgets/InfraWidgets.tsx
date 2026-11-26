import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, StepControls, usePlayer } from "./kit";

// ══ Docker: кэш сборки и слои overlayfs ═════════════════════

interface DStep {
  cmd: string;
  dep: "base" | "deps" | "code";
  secs: number;
}
const GOOD_ORDER: DStep[] = [
  { cmd: "FROM python:3.13-slim", dep: "base", secs: 0 },
  { cmd: "WORKDIR /app", dep: "base", secs: 0.1 },
  { cmd: "COPY requirements.txt .", dep: "deps", secs: 0.1 },
  { cmd: "RUN pip install -r requirements.txt", dep: "deps", secs: 48 },
  { cmd: "COPY . .", dep: "code", secs: 0.4 },
  { cmd: 'CMD ["python", "app.py"]', dep: "code", secs: 0 },
];
const BAD_ORDER: DStep[] = [GOOD_ORDER[0], GOOD_ORDER[1], { cmd: "COPY . .", dep: "code", secs: 0.4 }, { cmd: "RUN pip install -r requirements.txt", dep: "deps", secs: 48 }, GOOD_ORDER[5]];

export function DockerBuild() {
  const [order, setOrder] = useState<"good" | "bad">("good");
  const good = order === "good";
  const [changed, setChanged] = useState<"none" | "code" | "deps">("none");
  const steps = good ? GOOD_ORDER : BAD_ORDER;
  // слой пересобирается, если изменился его вход или любой слой выше
  let broken = false;
  const rows = steps.map((s) => {
    const touches = (changed === "code" && s.cmd.startsWith("COPY . .")) || (changed === "deps" && (s.cmd.startsWith("COPY requirements") || s.cmd.startsWith("COPY . .")));
    if (changed !== "none" && touches) broken = true;
    return { ...s, cached: changed !== "none" && !broken, run: changed === "none" || broken };
  });
  const total = rows.reduce((a, r) => a + (r.run ? r.secs : 0), 0);
  return (
    <Frame title="Кэш сборки Docker" hint="слой пересобирается, если поменялся он или любой выше">
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented value={order} onChange={setOrder} block options={[{ value: "good", label: "Зависимости до кода" }, { value: "bad", label: "COPY . . в начале" }]} />
        <Segmented
          value={changed}
          onChange={setChanged}
          block
          options={[
            { value: "none", label: "Первая сборка" },
            { value: "code", label: "Изменил код" },
            { value: "deps", label: "Изменил зависимости" },
          ]}
        />
      </div>
      <div className="mt-4 grid gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className={cx("grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border px-3 py-2", r.run ? (r.secs > 10 ? "border-bad/40 bg-bad/[0.06]" : "border-amber/30") : "border-ok/30 bg-ok/[0.05]")}>
            <span className="truncate font-mono text-[12px] text-ink">{r.cmd}</span>
            <span className={cx("font-mono text-[11px]", r.run ? "text-amber" : "text-ok")}>{r.run ? `RUN ${r.secs}s` : "CACHED"}</span>
          </div>
        ))}
      </div>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="время сборки" value={`${total.toFixed(1)} с`} tone={total > 10 ? "bad" : "ok"} />
        <Metric label="из кэша слоёв" value={rows.filter((r) => !r.run).length} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {!good && changed === "code"
          ? "COPY . . стоит выше pip install: любое изменение кода ломает кэш всех следующих слоёв, и зависимости ставятся заново на каждую сборку."
          : good && changed === "code"
            ? "Изменился только код — пересобран последний слой за доли секунды. Зависимости из кэша."
            : "Порядок в Dockerfile — от редко меняющегося к часто меняющемуся."}
      </p>
    </Frame>
  );
}

interface Layer {
  name: string;
  files: Record<string, string>; // путь → содержимое или "⌀" (whiteout)
}
const LOWER: Layer[] = [
  { name: "python:3.13-slim", files: { "/bin/sh": "base", "/etc/app.conf": "debug=false", "/usr/lib/python3.13": "stdlib" } },
  { name: "pip install", files: { "/usr/lib/.../site-packages/flask": "flask 3" } },
  { name: "COPY . .", files: { "/app/app.py": "v1", "/app/README.md": "docs" } },
];

export function OverlayFs() {
  const [upper, setUpper] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const merged = useMemo(() => {
    const m: Record<string, { v: string; from: string }> = {};
    for (const l of LOWER) for (const [f, v] of Object.entries(l.files)) m[f] = { v, from: l.name };
    for (const [f, v] of Object.entries(upper)) {
      if (v === "⌀") delete m[f];
      else m[f] = { v, from: "контейнер (rw)" };
    }
    return m;
  }, [upper]);
  return (
    <Frame title="overlayfs: слои образа + слой контейнера" hint="нижние слои только для чтения">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Caption>Слои (сверху — последний)</Caption>
          <div className="grid gap-1.5">
            <div className="rounded-lg border border-accent/50 bg-accent/[0.06] px-3 py-2">
              <div className="font-mono text-[11px] text-accent">upperdir · контейнер (rw)</div>
              {Object.keys(upper).length === 0 ? (
                <div className="font-mono text-[11px] text-mute">пусто</div>
              ) : (
                Object.entries(upper).map(([f, v]) => (
                  <div key={f} className={cx("font-mono text-[11px]", v === "⌀" ? "text-rose" : "text-ink")}>
                    {v === "⌀" ? `whiteout ${f}` : `${f} = ${v}`}
                  </div>
                ))
              )}
            </div>
            {[...LOWER].reverse().map((l) => (
              <div key={l.name} className="rounded-lg border border-line bg-bg/40 px-3 py-2">
                <div className="font-mono text-[11px] text-blue">{l.name} (ro)</div>
                {Object.keys(l.files).map((f) => (
                  <div key={f} className="truncate font-mono text-[11px] text-dim">
                    {f}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div>
          <Caption>Что видит процесс в контейнере (merged)</Caption>
          <div className="grid gap-1 rounded-lg border border-line bg-bg/40 p-2">
            {Object.entries(merged).map(([f, { v, from }]) => (
              <div key={f} className="flex justify-between gap-2 font-mono text-[11px]">
                <span className="truncate text-ink">{f}</span>
                <span className={cx("shrink-0", from.startsWith("контейнер") ? "text-accent" : "text-mute")}>
                  {v} · {from.startsWith("контейнер") ? "rw" : from}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => { setUpper((u) => ({ ...u, "/etc/app.conf": "debug=true" })); setLog((x) => [...x, "запись в /etc/app.conf: copy-up — файл целиком копируется в верхний слой и меняется там. Нижний слой не тронут"]); }}>
              изменить app.conf
            </Button>
            <Button size="sm" onClick={() => { setUpper((u) => ({ ...u, "/app/README.md": "⌀" })); setLog((x) => [...x, "rm /app/README.md: в верхнем слое появляется whiteout-файл, скрывающий нижний. Образ НЕ стал меньше"]); }}>
              удалить README
            </Button>
            <Button size="sm" onClick={() => { setUpper((u) => ({ ...u, "/tmp/cache.db": "1 GB" })); setLog((x) => [...x, "новый файл — сразу в верхний слой. Исчезнет вместе с контейнером, если не volume"]); }}>
              создать файл
            </Button>
            <Button size="sm" onClick={() => { setUpper({}); setLog((x) => [...x, "docker rm + run: новый пустой верхний слой. Все изменения контейнера пропали — образ неизменен"]); }}>
              пересоздать
            </Button>
          </div>
        </div>
      </div>
      <Log className="mt-3" lines={log} max={3} empty="Нижние слои общие для всех контейнеров из этого образа — на диске они хранятся один раз." />
    </Frame>
  );
}

// ══ Kubernetes: цикл согласования ═══════════════════════════

interface Pod {
  id: number;
  node: number | null;
  phase: "Pending" | "ContainerCreating" | "Running" | "Terminating";
}
interface K {
  desired: number;
  pods: Pod[];
  nodesUp: boolean[];
  next: number;
  log: string[];
}
const NODE_CPU = 3;
const k0 = (): K => ({ desired: 4, pods: [1, 2, 3, 4].map((id, i) => ({ id, node: i % 3, phase: "Running" })), nodesUp: [true, true, true], next: 5, log: [] });

function reconcile(k0_: K): K {
  const k: K = structuredClone(k0_);
  const msgs: string[] = [];
  // kubelet: доводим поды до Running, убираем Terminating
  const before = k.pods.length;
  k.pods = k.pods.filter((p) => p.phase !== "Terminating");
  if (k.pods.length < before) msgs.push(`kubelet: остановлено ${before - k.pods.length} под(а)`);
  for (const p of k.pods)
    if (p.phase === "ContainerCreating") {
      p.phase = "Running";
      msgs.push(`kubelet node-${p.node}: pod-${p.id} Running (readiness прошла)`);
    }
  // планировщик: Pending → на узел со свободным CPU
  for (const p of k.pods)
    if (p.phase === "Pending") {
      const load = (n: number) => k.pods.filter((x) => x.node === n).length;
      const cand = [0, 1, 2].filter((n) => k.nodesUp[n] && load(n) < NODE_CPU).sort((a, b) => load(a) - load(b));
      if (cand.length) {
        p.node = cand[0];
        p.phase = "ContainerCreating";
        msgs.push(`scheduler: pod-${p.id} → node-${cand[0]} (меньше всего занят)`);
      } else msgs.push(`scheduler: pod-${p.id} остаётся Pending — нет узла с 1 свободным CPU`);
    }
  // ReplicaSet-контроллер: desired vs actual
  const alive = k.pods.filter((p) => p.phase !== "Terminating");
  if (alive.length < k.desired) {
    for (let i = alive.length; i < k.desired; i++) k.pods.push({ id: k.next++, node: null, phase: "Pending" });
    msgs.push(`ReplicaSet: хочу ${k.desired}, есть ${alive.length} → создаю ${k.desired - alive.length}`);
  } else if (alive.length > k.desired) {
    alive.slice(k.desired).forEach((p) => (p.phase = "Terminating"));
    msgs.push(`ReplicaSet: хочу ${k.desired}, есть ${alive.length} → удаляю ${alive.length - k.desired}`);
  }
  if (!msgs.length) msgs.push("всё совпадает с желаемым — контроллеры ничего не делают");
  k.log.push(...msgs);
  return k;
}

export function K8sReconcile() {
  const [k, setK] = useState(k0);
  const player = usePlayer(() => {
    setK(reconcile(k));
    return true;
  }, 1200);
  const running = k.pods.filter((p) => p.phase === "Running").length;
  return (
    <Frame
      title="Kubernetes: желаемое против фактического"
      hint="каждый шаг — один проход контроллеров"
      controls={
        <div className="grid gap-3">
          <Slider label="replicas в Deployment" value={k.desired} min={0} max={10} onChange={(v) => setK({ ...k, desired: v, log: [...k.log, `kubectl scale --replicas=${v}: в etcd записано новое желаемое состояние. Больше ничего не произошло`] })} />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="primary" onClick={() => setK(reconcile(k))}>
              Цикл контроллеров
            </Button>
            <Button onClick={player.toggle}>{player.playing ? "Пауза" : "Авто"}</Button>
            <Button
              onClick={() => {
                const p = k.pods.find((x) => x.phase === "Running");
                if (!p) return;
                setK({ ...k, pods: k.pods.filter((x) => x.id !== p.id), log: [...k.log, `💥 pod-${p.id} упал (OOMKilled)`] });
              }}
            >
              Убить под
            </Button>
            <Button
              onClick={() => {
                const n = k.nodesUp.findIndex((x) => x);
                if (n < 0) return;
                const up = [...k.nodesUp];
                up[n] = false;
                const lost = k.pods.filter((p) => p.node === n).length;
                setK({ ...k, nodesUp: up, pods: k.pods.filter((p) => p.node !== n), log: [...k.log, `💥 node-${n} пропал: ${lost} под(ов) потеряно (в реальности — через ~5 мин NotReady и eviction)`] });
              }}
            >
              Уронить узел
            </Button>
            <Button onClick={() => { player.stop(); setK(k0()); }} className="col-span-2 sm:col-span-1">
              Сначала
            </Button>
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="желаемо" value={k.desired} />
        <Metric label="Running" value={running} tone={running === k.desired ? "ok" : "amber"} />
        <Metric label="Pending" value={k.pods.filter((p) => p.phase === "Pending").length} tone={k.pods.some((p) => p.phase === "Pending") ? "bad" : undefined} />
        <Metric label="узлов живо" value={k.nodesUp.filter(Boolean).length} />
      </Metrics>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((n) => (
          <div key={n} className={cx("rounded-xl border p-2.5", k.nodesUp[n] ? "border-line bg-bg/40" : "border-bad/40 bg-bad/[0.05] opacity-60")}>
            <div className="mb-2 flex justify-between font-mono text-[11px]">
              <span className="text-ink">node-{n}</span>
              <span className="text-mute">{k.nodesUp[n] ? `${k.pods.filter((p) => p.node === n).length}/${NODE_CPU} CPU` : "NotReady"}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: NODE_CPU }, (_, s) => {
                const p = k.pods.filter((x) => x.node === n)[s];
                return (
                  <div
                    key={s}
                    className="flex h-10 flex-col items-center justify-center rounded-md font-mono text-[10px]"
                    style={{
                      background: !p ? "transparent" : p.phase === "Running" ? "color-mix(in oklab, var(--color-ok) 22%, transparent)" : p.phase === "Terminating" ? "color-mix(in oklab, var(--color-rose) 22%, transparent)" : "color-mix(in oklab, var(--color-amber) 22%, transparent)",
                      border: p ? "none" : "1px dashed var(--color-line)",
                    }}
                  >
                    {p && (
                      <>
                        <span className="text-ink">pod-{p.id}</span>
                        <span className="text-[8.5px] text-dim">{p.phase === "ContainerCreating" ? "Creating" : p.phase}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {k.pods.some((p) => p.phase === "Pending") && (
        <div className="mt-2 flex flex-wrap gap-1">
          {k.pods.filter((p) => p.phase === "Pending").map((p) => (
            <span key={p.id} className="rounded-md bg-amber/15 px-2 py-1 font-mono text-[11px] text-amber">pod-{p.id} Pending</span>
          ))}
        </div>
      )}
      <Legend className="mt-3" items={[{ color: C.ok, label: "Running" }, { color: C.amber, label: "Pending / Creating" }, { color: C.rose, label: "Terminating" }]} />
      <Log className="mt-3" lines={k.log} max={4} empty="Убей под или узел, поменяй replicas — и крути цикл контроллеров." />
    </Frame>
  );
}

// ══ DNS: путь запроса ═══════════════════════════════════════

interface DnsHop {
  who: string;
  ask: string;
  answer: string;
  rtt: number;
  cacheable?: boolean;
}
const DNS_HOPS: DnsHop[] = [
  { who: "Браузер", ask: "кэш браузера", answer: "нет", rtt: 0 },
  { who: "ОС (stub resolver)", ask: "/etc/hosts, кэш systemd-resolved", answer: "нет → спросить резолвер из настроек сети", rtt: 0 },
  { who: "Рекурсивный резолвер 1.1.1.1", ask: "есть в кэше temirslearn.verylabs.dev?", answer: "нет — пойду сам", rtt: 12, cacheable: true },
  { who: "Корневой сервер (.)", ask: "кто отвечает за .dev?", answer: "NS: ns-tld1.charlestonroadregistry.com …", rtt: 20, cacheable: true },
  { who: "TLD-сервер .dev", ask: "кто отвечает за verylabs.dev?", answer: "NS: *.ns.cloudflare.com", rtt: 30, cacheable: true },
  { who: "Авторитативный (Cloudflare)", ask: "A temirslearn.verylabs.dev?", answer: "A 104.21.x.x, TTL 300", rtt: 8 },
];

export function DnsPath() {
  const [warm, setWarm] = useState(false);
  const [i, setI] = useState(-1);
  const hops = warm ? DNS_HOPS.slice(0, 3).map((h, k) => (k === 2 ? { ...h, answer: "есть в кэше: A 104.21.x.x, осталось 212 с TTL" } : h)) : DNS_HOPS;
  const total = hops.slice(0, i + 1).reduce((a, h) => a + h.rtt * 2, 0);
  return (
    <Frame
      title="Как резолвится temirslearn.verylabs.dev"
      hint="RTT — туда и обратно"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Toggle checked={warm} onChange={(v) => { setWarm(v); setI(-1); }} label="Кэш резолвера уже тёплый" />
          <StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i >= 0} canStep={i < hops.length - 1} onReset={() => setI(-1)} />
        </div>
      }
    >
      <div className="grid gap-1.5">
        {hops.map((h, k) => (
          <div key={k} className={cx("grid grid-cols-[1fr_auto] gap-2 rounded-xl border px-3 py-2 transition", k <= i ? (k === i ? "border-accent/60 bg-accent/[0.06]" : "border-line") : "border-dashed border-line opacity-40")}>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">{h.who}</div>
              <div className="font-mono text-[11.5px] text-mute">? {h.ask}</div>
              {k <= i && <div className="font-mono text-[11.5px] text-accent">→ {h.answer}</div>}
            </div>
            <span className="self-center font-mono text-[11px] text-dim">{h.rtt ? `${h.rtt * 2} мс` : "~0"}</span>
          </div>
        ))}
      </div>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="время резолва" value={`${total} мс`} tone={total > 60 ? "amber" : "ok"} />
        <Metric label="запросов по сети" value={hops.slice(0, i + 1).filter((h) => h.rtt).length} />
      </Metrics>
    </Frame>
  );
}

// ══ TLS: рукопожатия ═════════════════════════════════════════

type TlsV = "12" | "13" | "0rtt";
const FLOWS: Record<TlsV, { dir: "→" | "←"; msg: string; rtt: number; color: string }[]> = {
  "12": [
    { dir: "→", msg: "TCP SYN", rtt: 0, color: C.mute },
    { dir: "←", msg: "TCP SYN-ACK", rtt: 0, color: C.mute },
    { dir: "→", msg: "ACK + ClientHello", rtt: 1, color: C.blue },
    { dir: "←", msg: "ServerHello, Certificate, ServerKeyExchange, Done", rtt: 1, color: C.blue },
    { dir: "→", msg: "ClientKeyExchange, ChangeCipherSpec, Finished", rtt: 2, color: C.violet },
    { dir: "←", msg: "ChangeCipherSpec, Finished", rtt: 2, color: C.violet },
    { dir: "→", msg: "GET / (зашифровано)", rtt: 3, color: C.accent },
    { dir: "←", msg: "200 OK", rtt: 3, color: C.accent },
  ],
  "13": [
    { dir: "→", msg: "TCP SYN", rtt: 0, color: C.mute },
    { dir: "←", msg: "TCP SYN-ACK", rtt: 0, color: C.mute },
    { dir: "→", msg: "ACK + ClientHello + key_share (угаданный ECDHE)", rtt: 1, color: C.blue },
    { dir: "←", msg: "ServerHello + key_share, {Certificate, Verify, Finished}", rtt: 1, color: C.blue },
    { dir: "→", msg: "{Finished} + GET /", rtt: 2, color: C.accent },
    { dir: "←", msg: "200 OK", rtt: 2, color: C.accent },
  ],
  "0rtt": [
    { dir: "→", msg: "TCP SYN", rtt: 0, color: C.mute },
    { dir: "←", msg: "TCP SYN-ACK", rtt: 0, color: C.mute },
    { dir: "→", msg: "ClientHello + PSK + early_data: GET /", rtt: 1, color: C.amber },
    { dir: "←", msg: "ServerHello … Finished + 200 OK", rtt: 1, color: C.accent },
  ],
};

export function TlsHandshake() {
  const [v, setV] = useState<TlsV>("13");
  const [rtt, setRtt] = useState(80);
  const flow = FLOWS[v];
  const rtts = flow[flow.length - 1].rtt + 1;
  return (
    <Frame title="Рукопожатие до первого байта ответа" hint="поверх TCP">
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented value={v} onChange={setV} block options={[{ value: "12", label: "TLS 1.2" }, { value: "13", label: "TLS 1.3" }, { value: "0rtt", label: "1.3 · 0-RTT" }]} />
        <Slider label="RTT до сервера" value={rtt} min={5} max={250} step={5} onChange={setRtt} display={`${rtt} мс`} />
      </div>
      <div className="mt-4 grid grid-cols-[64px_1fr_64px] gap-x-2">
        <div className="text-center font-mono text-[11px] text-dim">клиент</div>
        <div />
        <div className="text-center font-mono text-[11px] text-dim">сервер</div>
        {flow.map((m, k) => (
          <div key={k} className="contents">
            <div className="border-r border-line-strong" />
            <div className="py-1">
              <div className={cx("flex items-center gap-1.5 font-mono text-[11.5px]", m.dir === "←" && "flex-row-reverse text-right")}>
                <span className="h-px flex-1" style={{ background: m.color }} />
                <span style={{ color: m.color }}>{m.dir === "→" ? "▶" : "◀"}</span>
              </div>
              <div className={cx("font-mono text-[11px] leading-tight text-ink", m.dir === "←" ? "text-right" : "")}>{m.msg}</div>
            </div>
            <div className="border-l border-line-strong" />
          </div>
        ))}
      </div>
      <Metrics className="mt-4">
        <Metric label="round trip'ов" value={rtts} tone={rtts <= 2 ? "ok" : "amber"} />
        <Metric label="до первого байта" value={`${rtts * rtt} мс`} tone="accent" />
        <Metric label="из них TCP" value={`${rtt} мс`} />
        <Metric label="TLS" value={`${(rtts - 2) * rtt} мс`} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {v === "12"
          ? "TLS 1.2: два round trip'а на рукопожатие — сначала договориться об алгоритмах, потом обменяться ключами."
          : v === "13"
            ? "TLS 1.3: клиент сразу угадывает группу ECDHE и шлёт свою часть ключа в ClientHello. Один round trip, и всё после ServerHello уже зашифровано (включая сертификат)."
            : "0-RTT: при повторном подключении клиент шифрует первый запрос ключом из прошлой сессии и шлёт его вместе с ClientHello. Цена — запрос можно перехватить и повторить (replay), поэтому 0-RTT разрешают только для идемпотентных GET."}
      </p>
    </Frame>
  );
}

// ══ HTTP/2 vs HTTP/3: head-of-line blocking ═════════════════

export function HolBlocking() {
  const [proto, setProto] = useState<"h2" | "h3">("h2");
  const [loss, setLoss] = useState(true);
  // 12 пакетов трёх потоков по кругу; пакет 2 (поток A) теряется и приходит повторно через RTT
  const pkts = Array.from({ length: 12 }, (_, i) => ({ i, stream: "ABC"[i % 3], sent: i * 10 }));
  const lost = loss ? 3 : -1;
  const RETX = 160;
  const deliver = pkts.map((p) => {
    if (p.i === lost) return { ...p, at: RETX + 10 };
    if (lost < 0 || p.i < lost) return { ...p, at: p.sent + 40 };
    if (proto === "h2") return { ...p, at: Math.max(p.sent + 40, RETX + 10), blocked: true };
    // QUIC: ждут только пакеты того же потока после потери
    return p.stream === pkts[lost].stream ? { ...p, at: Math.max(p.sent + 40, RETX + 10), blocked: true } : { ...p, at: p.sent + 40 };
  });
  const W = 560;
  const max = 220;
  const streamColor: Record<string, string> = { A: C.blue, B: C.accent, C: C.amber };
  const doneAt = (s: string) => Math.max(...deliver.filter((d) => d.stream === s).map((d) => d.at));
  return (
    <Frame title="Head-of-line blocking" hint="3 потока в одном соединении">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <Segmented value={proto} onChange={setProto} block options={[{ value: "h2", label: "HTTP/2 поверх TCP" }, { value: "h3", label: "HTTP/3 поверх QUIC" }]} />
        <Toggle checked={loss} onChange={setLoss} label="Потерять один пакет" />
      </div>
      <svg viewBox={`-74 -4 ${W + 84} 150`} className="mt-4 block w-full">
        {["A", "B", "C"].map((s, r) => (
          <g key={s}>
            <text x={-8} y={30 + r * 40} textAnchor="end" fontSize={11} fill={streamColor[s]} fontFamily="var(--font-mono)">
              поток {s}
            </text>
            <line x1={0} x2={W} y1={26 + r * 40} y2={26 + r * 40} stroke={C.line} />
            {deliver
              .filter((d) => d.stream === s)
              .map((d) => (
                <g key={d.i}>
                  <rect x={(d.sent / max) * W} y={14 + r * 40} width={10} height={10} rx={2} fill={streamColor[s]} opacity={0.35} />
                  <rect x={(d.at / max) * W} y={14 + r * 40} width={10} height={10} rx={2} fill={d.i === lost ? C.bad : streamColor[s]} />
                  {(d as { blocked?: boolean }).blocked && <line x1={(d.sent / max) * W + 10 + 30} x2={(d.at / max) * W} y1={19 + r * 40} y2={19 + r * 40} stroke={C.bad} strokeDasharray="2 3" />}
                </g>
              ))}
          </g>
        ))}
        <text x={W} y={146} textAnchor="end" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
          время → (бледные — отправка, яркие — доставка приложению)
        </text>
      </svg>
      <Metrics className="mt-2 sm:grid-cols-3">
        {["A", "B", "C"].map((s) => (
          <Metric key={s} label={`поток ${s} готов`} value={`${doneAt(s)} мс`} tone={doneAt(s) > 150 ? "bad" : "ok"} />
        ))}
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {!loss
          ? "Без потерь оба протокола одинаковы: потоки мультиплексируются в одном соединении."
          : proto === "h2"
            ? "TCP отдаёт приложению байты строго по порядку. Пока потерянный пакет потока A не пришёл повторно, данные B и C лежат в буфере ядра — хотя они уже доставлены. Один потерянный пакет тормозит все потоки."
            : "QUIC сам нумерует пакеты каждого потока и работает поверх UDP. Ждут только данные потока A, а B и C отдаются приложению сразу."}
      </p>
    </Frame>
  );
}
