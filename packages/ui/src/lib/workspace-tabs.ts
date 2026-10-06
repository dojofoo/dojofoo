export type TabMode = "authoring" | "learning";
export type TabState = { paths: string[]; active: string | null };
export type TabAction =
  | { type: "open" | "select" | "close"; path: string }
  | { type: "move"; path: string; index: number };

export function updateTabs(state: TabState, action: TabAction, mode: TabMode): TabState {
  const index = state.paths.indexOf(action.path);
  if (action.type === "select") return index < 0 ? state : { ...state, active: action.path };
  if (mode === "learning") return state;
  if (action.type === "open") return { paths: index < 0 ? [...state.paths, action.path] : state.paths, active: action.path };
  if (index < 0) return state;
  const paths = state.paths.filter((path) => path !== action.path);
  if (action.type === "move") {
    paths.splice(Math.max(0, Math.min(action.index, paths.length)), 0, action.path);
    return { ...state, paths };
  }
  return { paths, active: state.active === action.path ? paths[Math.min(index, paths.length - 1)] ?? null : state.active };
}
