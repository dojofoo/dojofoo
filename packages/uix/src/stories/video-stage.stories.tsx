import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "../components/app-shell";
import { LessonBrief } from "../components/lesson-brief";
import { VideoStage } from "../containers/video-stage";

const meta = {
  title: "Components/Organisms/Video Stage",
  component: VideoStage,
  parameters: { layout: "fullscreen" },
  args: { src: "/fixtures/lesson-video.webm", title: "Lesson video", ambient: false },
  decorators: [(Story) => <div className="h-dvh"><AppShell workspace="Dojo" navigation={[]} showFooter={false} showNews={false} showOnboarding={false}>
    <div className="p-6 md:p-10"><LessonBrief title="Video within a lesson" lead="An authored clip uses the same controls as the main video stage.">
      <div className="aspect-video w-full overflow-hidden rounded-[var(--box-radius)] bg-[var(--surface-1)]"><Story /></div>
      <h3>Try it</h3><p>Play, pause and change playback speed. Inline video stays within the lesson as you scroll.</p>
    </LessonBrief></div>
  </AppShell></div>],
} satisfies Meta<typeof VideoStage>;
export default meta;
export const Inline: StoryObj<typeof meta> = {};
