import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ModelPicker, type PickerModel } from "./model-picker";

const models: PickerModel[] = [
  { id: "opus", name: "Opus 5.5", efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "medium" },
  { id: "opus-4-6", name: "Opus 4.6", efforts: ["low", "medium", "high", "max"], defaultEffort: "high" },
  { id: "haiku", name: "Haiku 4.5", efforts: [] },
];
const trigger = (props: Partial<Parameters<typeof ModelPicker>[0]>) =>
  renderToStaticMarkup(<ModelPicker models={models} onEffortChange={() => {}} {...props} />).match(/aria-label="(Model:[^"]*)"/)?.[1];

it("shows only an effort the chosen model takes", () => {
  expect(trigger({ value: "opus", effort: "xhigh" })).toBe("Model: Opus 5.5, X-High effort");
  // A level saved for another model shows the model's own default instead
  expect(trigger({ value: "opus-4-6", effort: "xhigh" })).toBe("Model: Opus 4.6, High effort");
  expect(trigger({ value: "opus-4-6", defaultEffort: "xhigh" })).toBe("Model: Opus 4.6, High effort");
  // A model without levels shows none
  expect(trigger({ value: "haiku", effort: "max" })).toBe("Model: Haiku 4.5");
});
