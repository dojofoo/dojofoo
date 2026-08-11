'use client'

import { Button, buttonVariants } from '@dojocho/ui/button'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { GithubIcon } from '@/components/github-icon'
import { cn } from '@/lib/utils'
import { gitConfig } from '@/lib/layout.shared'
import { SearchToggle } from './search-toggle'
import { ThemeToggle } from './theme-toggle'

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`

interface SiteNavigationProps {
  as?: 'header' | 'div'
  mobileAction?: ReactNode
  className?: string
}

export function SiteNavigation({
  as: Component = 'header',
  mobileAction,
  className,
}: SiteNavigationProps) {
  return (
    <Component
      className={cn(
        'border-b border-dashed border-border bg-background/90 backdrop-blur-md',
        Component === 'header' && 'sticky top-0 z-40',
        className,
      )}
    >
      <div
        data-site-navigation=""
        className="mx-auto flex h-16 w-full max-w-(--fd-layout-width) items-center gap-2 px-5 lg:px-8"
      >
        <Link to="/" aria-label="Dojofoo courses" className="mr-1 flex items-center">
          <img src="/dojofoo.svg" alt="dojofoo" className="h-5 w-auto" />
        </Link>

        <SearchToggle size="icon" showShortcut className="text-muted-foreground [&_svg]:!size-5" />

        <nav aria-label="Primary" className="ml-auto flex items-center gap-1">
          <Link
            to="/$"
            params={{ _splat: 'docs' }}
            className="px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-80 hover:text-foreground max-md:hidden"
          >
            Docs
          </Link>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className={cn(
              buttonVariants({ size: 'icon', variant: 'ghost' }),
              'text-muted-foreground max-sm:hidden [&_svg]:!size-5',
            )}
          >
            <GithubIcon />
          </a>
          <ThemeToggle className="max-sm:hidden" />
          <Button
            asChild
            variant="cta"
            className="ml-1 rounded-[2px]"
          >
            <Link to="/$" params={{ _splat: 'docs/installation' }}>
              <span>Get Started</span>
            </Link>
          </Button>
          {mobileAction}
        </nav>
      </div>
    </Component>
  )
}
