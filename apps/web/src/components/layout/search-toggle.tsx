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
        <kbd className="pointer-events-none absolute -right-1 -bottom-1 flex items-center bg-black px-1 py-0.5 text-[9px] leading-none font-medium text-white shadow-sm">
          {hotKey.map((key, index) => <span key={index}>{key.display}</span>)}
        </kbd>
      ) : null}
    </Button>
  )
}
