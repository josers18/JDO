import { useCallback, useEffect, useState } from "react";
import { Blocks, MessagesSquare, Settings2 } from "lucide-react";
import { api } from "./api";
import { ChatModule } from "./chat/ChatModule";
import { OrgsPage } from "./admin/OrgsPage";
import { McpModule } from "./mcp/McpModule";
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
    <div className="flex h-full">
      <nav className="flex w-16 flex-col items-center gap-2 border-r border-slate-200 bg-slate-900 py-4">
        <div className="mb-4 text-[10px] font-bold tracking-wider text-sky-300">AFD360</div>
        <RailButton label="Chat" active={module === "chat"} onClick={() => setModule("chat")}>
          <MessagesSquare size={20} />
        </RailButton>
        <RailButton label="MCP" active={module === "mcp"} onClick={() => setModule("mcp")}>
          <Blocks size={20} />
        </RailButton>
        <RailButton label="Admin" active={module === "admin"} onClick={() => setModule("admin")}>
          <Settings2 size={20} />
        </RailButton>
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
      className={`flex w-12 flex-col items-center gap-1 rounded-lg py-2 text-[10px] ${
        props.active ? "bg-sky-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {props.children}
      {props.label}
    </button>
  );
}
