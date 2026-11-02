import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AuthoringCourseCard } from "../components/authoring-course-card";
import { Button } from "../components/button";

const meta = {
  title: "Components/Organisms/Authoring course card",
  component: AuthoringCourseCard,
  args: { course: { title: "My course", author: "Course author", repo: "author/my-course", version: "1.0.0", language: "TypeScript", lessons: 3, chapters: 1, art: { hue: 350, glyph: "" } } },
} satisfies Meta<typeof AuthoringCourseCard>;
export default meta;

export const LiveMetadata: StoryObj<typeof meta> = {
  render: args => {
    const [course, setCourse] = useState(args.course);
    return <div className="ui-as grid w-[260px] gap-5 p-3">
      <AuthoringCourseCard course={course} onColorChange={color => setCourse(current => ({ ...current, art: { ...current.art, color } }))} />
      <Button variant="secondary" onClick={() => setCourse(current => ({ ...current, title: "A course edited by Kyoshi", version: "1.1.0", language: "Python", lessons: 5, art: { hue: 190, glyph: "" }, shader: "waves" }))}>Apply agent edit</Button>
    </div>;
  },
};
