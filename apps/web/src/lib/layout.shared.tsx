import { GithubIcon } from '@/components/github-icon'
import type { BaseLayoutProps } from '@/components/layout/shared'

export const gitConfig = {
  user: 'tomsiwik',
  repo: 'dojocho',
  branch: 'main',
}

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // SVG wordmark — the variant designed for the docs nav.
      title: <img src="/logo.svg" alt="dojocho" className="h-7 w-auto" />,
      url: '/',
    },
    // Explicit links list (instead of the `githubUrl` shortcut) so we can use
    // the lucide GithubIcon — same icon the landing page uses, for visual
    // consistency between frontpage and docs nav.
    links: [
      {
        type: 'icon',
        url: githubUrl,
        text: 'GitHub',
        label: 'GitHub',
        icon: <GithubIcon />,
        external: true,
      },
    ],
  }
}
