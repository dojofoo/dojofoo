'use client'
import type { ComponentProps } from 'react'
import { useTranslations } from '@fuma-translate/react'
import { Search } from 'lucide-react'
import { useSearchContext } from 'fumadocs-ui/contexts/search'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@dojocho/ui/button'

interface SearchToggleProps extends ButtonProps {
  hideIfDisabled?: boolean
}

export function SearchToggle({
  hideIfDisabled,
  size = 'icon-compact',
  variant = 'ghost',
  ...props
}: SearchToggleProps) {
  const { setOpenSearch, enabled } = useSearchContext()
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
    </Button>
  )
}

export function LargeSearchToggle({
  hideIfDisabled,
  ...props
}: ComponentProps<'button'> & {
  hideIfDisabled?: boolean
}) {
  const { enabled, hotKey, setOpenSearch } = useSearchContext()
  const t = useTranslations({ note: 'search trigger' })
  if (hideIfDisabled && !enabled) return null

  return (
    <button
      type="button"
      data-search-full=""
      {...props}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border bg-fd-secondary/50 p-2 ps-2.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground',
        props.className,
      )}
      onClick={() => {
        setOpenSearch(true)
      }}
    >
      <Search className="size-4" />
      {t('Search')}
      <div className="ms-auto inline-flex gap-0.5">
        {hotKey.map((k, i) => (
          <kbd key={i} className="rounded-sm border bg-fd-background px-1.5">
            {k.display}
          </kbd>
        ))}
      </div>
    </button>
  )
}
