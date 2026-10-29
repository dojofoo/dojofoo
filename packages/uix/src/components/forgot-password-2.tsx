import { Input } from './input'
import { Label } from './label'
import { Button } from './button'
import { AuthCard, AuthLink } from './auth-card'

import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

/*
 * Tailark's forgot-password block 2, in Dojo's look: one action in the onboarding's card, the way back below it. Its
 * frame also holds signing out.
 */

function BackLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <AuthLink
            href={href}
            className="inline-flex items-center gap-1 font-medium text-(--brand) hover:underline">
            <ArrowLeft className="size-4" />
            {children}
        </AuthLink>
    )
}

export default function ForgotPassword() {
    return (
        <AuthCard
            title="Forgot Password?"
            lead="Enter your email and we'll send you a reset link"
            foot={<BackLink href="/sign-in">Back to Sign in</BackLink>}>
            <form
                action=""
                onSubmit={(event) => event.preventDefault()}
                className="space-y-5">
                <div className="ui-auth-email space-y-2">
                    <Label
                        className="ui-ob-label block text-left"
                        htmlFor="email">
                        Email
                    </Label>
                    <Input
                        type="email"
                        id="email"
                        required
                        placeholder="Enter your email"
                    />
                </div>
                <Button
                    type="submit"
                    className="ui-auth-submit w-full">
                    Send Reset Link
                </Button>
            </form>
        </AuthCard>
    )
}

/** Signing out: one button, back home below it */
export function SignOut() {
    return (
        <AuthCard
            title="Sign out?"
            lead="You'll be signed out of Dojo.foo on this device."
            foot={<BackLink href="/">Back to Dojo.foo</BackLink>}>
            <form
                action=""
                onSubmit={(event) => event.preventDefault()}>
                <Button
                    type="submit"
                    className="ui-auth-submit w-full">
                    Sign Out
                </Button>
            </form>
        </AuthCard>
    )
}
