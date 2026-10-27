import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Icon } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { Breadcrumbs } from "@dojofoo/uix/components/breadcrumbs";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { BackIcon } from "@dojofoo/uix/icons";
import { TeachingMarkdown } from "@/components/teaching-markdown";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { KataBriefing } from "@/server/project/routes";

export const Route = createFileRoute("/kata/$name")({
  component: KataPage,
});

function KataPage() {
  const { name } = Route.useParams();
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  const [briefing, setBriefing] = useState<KataBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBriefing(null);
    setError(null);
    api.katas[":name"].briefing
      .$get({ param: { name } })
      .then(async (res) => {
        const body = await res.json();
        if ("error" in body) throw new Error(body.error);
        setBriefing(body);
      })
      .catch((err: Error) => setError(err.message));
  }, [name]);

  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<Link to="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
    navigation={[]}>
    <div className="px-6 py-5 md:px-10">
      <Breadcrumbs items={[{ label: "Dashboard", icon: <Icon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }, { label: name }]} />
      <div className="mt-8">
        <LessonBrief title={name}>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
            : !briefing ? <p role="status" className="text-sm text-muted-foreground">loading…</p>
              : briefing.markdown ? <TeachingMarkdown source={briefing.markdown} diagrams={false} />
                : <p role="status" className="text-sm text-muted-foreground">No briefing for this kata.</p>}
        </LessonBrief>
      </div>
    </div>
    {toast}
  </AppShell></div>;
}
