import type { MouseEvent, ReactNode } from 'react'
import { ShellStyles } from './app-shell'
import { BrandLogo } from './brand-logo'
import { followLink } from '../lib/link-event'
import { useSite } from '../web/site'

/*
 * The frame of the sign-in pages (Tailark's login and forgot-password blocks): the logo on the page, the form in the
 * onboarding's card – a white card in a gray tray, on the panel's surface as there, the way on (or back) in the tray
 * below it – and the legal links at the foot. Links go through the site's router, so the page changes with the site's
 * view transition; from one of these pages to another the card and tray resize as boxes and what the two pages share
 * (logo, fields, buttons) stays where it is or slides to its new place.
 */

const authPages = ['/sign-in', '/sign-up', '/forgot-password', '/sign-out']

const footLinks = [
    ['Terms', '/terms'],
    ['Policy', '/privacy'],
    ['Help', '/docs'],
] as const

/** A link inside the site: the router (and its view transition) on a plain click, the browser otherwise */
export function AuthLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
    const links = useSite()
    return (
        <a
            href={href}
            className={className}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => followLink(event, () => {
                // Between two of these pages, the shared parts get their names for the transition
                if (authPages.includes(href)) {
                    const root = document.documentElement
                    root.dataset.authSwap = ''
                    window.setTimeout(() => delete root.dataset.authSwap, 800)
                }
                if (href === '/') links.navigate('home')
                else links.openDoc(href)
            })}>
            {children}
        </a>
    )
}

/** The page around these pages: the panel's surface, the content centered, the legal links at the foot */
export function AuthPage({ children }: { children: ReactNode }) {
    return (
        <main className="ui-as bg-(--panel) text-(--ink)">
            <ShellStyles />
            <style href="ui-auth" precedence="default">{css}</style>
            <div className="grid min-h-dvh grid-rows-[1fr_auto] gap-6 p-6 pt-20">
                <div className="mx-auto w-full max-w-[400px] self-center">
                    {children}
                </div>

                <nav
                    aria-label="Legal"
                    className="ui-auth-legal mx-auto flex w-fit gap-6 pt-8">
                    {footLinks.map(([label, href]) => (
                        <AuthLink
                            key={label}
                            href={href}
                            className="text-sm text-(--muted) hover:text-(--ink)">
                            {label}
                        </AuthLink>
                    ))}
                </nav>
            </div>
        </main>
    )
}

export function AuthCard({ title, lead, foot, children }: {
    title: string
    lead: ReactNode
    /** In the tray under the card: the way to the other page */
    foot?: ReactNode
    children: ReactNode
}) {
    return (
        <AuthPage>
            <AuthLink
                href="/"
                className="ui-auth-logo mx-auto mb-8 flex w-fit">
                <BrandLogo alt="Dojo.foo home" className="aspect-[2567/1211] h-[30px] w-auto" />
            </AuthLink>

            <div className="ui-ob-card ui-auth-tray">
                <div className="ui-ob-step ui-auth-step p-8!">
                    <div className="ui-auth-head mb-8 space-y-1.5">
                        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                        <p className="text-sm text-(--muted)">{lead}</p>
                    </div>
                    {children}
                </div>
                {foot && (
                    <div className="ui-ob-foot justify-center! px-4! text-sm text-(--muted)">
                        <p className="ui-auth-foot">{foot}</p>
                    </div>
                )}
            </div>
        </AuthPage>
    )
}

const css = /* css */ `
/* The way in used last time (better-auth's last-login-method): a badge over the button's top right corner */
.ui-auth-last { position: relative; }
.ui-auth-badge { position: absolute; z-index: 1; top: -8px; right: -6px; padding: 2px 7px; border-radius: 999px; corner-shape: round; background: var(--brand); color: #fff; font-size: 11px; line-height: 14px; font-weight: 600; white-space: nowrap; box-shadow: 0 0 0 2px var(--card); pointer-events: none; }

/* Between two sign-in pages: the tray and card as boxes that resize (their surfaces drawn on the groups, the
   snapshots hidden), everything else by name – the same field or button on both pages doesn't change */
:root[data-auth-swap] .ui-auth-logo { view-transition-name: auth-logo; }
:root[data-auth-swap] .ui-auth-tray { view-transition-name: auth-tray; }
:root[data-auth-swap] .ui-auth-step { view-transition-name: auth-step; }
:root[data-auth-swap] .ui-auth-head { view-transition-name: auth-head; }
:root[data-auth-swap] .ui-auth-email { view-transition-name: auth-email; }
:root[data-auth-swap] .ui-auth-password { view-transition-name: auth-password; }
:root[data-auth-swap] .ui-auth-submit { view-transition-name: auth-submit; }
:root[data-auth-swap] .ui-auth-divider { view-transition-name: auth-divider; }
:root[data-auth-swap] .ui-auth-social { view-transition-name: auth-social; }
:root[data-auth-swap] .ui-auth-foot { view-transition-name: auth-foot; }
:root[data-auth-swap] .ui-auth-legal { view-transition-name: auth-legal; }
:root[data-auth-swap] :is(.ui-auth-logo, .ui-auth-tray, .ui-auth-step, .ui-auth-head, .ui-auth-email, .ui-auth-password, .ui-auth-submit, .ui-auth-divider, .ui-auth-social, .ui-auth-foot, .ui-auth-legal) { view-transition-class: ui-auth; }
/* To the end of the device page: the page cross-fades (no transition type, so the root fades), the logo slides into place */
:root[data-auth-done] .ui-auth-logo { view-transition-name: auth-logo; view-transition-class: ui-auth; }
::view-transition-group(.ui-auth) { animation-duration: 260ms; animation-timing-function: cubic-bezier(.16, 1, .3, 1); }
::view-transition-group(auth-tray) { background: var(--surface-1); border-radius: calc(var(--radius-2xl) + var(--spacing)); }
::view-transition-group(auth-step) { background: var(--surface-3); border-radius: var(--radius-2xl); box-shadow: var(--shadow-3); }
::view-transition-old(auth-tray), ::view-transition-new(auth-tray), ::view-transition-old(auth-step), ::view-transition-new(auth-step) { animation: none; opacity: 0; }
/* What both pages have doesn't fade into itself: the new one only, sliding to its place. The heading and the way on
   cross-fade. */
::view-transition-old(.ui-auth) { animation: none; opacity: 0; }
::view-transition-new(.ui-auth) { animation: none; opacity: 1; }
::view-transition-old(auth-head), ::view-transition-old(auth-foot) { animation: ui-view-fade-out 180ms cubic-bezier(.16, 1, .3, 1) both; opacity: 1; mix-blend-mode: plus-lighter; }
::view-transition-new(auth-head), ::view-transition-new(auth-foot) { animation: ui-view-fade-in 180ms cubic-bezier(.16, 1, .3, 1) both; mix-blend-mode: plus-lighter; }
`
