'use client'
import { loadMotionFeatures } from "../lib/lazy-motion";
import * as m from 'motion/react-m'
import { AnimatePresence, LazyMotion, MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import antigravity from '../assets/agents/antigravity.svg?no-inline'
import claude from '../assets/agents/claude-wordmark-light.svg?no-inline'
import cline from '../assets/agents/cline.svg?no-inline'
import codex from '../assets/agents/codex.svg?no-inline'
import copilot from '../assets/agents/github-copilot.svg?no-inline'
import cursor from '../assets/agents/cursor.svg?no-inline'
import deepagents from '../assets/agents/deepagents.svg?no-inline'
import devin from '../assets/agents/devin.svg?no-inline'
import epicat from '../assets/agents/epicat.svg?no-inline'
import fx from '../assets/agents/fx.svg?no-inline'
import grok from '../assets/agents/grok.svg?no-inline'
import hermes from '../assets/agents/hermes.svg?no-inline'
import junie from '../assets/agents/junie.svg?no-inline'
import opencode from '../assets/agents/opencode-wordmark.svg?no-inline'
import pi from '../assets/agents/pi.svg?no-inline'

/*
 * Tailark's logo cloud 1 as the landing's "Works with": five columns as wide as the page's content, taking turns between
 * the most used coding agents and the next ones Dojo can run on (ACP agents among them), fifteen in all. Every mark in one ink, the text's color
 * (mono, light and dark); a mark without the name in it carries the name beside it.
 */

type Agent = { name: string; svg: string; ratio: number; height: number; label?: boolean }

const agents = {
    antigravity: { name: 'Antigravity', svg: antigravity, ratio: 5.31208333, height: 22 },
    claude: { name: 'Claude Code', svg: claude, ratio: 4.65454545, height: 22 },
    cline: { name: 'Cline', svg: cline, ratio: 4.91666667, height: 18 },
    codex: { name: 'Codex', svg: codex, ratio: 4.43333333, height: 24 },
    copilot: { name: 'Copilot', svg: copilot, ratio: 1.00000000, height: 25, label: true },
    cursor: { name: 'Cursor', svg: cursor, ratio: 4.76146789, height: 20 },
    deepagents: { name: 'deepagents', svg: deepagents, ratio: 7.11310886, height: 21 },
    devin: { name: 'Devin', svg: devin, ratio: 3.80000000, height: 22 },
    epicat: { name: 'Epicat', svg: epicat, ratio: 4.37500000, height: 23 },
    fx: { name: 'FX', svg: fx, ratio: 0.99910897, height: 22 },
    grok: { name: 'Grok', svg: grok, ratio: 2.66666667, height: 28 },
    hermes: { name: 'Hermes Agent', svg: hermes, ratio: 3.05180000, height: 32 },
    junie: { name: 'Junie', svg: junie, ratio: 4.50000000, height: 18 },
    opencode: { name: 'OpenCode', svg: opencode, ratio: 5.57391304, height: 18 },
    pi: { name: 'Pi', svg: pi, ratio: 1.00000000, height: 29 },
} satisfies Record<string, Agent>

/** Five each, one per column; a column cycles through its kind: the CLIs, the IDEs, the open-source agents, the
    automation harnesses, then the rest */
const groups: Agent[][] = [
    [agents.codex, agents.copilot, agents.devin, agents.cline, agents.grok],
    [agents.claude, agents.cursor, agents.hermes, agents.deepagents, agents.pi],
    [agents.opencode, agents.antigravity, agents.epicat, agents.junie, agents.fx],
]

/** On a phone three columns, so five turns of three: each turn one of every kind, a little quicker */
const narrowGroups: Agent[][] = groups[0].map((_, i) => groups.map((group) => group[i]))
const NARROW = '(max-width: 640px)'



export default function LogoCloud() {
    const [current, setCurrent] = useState(0)
    const [narrow, setNarrow] = useState(false)
    const pages = narrow ? narrowGroups : groups

    useEffect(() => {
        const query = window.matchMedia(NARROW)
        const update = () => {
            setNarrow(query.matches)
            setCurrent(0)
        }
        update()
        query.addEventListener('change', update)
        return () => query.removeEventListener('change', update)
    }, [])

    useEffect(() => {
        const interval = setInterval(() => setCurrent((prev) => (prev + 1) % pages.length), narrow ? 4000 : 6000)
        return () => clearInterval(interval)
    }, [narrow, pages.length])

    return (
        <LazyMotion features={loadMotionFeatures}>
            <MotionConfig reducedMotion="user">
                <style href="ui-logo-cloud" precedence="default">{css}</style>
                <ul className="ui-logos" aria-label="Agents Dojo works with">
                    <AnimatePresence
                        initial={false}
                        mode="popLayout">
                        {pages[current].map((agent, i) => (
                            <m.li
                                key={`${current}-${agent.name}`}
                                className="ui-logos__item"
                                initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: -24, filter: 'blur(6px)', scale: 0.5 }}
                                transition={{ delay: i * 0.05, duration: 0.4 }}>
                                <span
                                    role="img"
                                    aria-label={agent.name}
                                    className="ui-logos__mark"
                                    style={{
                                        "--agent-height": `${agent.height}px`,
                                        "--agent-ratio": agent.ratio,
                                        maskImage: `url("${agent.svg}")`,
                                    } as CSSProperties}
                                />
                                {agent.label && <span className="ui-logos__name" aria-hidden="true">{agent.name}</span>}
                            </m.li>
                        ))}
                    </AnimatePresence>
                </ul>
            </MotionConfig>
        </LazyMotion>
    )
}

const css = /* css */ `
/* Five columns of one width across the page, a mark centered in each */
.ui-logos { perspective: 1200px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center; width: 100%; max-width: 1264px; min-height: 40px; margin: 0; padding: 0; list-style: none; }
.ui-logos__item { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; height: 40px; padding: 0 8px; color: var(--ink); opacity: 0.8; }
.ui-logos__name { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
/* One ink: every shape takes the text's color, whatever the brand file paints it */
.ui-logos__mark { --logo-height: var(--agent-height); display: block; flex: none; width: calc(var(--logo-height) * var(--agent-ratio)); height: var(--logo-height); max-width: 100%; background: currentColor; mask-size: contain; mask-position: center; mask-repeat: no-repeat; }
/* Narrow, three columns (the turns regroup), the marks shrink to their column and the names give way */
@media (max-width: 640px) {
    .ui-logos { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .ui-logos__item { padding: 0 4px; }
    .ui-logos__mark { --logo-height: min(var(--agent-height), 22px); flex: 0 1 auto; }
    .ui-logos__name { display: none; }
}
`
