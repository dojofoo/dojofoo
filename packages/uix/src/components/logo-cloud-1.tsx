'use client'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react'
import { useEffect, useState } from 'react'
import antigravity from '../assets/agents/antigravity.svg?raw'
import claude from '../assets/agents/claude-wordmark-light.svg?raw'
import cline from '../assets/agents/cline.svg?raw'
import codex from '../assets/agents/codex.svg?raw'
import copilot from '../assets/agents/github-copilot.svg?raw'
import cursor from '../assets/agents/cursor.svg?raw'
import deepagents from '../assets/agents/deepagents.svg?raw'
import devin from '../assets/agents/devin.svg?raw'
import epicat from '../assets/agents/epicat.svg?raw'
import fx from '../assets/agents/fx.svg?raw'
import grok from '../assets/agents/grok.svg?raw'
import hermes from '../assets/agents/hermes.svg?raw'
import junie from '../assets/agents/junie.svg?raw'
import opencode from '../assets/agents/opencode-wordmark.svg?raw'
import pi from '../assets/agents/pi.svg?raw'

/*
 * Tailark's logo cloud 1 as the landing's "Works with": five columns as wide as the page's content, taking turns between
 * the most used coding agents and the next ones Dojo can run on (ACP agents among them), fifteen in all. Every mark in one ink, the text's color
 * (mono, light and dark); a mark without the name in it carries the name beside it.
 */

type Agent = { name: string; svg: string; height: number; label?: boolean }

const agents = {
    antigravity: { name: 'Antigravity', svg: antigravity, height: 22 },
    claude: { name: 'Claude Code', svg: claude, height: 22 },
    cline: { name: 'Cline', svg: cline, height: 18 },
    codex: { name: 'Codex', svg: codex, height: 24 },
    copilot: { name: 'Copilot', svg: copilot, height: 25, label: true },
    cursor: { name: 'Cursor', svg: cursor, height: 20 },
    deepagents: { name: 'deepagents', svg: deepagents, height: 21 },
    devin: { name: 'Devin', svg: devin, height: 22 },
    epicat: { name: 'Epicat', svg: epicat, height: 23 },
    fx: { name: 'FX', svg: fx, height: 22 },
    grok: { name: 'Grok', svg: grok, height: 28 },
    hermes: { name: 'Hermes Agent', svg: hermes, height: 32 },
    junie: { name: 'Junie', svg: junie, height: 18 },
    opencode: { name: 'OpenCode', svg: opencode, height: 18 },
    pi: { name: 'Pi', svg: pi, height: 29 },
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

/** The brand files' own <title>s out: the label names the mark, and a page's crawlers shouldn't read them as its title */
const untitled = (svg: string) => svg.replace(/<title>[\s\S]*?<\/title>/g, '')

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
        <LazyMotion features={domAnimation}>
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
                                    style={{ height: agent.height }}
                                    dangerouslySetInnerHTML={{ __html: untitled(agent.svg) }}
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
.ui-logos__mark { display: block; flex: none; max-width: 100%; }
.ui-logos__mark svg { display: block; width: auto; max-width: 100%; height: 100%; }
.ui-logos__mark svg :is(path, circle, rect, polygon, ellipse):not([fill="none"]) { fill: currentColor !important; }
.ui-logos__mark svg [style*="fill"] { fill: currentColor !important; }
/* Narrow, three columns (the turns regroup), the marks shrink to their column and the names give way */
@media (max-width: 640px) {
    .ui-logos { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .ui-logos__item { padding: 0 4px; }
    .ui-logos__mark { flex: 0 1 auto; max-height: 22px; }
    .ui-logos__name { display: none; }
}
`
