'use client'
import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from './app-shell'
import { Avatar } from './arc/avatar/avatar'
import { BrandLogo } from './brand-logo'
import { Button } from './button'
import { CodexIcon, CursorIcon, OpenCodeIcon } from './harness-icons'
import { CodeInput } from './code-input'
import { Label } from './label'
import { AuthCard, AuthPage } from './auth-card'
import { Copy01Icon, Tick02Icon, UserIcon } from '../lib/icons'

/*
 * Signing the CLI in (`dojofoo auth`), better-auth's device authorization (RFC 8628): the CLI shows a code and opens
 * /device?user_code=…, the learner – signed in – checks the code against their terminal and approves it, and the CLI,
 * polling, gets its token. Without a code in the link the page asks for it. Approved, the page shows Dojo and the
 * learner joined, and a prompt to hand their coding agent. Only renders for now: approving and denying call
 * /api/v1/auth/device/approve and /deny once better-auth is wired.
 */

/** What the learner hands their agent once the CLI is signed in */
const agentPrompt = 'Set up dojo.foo for me: run `npx dojofoo ui` in this folder – it opens the dojo in my browser – then help me pick and install my first course.'

type DeviceUser = { name: string; image?: string }

/**
 * A step of the page in a view transition, as the router changes pages: from the code to its check the card resizes
 * and what both share stays put (auth-card's names); to the end the page cross-fades and the logo slides into place
 */
function step(update: () => void, kind: 'swap' | 'done') {
    if (typeof document === 'undefined' || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        update()
        return
    }
    const root = document.documentElement
    const flag = kind === 'swap' ? 'authSwap' : 'authDone'
    root.dataset[flag] = ''
    const transition = document.startViewTransition(() => flushSync(update))
    void transition.finished.finally(() => delete root.dataset[flag])
}

/** better-auth's user code: 8 characters by default (userCodeLength), shown as two groups of four */
const codeLength = 8
/** Its alphabet leaves out what reads alike (0 and O, 1 and I): a code with one of them was mistyped */
const notInCodes = /[01IO]/

export default function DeviceAuth({ userCode, status = 'pending', user }: {
    /** From the link the CLI opened (?user_code=) */
    userCode?: string
    status?: 'pending' | 'approved' | 'denied'
    user?: DeviceUser
}) {
    const [code, setCode] = useState((userCode ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, codeLength))
    const [error, setError] = useState<string>()
    const [confirmed, setConfirmed] = useState(Boolean(userCode))
    const [state, setState] = useState(status)

    if (state !== 'pending') return <DeviceDone approved={state === 'approved'} user={user} />

    if (!confirmed) {
        return (
            <AuthCard
                title="Authenticate device"
                lead="Enter the code provided to you">
                <form
                    onSubmit={(event) => {
                        event.preventDefault()
                        if (code.length < codeLength) setError(`Enter all ${codeLength} characters shown in your terminal.`)
                        else if (notInCodes.test(code)) setError("That code doesn't exist. Check your terminal and try again.")
                        else step(() => setConfirmed(true), 'swap')
                    }}
                    className="space-y-5">
                    <div className="ui-auth-email space-y-2">
                        <Label
                            htmlFor="user-code"
                            className="ui-ob-label block">
                            Code
                        </Label>
                        <CodeInput
                            id="user-code"
                            label="Code from your terminal"
                            length={codeLength}
                            separator={codeLength / 2}
                            numeric={false}
                            autoFocus
                            value={code}
                            onChange={(next) => { setCode(next); setError(undefined) }}
                            error={error}
                        />
                    </div>
                    <Button
                        type="submit"
                        className="ui-auth-submit w-full">
                        Continue
                    </Button>
                </form>
            </AuthCard>
        )
    }

    return (
        <AuthCard
            title="Authenticate device"
            lead="Make sure this code matches the one in your device or terminal.">
            <style href="ui-device" precedence="default">{css}</style>
            <p className="ui-auth-email ui-device-code">
                {code.slice(0, codeLength / 2)}-{code.slice(codeLength / 2)}
            </p>
            <div className="ui-auth-social grid grid-cols-2 gap-3">
                <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => step(() => setState('denied'), 'done')}>
                    Deny
                </Button>
                <Button
                    className="w-full"
                    onClick={() => step(() => setState('approved'), 'done')}>
                    Approve
                </Button>
            </div>
        </AuthCard>
    )
}

