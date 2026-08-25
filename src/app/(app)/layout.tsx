import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { logStartupConfig } from "@/server/config";
import RealtimeProvider from "@/components/RealtimeProvider";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  logStartupConfig();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <RealtimeProvider>
      <Shell
        user={{ id: user.id, name: user.name, username: user.username, email: user.email, avatar: user.avatar }}
      >
        {children}
      </Shell>
    </RealtimeProvider>
  );
}
