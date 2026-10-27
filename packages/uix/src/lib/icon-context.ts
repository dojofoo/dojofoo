import { createContext } from "react";

export type IconSet = "iconoir" | "mingcute" | "solar" | "fluent" | "hugeicons";
export const IconSetContext = createContext<IconSet>("mingcute");
