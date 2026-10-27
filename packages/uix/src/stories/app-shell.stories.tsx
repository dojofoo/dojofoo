import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AppShell } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";

function LessonNavigation() {
  const [last, setLast] = useState({ id: "", count: 0 });
  return <div style={{ height: "100dvh" }}><AppShell brand={<BrandLogo />} showUser={false} showFooter={false} showOnboarding={false}
    active="current" navigationTransition={false} onNavigate={id => setLast(current => ({ id, count: current.count + 1 }))}
    navigation={[{ id: "lessons", heading: "Lessons", items: [
      { id: "past", label: "Previous lesson", state: "done", href: "#completed-lesson" },
      { id: "current", label: "Current lesson", state: "active", preview: <p>The current goal.</p> },
      { id: "next", label: "Upcoming lesson", state: "locked", preview: <p>Preview an upcoming goal.</p> },
      { id: "locked", label: "Locked without preview", state: "locked", href: "#unavailable" },
    ] }]}><p role="status">{last.id ? `${last.id}:${last.count}` : ""}</p></AppShell></div>;
}
const meta = { title: "Components/Organisms/App Shell", component: LessonNavigation, parameters: { layout: "fullscreen" } } satisfies Meta<typeof LessonNavigation>;
export default meta;
export const LessonLinksAndPreviews: StoryObj<typeof meta> = {};
