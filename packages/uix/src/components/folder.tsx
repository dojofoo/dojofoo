
/*
 * Folder – one folder with its files, in a single file.
 * Breadcrumb, back link, the Glass Folder with share and upload actions, and the files as cards
 * (or an empty state with a call to action when the folder is empty).
 * Sits in the affectUI App Shell; icons from the Hugeicons free set.
 */

import { ArrowLeft02Icon, ChatEdit01Icon, MoreHorizontalIcon, Upload04Icon, UserMultiple02Icon, PencilEdit02Icon, Link01Icon, Delete02Icon } from "~/lib/icons";
import { Button } from "~/components/button";
import { GlassFolder } from "~/components/glass-folder";
import { useRef, useState, type CSSProperties } from "react";
import { AppShell, Dropdown, EmptyState, FileCard, Icon, fileKind, useToast, type AppShellProps, type FileItem } from "~/components/app-shell";

/** Sample content – replace with your own data */
const folders: { name: string; files: FileItem[] }[] = [
  {
    name: "Q3 Campaign",
    files: [
      { name: "Campaign-Brief", type: "DOC", edited: "2 hours ago" },
      { name: "Launch-Plan", type: "PDF", edited: "Yesterday" },
      { name: "Media-Budget", type: "XLS", edited: "Yesterday" },
      { name: "Ad-Copy", type: "DOC", edited: "3 days ago" },
      { name: "Results-Q2", type: "XLS", edited: "Last week" },
    ],
  },
  {
    name: "Brand assets",
    files: [
      { name: "Brand-Guidelines", type: "PDF", edited: "4 days ago" },
      { name: "Tone-of-Voice", type: "DOC", edited: "Last week" },
      { name: "Logo-Usage", type: "PDF", edited: "2 weeks ago" },
    ],
  },
  {
    name: "Hiring",
    files: [
      { name: "Job-Description", type: "DOC", edited: "Today" },
      { name: "Candidates", type: "XLS", edited: "Yesterday" },
      { name: "Interview-Guide", type: "PDF", edited: "5 days ago" },
      { name: "Offer-Template", type: "DOC", edited: "Last month" },
    ],
  },
  {
    name: "Research",
    files: [
      { name: "Market-Study", type: "PDF", edited: "3 days ago" },
      { name: "Survey-Results", type: "XLS", edited: "Last week" },
    ],
  },
];


export type FolderScreenProps = Pick<AppShellProps, "onNavigate" | "workspace" | "user" | "className"> & {
  /** Name of the folder to show – a sample folder, or a new empty one with that name */
  folder?: string;
};

