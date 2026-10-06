/** Resolve authored relative links through the course's existing asset boundary. */
export function courseAssetUrl(source: string, basePath: string | null, workspaceId: string): string {
  if (/^(?:https?:|mailto:|#)/iu.test(source)) return source;
  if (/^data:image\/(?:png|gif|jpeg|webp);/iu.test(source)) return source;
  if (/^[a-z][a-z\d+.-]*:/iu.test(source) || source.startsWith("//")) return "#";
  const path = [basePath, source].filter(Boolean).join("/").split("/").reduce<string[]>((parts, part) => {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
    return parts;
  }, []).join("/");
  return `/api/interactive/asset?workspace=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`;
}
