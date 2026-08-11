'use client'
import { Search } from 'lucide-react'
import { useSearchContext } from 'fumadocs-ui/contexts/search'
import { Button, type ButtonProps } from '@dojocho/ui/button'

interface SearchToggleProps extends ButtonProps {
  hideIfDisabled?: boolean
  showShortcut?: boolean
}

export function SearchToggle({
  hideIfDisabled,
  showShortcut = false,
  size = 'icon-compact',
  variant = 'ghost',
  ...props
}: SearchToggleProps) {
  const { setOpenSearch, enabled, hotKey } = useSearchContext()
  if (hideIfDisabled && !enabled) return null

  return (
    <Button
      {...props}
      type="button"
      size={size}
      variant={variant}
      className={props.className}
      data-search=""
      aria-label="Open Search"
      onClick={() => {
        setOpenSearch(true)
      }}
    >
      <Search />
      {showShortcut && hotKey.length > 0 ? (
        <kbd className="search-shortcut pointer-events-none absolute top-1/2 left-[calc(100%+2px)] -translate-y-1/2">
          {hotKey.map((key, index) => <span key={index}>{key.display}</span>)}
        </kbd>
      ) : null}
    </Button>
  )
}