function DeviceDone({ approved, user }: { approved: boolean; user?: DeviceUser }) {
    return (
        <AuthPage>
            <style href="ui-device" precedence="default">{css}</style>
            <div className="ui-device-done">
                <div className="ui-device-pair">
                    <BrandLogo alt="Dojo.foo" className="ui-device-logo ui-auth-logo aspect-[2567/1211] h-[30px] w-auto" />
                    <ArrowLeftRight aria-hidden="true" className="ui-device-arrow" />
                    {user
                        ? <Avatar name={user.name} src={user.image} size="lg" className="ui-device-circle" />
                        : <span className="ui-device-circle ui-device-circle--user"><Icon icon={UserIcon} size={24} /></span>}
                </div>

                <h1 className="ui-device-title">
                    {approved ? 'Authorization successful' : 'Authorization denied'}
                </h1>
                <p className="ui-device-note">
                    {approved && (
                        <span className="ui-device-check">
                            <Icon icon={Tick02Icon} size={14} />
                        </span>
                    )}
                    {approved ? 'You can close this tab.' : 'The CLI stays signed out. You can close this tab.'}
                </p>

                {approved && <AgentPrompt />}
            </div>
        </AuthPage>
    )
}

/** The prompt to hand a coding agent, in a pill: the agents Dojo runs on, the words, a copy button */
function AgentPrompt() {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        void navigator.clipboard?.writeText(agentPrompt).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
        })
    }
    return (
        <button
            type="button"
            title={agentPrompt}
            aria-label={copied ? 'Prompt copied' : 'Copy a prompt to onboard your coding agent'}
            onClick={copy}
            className="ui-device-prompt">
            <span className="ui-device-agents" aria-hidden="true">
                {[CodexIcon, OpenCodeIcon, CursorIcon].map((agent, index) => (
                    <span key={index}><Icon icon={agent} size={15} /></span>
                ))}
            </span>
            Onboard your coding agent
            <span className="ui-device-copy"><Icon icon={copied ? Tick02Icon : Copy01Icon} size={16} /></span>
        </button>
    )
}

const css = /* css */ `
.ui-device-code { margin: 0 0 24px; padding: 16px 0; border-radius: calc(10px * var(--squircle-factor, 1)); background: var(--tray); font-family: var(--font-mono); font-size: 24px; font-weight: 600; letter-spacing: 0.25em; text-align: center; text-transform: uppercase; }

/* Approved: Dojo and the learner, joined; the line under it; the prompt for their agent */
.ui-device-done { display: grid; justify-items: center; text-align: center; }
.ui-device-pair { display: flex; align-items: center; gap: 20px; }
.ui-device-circle { display: grid; place-items: center; width: 56px; height: 56px; overflow: hidden; border-radius: 50%; corner-shape: round; background: var(--card); box-shadow: 0 0 0 1px var(--line-strong), var(--shadow); }
.ui-device-circle--user { color: var(--muted); }
.ui-device-arrow { width: 20px; height: 20px; color: var(--muted); }
.ui-device-title { margin: 32px 0 0; font-size: 30px; line-height: 1.15; font-weight: 600; letter-spacing: -0.025em; text-wrap: balance; }
.ui-device-note { display: flex; align-items: center; gap: 10px; margin: 16px 0 0; color: var(--muted); font-size: 15px; }
.ui-device-check { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; corner-shape: round; background: var(--ink); color: var(--panel); }
.ui-device-prompt { display: inline-flex; align-items: center; gap: 12px; height: 48px; margin-top: 32px; padding: 0 16px 0 8px; border-radius: 999px; corner-shape: round; background: var(--card); box-shadow: 0 0 0 1px var(--line-strong), var(--shadow); color: var(--ink); font-size: 15px; font-weight: 500; transition: background-color 140ms ease; }
.ui-device-prompt:hover { background: color-mix(in oklab, var(--card), var(--ink) 4%); }
.ui-device-agents { display: flex; }
.ui-device-agents > span { display: grid; place-items: center; width: 32px; height: 32px; margin-left: -8px; border-radius: 50%; corner-shape: round; background: var(--panel); box-shadow: 0 0 0 1px var(--line-strong); }
.ui-device-agents > span:first-child { margin-left: 0; }
.ui-device-copy { display: grid; color: var(--muted); }
`
