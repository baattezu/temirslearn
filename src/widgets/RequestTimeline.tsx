import { useMemo, useState } from "react";
import { fmtMs } from "../lib/format";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";

type Proto = "h1" | "h2" | "h3";

interface Step {
  key: string;
  label: string;
  who: string;
  ms: number;
  color: string;
  detail: string;
  msgs: { from: "c" | "r" | "s"; to: "c" | "r" | "s"; text: string }[];
}

/** URL → первый байт: считает round-trip'ы для DNS, TCP, TLS и HTTP. */
export function RequestTimeline() {
  const [rtt, setRtt] = useState(80);
  const [dnsRtt, setDnsRtt] = useState(15);
  const [server, setServer] = useState(40);
  const [proto, setProto] = useState<Proto>("h2");
  const [tls13, setTls13] = useState(true);
  const [dnsCached, setDnsCached] = useState(false);
  const [reuse, setReuse] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const steps = useMemo<Step[]>(() => {
    const s: Step[] = [];
    if (!dnsCached && !reuse)
      s.push({
        key: "dns",
        label: "DNS",
        who: "резолвер",
        ms: dnsRtt,
        color: "var(--color-violet)",
        detail:
          "Браузер спрашивает рекурсивный резолвер (провайдер, 1.1.1.1), какой IP у домена. Если ответ есть в кэше резолвера — это один короткий round-trip до него. Если нет — резолвер сам обходит root → .dev → авторитетный сервер.",
        msgs: [
          { from: "c", to: "r", text: "A? verylabs.dev" },
          { from: "r", to: "c", text: "104.21.x.x, TTL 300" },
        ],
      });
    if (!reuse) {
      if (proto === "h3") {
        s.push({
          key: "quic",
          label: "QUIC + TLS 1.3",
          who: "сервер",
          ms: rtt,
          color: "var(--color-teal)",
          detail:
            "HTTP/3 едет поверх QUIC (UDP). QUIC объединяет транспортное и TLS-рукопожатие в одно: через 1 RTT соединение и зашифровано, и готово. Отдельного TCP-рукопожатия нет.",
          msgs: [
            { from: "c", to: "s", text: "Initial: ClientHello + key share" },
            { from: "s", to: "c", text: "ServerHello, cert, Finished" },
          ],
        });
      } else {
        s.push({
          key: "tcp",
          label: "TCP",
          who: "сервер",
          ms: rtt,
          color: "var(--color-blue)",
          detail:
            "Трёхстороннее рукопожатие SYN → SYN-ACK → ACK. Стоит один RTT: последний ACK клиент отправляет вместе с первыми данными (ClientHello), поэтому третий шаг «бесплатный».",
          msgs: [
            { from: "c", to: "s", text: "SYN" },
            { from: "s", to: "c", text: "SYN-ACK" },
          ],
        });
        s.push({
          key: "tls",
          label: tls13 ? "TLS 1.3" : "TLS 1.2",
          who: "сервер",
          ms: tls13 ? rtt : rtt * 2,
          color: "var(--color-amber)",
          detail: tls13
            ? "TLS 1.3: клиент сразу шлёт key share в ClientHello, сервер отвечает своим и сертификатом — ключи готовы через 1 RTT."
            : "TLS 1.2: сначала договариваются о параметрах (ClientHello/ServerHello + сертификат), потом обмениваются ключами — 2 RTT до первого зашифрованного запроса.",
          msgs: tls13
            ? [
                { from: "c", to: "s", text: "ClientHello + key share" },
                { from: "s", to: "c", text: "ServerHello, cert, Finished" },
              ]
            : [
                { from: "c", to: "s", text: "ClientHello" },
                { from: "s", to: "c", text: "ServerHello, cert, Done" },
                { from: "c", to: "s", text: "KeyExchange, Finished" },
                { from: "s", to: "c", text: "Finished" },
              ],
        });
      }
    }
    s.push({
      key: "http",
      label: "HTTP запрос",
      who: "сервер",
      ms: rtt + server,
      color: "var(--color-accent)",
      detail: `Запрос уходит, сервер думает ${server} мс (запрос в БД, рендер), ответ возвращается. Даже идеальный бэкенд не быстрее одного RTT — это физика: свет в оптоволокне ≈ 200 км за мс.`,
      msgs: [
        { from: "c", to: "s", text: "GET / HTTP/" + (proto === "h1" ? "1.1" : proto === "h2" ? "2" : "3") },
        { from: "s", to: "c", text: "200 OK + первые байты HTML" },
      ],
    });
    return s;
  }, [rtt, dnsRtt, server, proto, tls13, dnsCached, reuse]);

  const total = steps.reduce((a, s) => a + s.ms, 0);
  const rtts = steps.reduce((a, s) => a + (s.key === "dns" ? 0 : s.key === "http" ? 1 : s.ms / rtt), 0);
  const current = steps.find((s) => s.key === active) ?? steps[0];
  const lane = { c: 0, r: 1, s: 2 } as const;

  return (
    <Frame
      title="URL → первый байт"
      hint="нажми на этап"
      controls={
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div className="grid gap-4">
            <Slider label="RTT до сервера" value={rtt} min={5} max={300} onChange={setRtt} display={`${rtt} мс`} />
            <Slider label="RTT до DNS-резолвера" value={dnsRtt} min={1} max={80} onChange={setDnsRtt} display={`${dnsRtt} мс`} />
            <Slider label="Время сервера" value={server} min={0} max={500} step={5} onChange={setServer} display={`${server} мс`} />
          </div>
          <div className="grid content-start gap-3">
            <Segmented
              value={proto}
              onChange={setProto}
              block
              options={[
                { value: "h1", label: "HTTP/1.1" },
                { value: "h2", label: "HTTP/2" },
                { value: "h3", label: "HTTP/3" },
              ]}
            />
            <div className={cx(proto === "h3" && "pointer-events-none opacity-40")}>
              <Toggle checked={tls13 || proto === "h3"} onChange={setTls13} label="TLS 1.3 (иначе 1.2)" />
            </div>
            <Toggle checked={dnsCached} onChange={setDnsCached} label="IP уже в кэше браузера" />
            <Toggle checked={reuse} onChange={setReuse} label="Соединение уже открыто (keep-alive)" />
          </div>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <div>
          <span className="font-mono text-3xl font-semibold tabular-nums text-ink">{fmtMs(total)}</span>
          <span className="ml-2 text-sm text-mute">до первого байта</span>
        </div>
        <div className="text-sm text-mute">
          ≈ <span className="font-mono text-ink">{Number.isInteger(rtts) ? rtts : rtts.toFixed(0)}</span> RTT до сервера
          {!dnsCached && !reuse && " + DNS"}
        </div>
      </div>

      {/* Полоса времени */}
      <div className="flex h-11 w-full overflow-hidden rounded-xl border border-line">
        {steps.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActive(s.key)}
            style={{ width: `${(s.ms / total) * 100}%`, background: `color-mix(in oklab, ${s.color} ${current.key === s.key ? 38 : 18}%, transparent)` }}
            className="relative min-w-[3px] border-r border-bg text-left transition-[width] duration-300 last:border-r-0"
          >
            <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 truncate text-[12px] font-medium" style={{ color: s.color }}>
              {s.label}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-mute">
        <span>0</span>
        <span>{fmtMs(total)}</span>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.1fr]">
        {/* Диаграмма последовательности */}
        <div className="rounded-xl border border-line bg-bg/50 p-3">
          <div className="mb-2 grid grid-cols-3 text-center font-mono text-[11px] uppercase tracking-wider text-mute">
            <span>браузер</span>
            <span>DNS</span>
            <span>сервер</span>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="mx-auto w-px bg-line" />
              ))}
            </div>
            <div className="relative grid gap-1.5 py-1">
              {current.msgs.map((m, i) => {
                const a = lane[m.from];
                const b = lane[m.to];
                const left = (Math.min(a, b) * 2 + 1) / 6;
                const width = (Math.abs(a - b) * 2) / 6;
                const rightward = b > a;
                return (
                  <div key={`${current.key}-${i}`} className="anim-fade relative h-9" style={{ animationDelay: `${i * 90}ms` }}>
                    <div className="absolute top-1/2 h-px" style={{ left: `${left * 100}%`, width: `${width * 100}%`, background: current.color }}>
                      <span
                        className="absolute top-1/2 size-0 -translate-y-1/2 border-y-[4px] border-y-transparent"
                        style={
                          rightward
                            ? { right: -1, borderLeft: `6px solid ${current.color}` }
                            : { left: -1, borderRight: `6px solid ${current.color}` }
                        }
                      />
                    </div>
                    <div
                      className="absolute -top-0.5 truncate px-1 text-center font-mono text-[10.5px] text-dim"
                      style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: current.color }} />
            <span className="font-medium text-ink">{current.label}</span>
            <span className="ml-auto font-mono text-sm text-dim">{fmtMs(current.ms)}</span>
          </div>
          <p className="text-[14.5px] leading-relaxed text-dim">{current.detail}</p>
        </div>
      </div>
    </Frame>
  );
}
