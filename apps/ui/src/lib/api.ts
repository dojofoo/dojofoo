import { hc } from "hono/client";
import type { ProjectRoutes } from "@/server/project/routes";

export const api = hc<ProjectRoutes>("/api/project");
