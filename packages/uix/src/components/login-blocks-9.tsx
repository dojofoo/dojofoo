'use client'
import { GithubFilled } from '@mingcute/react/core-filled'
import { Input } from './input'
import { Label } from './label'
import { Button } from './button'
import { AuthCard, AuthLink } from './auth-card'
import googleLogo from '../assets/auth/google.svg?url'

import { useEffect, useState, type ReactNode } from 'react'

/*
 * Tailark's login block 9, in Dojo's look: our fields, buttons and type in the onboarding's card, the brand color on
 * links. One block for signing in and signing up – the same email, an optional password (without one, a magic link),
 * GitHub and Google beside it, the way in used last time marked. The forms only render for now; better-auth answers
 * under /api/v1/auth once it's wired.
 */

// better-auth's last-login-method plugin keeps it in a cookie the page can read: email, magic-link, github, google…
const lastMethodCookie = 'better-auth.last_used_login_method'

function useLastMethod() {
    const [method, setMethod] = useState<string>()
    useEffect(() => {
        const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${lastMethodCookie}=`))
        setMethod(entry ? decodeURIComponent(entry.slice(lastMethodCookie.length + 1)) : undefined)
    }, [])
    return method
}

/** Marks the way in used last time */
function LastUsed({ last, children }: { last: boolean; children: ReactNode }) {
    return (
        <div className="ui-auth-last">
            {children}
            {last && <span className="ui-auth-badge">Last used</span>}
        </div>
    )
}

const copy = {
    'sign-in': { title: 'Sign in', lead: 'Welcome back', submit: 'Sign In', prompt: 'No account?', link: 'Create one', href: '/sign-up' },
    'sign-up': { title: 'Create an account', lead: 'Sign up to save your progress and publish courses', submit: 'Sign Up', prompt: 'Already have an account?', link: 'Sign in', href: '/sign-in' },
} as const

export default function Login({ mode = 'sign-in' }: { mode?: keyof typeof copy }) {
    const [password, setPassword] = useState('')
    const lastMethod = useLastMethod()
    const text = copy[mode]

    return (
        <AuthCard
            title={text.title}
            lead={text.lead}
            foot={<>
                {text.prompt}{' '}
                <AuthLink
                    href={text.href}
                    className="font-medium text-(--brand) hover:underline">
                    {text.link}
                </AuthLink>
            </>}>
            <form
                action=""
                onSubmit={(event) => event.preventDefault()}
                className="space-y-5">
                <div className="ui-auth-email space-y-2">
                    <Label
                        htmlFor={`email-${mode}`}
                        className="ui-ob-label block">
                        Email
                    </Label>
                    <Input
                        type="email"
                        id={`email-${mode}`}
                        required
                        placeholder="name@company.com"
                    />
                </div>
                <div className="ui-auth-password space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                        <Label
                            htmlFor={`password-${mode}`}
                            className="ui-ob-label block">
                            Password <span className="font-normal text-(--muted)">(optional)</span>
                        </Label>
                        {mode === 'sign-in' && (
                            <AuthLink
                                href="/forgot-password"
                                className="text-[13px] text-(--brand) hover:underline">
                                Forgot?
                            </AuthLink>
                        )}
                    </div>

                    <Input
                        type="password"
                        id={`password-${mode}`}
                        placeholder={mode === 'sign-in' ? 'Enter your password' : 'Choose a password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>
                <LastUsed last={lastMethod === 'email' || lastMethod === 'magic-link'}>
                    <Button
                        type="submit"
                        className="ui-auth-submit w-full">
                        {password ? text.submit : 'Send Magic Link'}
                    </Button>
                </LastUsed>
            </form>

            <div className="ui-auth-divider my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="h-px bg-(--line)" />
                <div className="text-center text-[13px] text-(--muted)">or continue with</div>
                <div className="h-px bg-(--line)" />
            </div>

            <div className="ui-auth-social grid grid-cols-2 gap-3">
                <LastUsed last={lastMethod === 'github'}>
                    <Button
                        variant="secondary"
                        className="w-full"
                        icon={<GithubFilled size={16} />}>
                        GitHub
                    </Button>
                </LastUsed>
                <LastUsed last={lastMethod === 'google'}>
                    <Button
                        variant="secondary"
                        className="w-full"
                        icon={<img src={googleLogo} alt="" className="size-4" />}>
                        Google
                    </Button>
                </LastUsed>
            </div>
        </AuthCard>
    )
}
