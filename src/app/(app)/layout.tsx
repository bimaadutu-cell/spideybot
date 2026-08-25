import { logStartupConfig } from "@/server/config";
import RealtimeProvider from "@/components/RealtimeProvider";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  logStartupConfig();
  return (
    <RealtimeProvider>
      <Shell user={{ id: 0, name: "Spidey Operator", username: "operator", email: "operator@spideybot.local", avatar: null }}>
        {children}
      </Shell>
    </RealtimeProvider>
  );
}
