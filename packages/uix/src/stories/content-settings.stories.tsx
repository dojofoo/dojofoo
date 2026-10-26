import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "~/components/app-shell";
import { Button } from "~/components/button";
import { ContentSettings } from "~/components/content-settings";
import { LessonBrief } from "~/components/lesson-brief";
import { SlideDeck } from "~/components/slide-deck";
import { CodeEditor, Editor } from "~/containers/editor";
import { VideoStage } from "~/containers/video-stage";

const meta = {
  title: "Components/Organisms/Content Settings",
  component: ContentSettings,
  parameters: { layout: "fullscreen" },
  args: { kind: "code", onClose: () => {} },
  argTypes: { kind: { control: "select", options: ["material", "video", "slides", "code", "all"] }, onClose: { table: { disable: true } } },
} satisfies Meta<typeof ContentSettings>;
export default meta;

export const Playground: StoryObj<typeof meta> = {
  render: args => <PlaygroundContent kind={args.kind} />,
};
export const Material: StoryObj<typeof meta> = { ...Playground, args: { kind: "material" } };
export const Video: StoryObj<typeof meta> = { ...Playground, args: { kind: "video" } };
export const Slides: StoryObj<typeof meta> = { ...Playground, args: { kind: "slides" } };
function PlaygroundContent({ kind }: Pick<Parameters<typeof ContentSettings>[0], "kind">) {
  const [open, setOpen] = useState(true);
  const [code, setCode] = useState("/** Keep only positive readings. */\nexport function positive(readings: number[]) {\n  return readings.filter(value => value > 0);\n}\n");
  return <div style={{ height: "100dvh" }}><AppShell workspace="Dojo" nav={[]} groups={[]} showUser={false} showNews={false}>
    <style href="ui-content-settings-story" precedence="default">{`
      .ui-cs-story { display: grid; grid-template-columns: minmax(0, 1fr) 360px; height: 100%; min-height: 0; }
      .ui-cs-story__preview { min-width: 0; overflow: auto; padding: 24px; }
      .ui-cs-story__stage { height: 320px; margin-bottom: 28px; }
      @container ui-as-main (max-width: 760px) { .ui-cs-story { display: flex; flex-direction: column; overflow: auto; } .ui-cs-story__preview { flex: none; } .ui-cs-story > aside { min-height: 520px; } }
    `}</style>
    <div className="ui-cs-story">
      <div className="ui-cs-story__preview">
        {!open && <Button onClick={() => setOpen(true)}>Show settings</Button>}
        {kind !== "material" && <div className="ui-cs-story__stage">
          {kind === "video" ? <VideoStage src="https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4" title="Lesson video" />
            : kind === "slides" ? <SlideDeck src="/slides/index.html?embedded=true" title="Lesson slides" />
              : <Editor><CodeEditor code={code} onChange={setCode} filePath="settings-preview.ts" language="typescript" lessonApiBase="" readOnly={false} coverage lineHits={{ "2": 1, "3": 1 }} /></Editor>}
        </div>}
        <LessonBrief title="One pass, one useful value" lead="Read the lesson in the layout that works for you." resources={[{ title: "TypeScript Handbook", href: "https://www.typescriptlang.org/docs/handbook/intro.html", note: "Reference for the types used in this lesson" }]}>
          <h3>Goal</h3><p>Keep the positive readings without changing the original list. Predict what should happen before editing the code.</p>
        </LessonBrief>
      </div>
      {open && <ContentSettings kind={kind} onClose={() => setOpen(false)} />}
    </div>
  </AppShell></div>;
}
