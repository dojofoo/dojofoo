import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/context-menu"
import {
  Copy as CopyIcon,
  Scissors as ScissorsIcon,
  Clipboard as ClipboardIcon,
  Trash as TrashIcon,
} from "@mynaui/icons-react";

export function Pattern() {
  return (
    <div className="flex w-full items-center justify-center p-12">
      <ContextMenu>
        <ContextMenuTrigger className="text-muted-foreground rounded-lg flex aspect-[2/0.5] w-full max-w-[300px] items-center justify-center border border-dashed text-sm">
          Right click here
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem>
              <CopyIcon
              />
              Copy
            </ContextMenuItem>
            <ContextMenuItem>
              <ScissorsIcon
              />
              Cut
            </ContextMenuItem>
            <ContextMenuItem>
              <ClipboardIcon
              />
              Paste
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem variant="destructive">
              <TrashIcon
              />
              Delete
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