export function FolderScreen({ folder: name, ...props }: FolderScreenProps) {
  const folder = folders.find((f) => f.name === name) ?? (name ? { name, files: [] } : folders[0]);
  // Uploads add the picked files to the folder; the list starts over when another folder opens
  const [uploaded, setUploaded] = useState<{ folder: string; files: FileItem[] }>({ folder: folder.name, files: [] });
  const added = uploaded.folder === folder.name ? uploaded.files : [];
  const files = [...added, ...folder.files];
  const input = useRef<HTMLInputElement>(null);
  const [toast, showToast] = useToast();

  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    const picked: FileItem[] = [...list].map((file) => ({
      name: file.name.replace(/\.[^.]+$/, ""),
      type: /\.(xlsx?|csv|numbers)$/i.test(file.name) ? "XLS" : /\.pdf$/i.test(file.name) ? "PDF" : "DOC",
      edited: "Just now",
    }));
    setUploaded({ folder: folder.name, files: [...picked, ...added] });
    showToast(`${picked.length} ${picked.length === 1 ? "file" : "files"} uploaded`);
  };

  return (
    <AppShell active={folder.name} {...props}>
      <style href="ui-screen-folder" precedence="default">
        {css}
      </style>
      <nav className="ui-as-crumbs" aria-label="Breadcrumb">
        <button type="button" onClick={() => props.onNavigate?.("Folders")}>
          Files
        </button>
        <i>/</i>
        <span aria-current="page">{folder.name}</span>
      </nav>

      <div className="ui-as-page ui-as-page--folder">
        <button type="button" className="ui-as-back" onClick={() => props.onNavigate?.("Folders")}>
          <Icon icon={ArrowLeft02Icon} size={14} />
          Files
        </button>

        <header className="ui-as-folder-head">
          <span className="ui-as-folder-head__icon">
            <GlassFolder label="" />
          </span>
          <h1 className="ui-as-page-title">{folder.name}</h1>
          <span className="ui-as-folder-head__actions">
            <Dropdown
              align="end"
              items={[
                { label: "Rename", icon: PencilEdit02Icon, onSelect: () => showToast("Rename is coming soon") },
                { label: "Copy link", icon: Link01Icon, onSelect: () => (navigator.clipboard?.writeText(window.location.href).catch(() => {}), showToast("Link copied")) },
                { label: "Delete folder", icon: Delete02Icon, danger: true, onSelect: () => props.onNavigate?.("Folders") },
              ]}
              trigger={({ toggle }) => <Button variant="ghost" size="sm" aria-label="More" icon={<Icon icon={MoreHorizontalIcon} size={16} />} onClick={toggle} />}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon icon={UserMultiple02Icon} size={15} />}
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href).catch(() => {});
                showToast("Link copied");
              }}
            >
              Share
            </Button>
            <Button size="sm" icon={<Icon icon={Upload04Icon} size={15} />} onClick={() => input.current?.click()}>
              Upload files
            </Button>
            <input ref={input} type="file" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
          </span>
        </header>

        {files.length > 0 ? (
          <div className="ui-as-folder-files ui-as-file-grid" key={folder.name}>
            {files.map((f, i) => (
              <div key={f.name + i} className="ui-as-rise" style={{ "--i": added.includes(f) ? 0 : i } as CSSProperties}>
                <FileCard file={f} meta={<>{fileKind[f.type]} · {f.edited}</>} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No files yet"
            text="Start a chat to work with files here. The AI can read, edit and create them alongside you."
            action={
              <Button variant="secondary" size="sm" icon={<Icon icon={ChatEdit01Icon} size={15} />} onClick={() => props.onNavigate?.("New chat")}>
                Work in folder
              </Button>
            }
          />
        )}
      </div>
      {toast}
    </AppShell>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* A single folder – breadcrumb, back link, header with actions and the empty drop area */

.ui-as-crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  font-size: 13.5px;
  color: var(--muted);
}
/* Room for the sidebar icon while the sidebar is collapsed */
.ui-as-app[data-collapsed] .ui-as-crumbs { padding-left: 50px; }
.ui-as-crumbs { transition: padding-left 420ms var(--ease); }
.ui-as-crumbs button { color: inherit; text-decoration: none; }
.ui-as-crumbs button:hover { color: var(--ink); }
.ui-as-crumbs i { font-style: normal; color: var(--faint); }
.ui-as-crumbs [aria-current] { font-weight: 500; color: var(--ink); }

.ui-as-page.ui-as-page--folder { padding-top: 12px; }
.ui-as-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: var(--muted);
  text-decoration: none;
}
.ui-as-back:hover { color: var(--ink); }

.ui-as-folder-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
}
.ui-as-folder-head__actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.ui-as-page--folder .ui-as-empty { margin-top: 20px; padding: 48px 24px 56px; }

/* The folder's files as cards */
/* Same cards and spacing as the templates on the Files page */
.ui-as-folder-files { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }

/* Narrow: the sidebar icon always sits in the corner; the actions move under the title */
@container ui-as (max-width: 900px) {
  .ui-as-crumbs { padding-left: 50px; }
  .ui-as-page.ui-as-page--folder { padding-top: 8px; }
  .ui-as-folder-head { flex-wrap: wrap; row-gap: 14px; }
}
@container ui-as (max-width: 600px) {
  .ui-as-crumbs { padding-right: 12px; }
  .ui-as-crumbs [aria-current] { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ui-as-folder-head { margin-top: 18px; }
  .ui-as-folder-head__actions { width: 100%; margin-left: 0; }
  /* Share and Upload first, the "more" menu at the far end */
  .ui-as-folder-head__actions > .ui-as-anchor { order: 3; margin-left: auto; }
  .ui-as-page--folder .ui-as-empty { padding: 36px 18px 40px; }
}
`;
