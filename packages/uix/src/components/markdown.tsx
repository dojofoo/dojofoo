import { useEffect, useState } from "react";
import { getRenderedMarkdown, renderMarkdown } from "~/lib/markdown";
import { useEditorScheme } from "~/lib/ui-preferences";

export function Markdown({ source }: { source: string }) {
  const theme = useEditorScheme().theme.name;
  const [rendered, setRendered] = useState<{ source: string; theme: string; html: string }>();
  useEffect(() => {
    let active = true;
    void renderMarkdown(source, theme).then(html => {
      if (active) setRendered({ source, theme, html });
    }).catch(() => { if (active) setRendered(undefined); });
    return () => { active = false; };
  }, [source, theme]);
  const html = getRenderedMarkdown(source, theme) ?? (rendered?.source === source && rendered.theme === theme ? rendered.html : undefined);
  return html !== undefined
    ? <div className="ui-result-markdown" dangerouslySetInnerHTML={{ __html: html }} />
    : <div className="whitespace-pre-wrap">{source}</div>;
}
