import { useCallback, useEffect, useRef, useState } from "react";
import { Blocks, Check, MessagesSquare, Palette, Settings2 } from "lucide-react";
import { api } from "./api";
import { ChatModule } from "./chat/ChatModule";
import { OrgsPage } from "./admin/OrgsPage";
import { McpModule } from "./mcp/McpModule";
import { THEMES, tokens, useTheme } from "./themes";
import type { OrgsResponse } from "../../shared/types";

type Module = "chat" | "mcp" | "admin";
const fromHash = (): Module => (location.hash === "#admin" ? "admin" : location.hash === "#mcp" ? "mcp" : "chat");

export function App() {
  const [module, setModule] = useState<Module>(fromHash);
  const [orgs, setOrgs] = useState<OrgsResponse>({ orgs: [], activeOrgId: null });

  const reloadOrgs = useCallback(() => api.orgs().then(setOrgs), []);
  useEffect(() => {
    reloadOrgs();
  }, [reloadOrgs]);
  useEffect(() => {
    location.hash = module;
  }, [module]);
  useEffect(() => {
    const onHash = () => setModule(fromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const switchOrg = async (id: string) => {
    await api.activateOrg(id);
    await reloadOrgs();
  };

  return (
    <div className="flex h-full bg-ground text-ink">
      <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-4">
        <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-action text-xs font-bold text-action-ink ring-1 ring-inset ring-rail-ink/40" title="AFD360 Utilities">
          AF
        </div>
        <RailButton label="Chat" active={module === "chat"} onClick={() => setModule("chat")}>
          <MessagesSquare size={20} strokeWidth={1.7} />
        </RailButton>
        <RailButton label="MCP" active={module === "mcp"} onClick={() => setModule("mcp")}>
          <Blocks size={20} strokeWidth={1.7} />
        </RailButton>
        <RailButton label="Admin" active={module === "admin"} onClick={() => setModule("admin")}>
          <Settings2 size={20} strokeWidth={1.7} />
        </RailButton>
        <div className="mt-auto">
          <ThemePicker />
        </div>
      </nav>
      <main className="min-w-0 flex-1">
        {module === "chat" ? (
          <ChatModule orgs={orgs} onSwitchOrg={switchOrg} onOpenAdmin={() => setModule("admin")} />
        ) : module === "mcp" ? (
          <McpModule orgs={orgs} onOpenAdmin={() => setModule("admin")} />
        ) : (
          <OrgsPage orgs={orgs} onChange={reloadOrgs} />
        )}
      </main>
    </div>
  );
}

function RailButton(props: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      aria-current={props.active ? "page" : undefined}
      className={`grid w-[52px] place-items-center gap-1 rounded-xl pb-[7px] pt-[9px] text-xs font-medium transition-colors ${
        props.active ? "bg-rail-on text-rail-on-ink" : "text-rail-ink hover:bg-rail-on/60 hover:text-rail-on-ink"
      }`}
    >
      {props.children}
      {props.label}
    </button>
  );
}

// Theme switcher at the foot of the rail; each row previews the theme's sidebar, cards and action color.
function ThemePicker() {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("mousedown", onDown);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("mousedown", onDown);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <RailButton label="Theme" active={open} onClick={() => setOpen(!open)}>
        <Palette size={20} strokeWidth={1.7} />
      </RailButton>
      {open && (
        <div
          role="listbox"
          aria-label="Theme"
          className="absolute bottom-0 left-[60px] z-30 max-h-[min(80vh,640px)] w-72 overflow-y-auto rounded-2xl border border-line bg-surface p-2 text-ink shadow-lift"
        >
          {(["Finance", "Color"] as const).map((group) => (
            <div key={group} className="py-1">
              <div className="px-2 pb-1 pt-1.5 text-xs font-semibold text-ink-3">{group}</div>
              {THEMES.filter((t) => t.group === group).map((t) => {
                const k = tokens(t);
                const on = t.id === theme;
                return (
                  <button
                    key={t.id}
                    role="option"
                    aria-selected={on}
                    onClick={() => setTheme(t.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm ${on ? "bg-tint font-semibold" : "hover:bg-tint"}`}
                  >
                    <span className="flex h-7 w-11 shrink-0 overflow-hidden rounded-md border border-line" aria-hidden>
                      <span className="w-3.5" style={{ background: k.side }} />
                      <span className="flex flex-1 flex-col justify-center gap-0.5 px-1" style={{ background: k.ground }}>
                        <span className="h-1.5 rounded-sm" style={{ background: k["sent-line"] }} />
                        <span className="h-1.5 rounded-sm" style={{ background: k["recv-line"] }} />
                      </span>
                      <span className="w-2" style={{ background: k.action }} />
                    </span>
                    <span className="min-w-0 flex-1">{t.label}</span>
                    {t.dark && <span className="text-xs text-ink-3">dark</span>}
                    {on && <Check size={15} className="shrink-0 text-ink-2" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
