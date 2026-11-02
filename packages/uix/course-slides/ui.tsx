import { createElement, useId, useState, type ElementType } from 'react'
import { UIXProvider } from '@dojofoo/uix/provider'
import { ShellStyles } from '@dojofoo/uix/components/app-shell'
import { Button } from '@dojofoo/uix/components/button'
import { Input } from '@dojofoo/uix/components/input'
import { Label } from '@dojofoo/uix/components/label'
import type { CourseSlideState } from './types'

function Question({ state, onAnswer }: { state: CourseSlideState; onAnswer(answer: string): void }) {
  const [answer, setAnswer] = useState('')
  const id = useId()
  const submit = () => { if (answer.trim() && !state.busy) onAnswer(answer) }
  return <>
    {state.response && <div role="status" className="dojo-feedback">
      <p>{state.response.correct ? 'Correct' : 'Not quite'}: {state.response.answer}</p>
      <p>{state.response.correct ? state.current?.explanation : 'Try again. You can ask Sensei for a hint.'}</p>
    </div>}
    {!state.response?.correct && <div role="group" aria-label="Checkpoint answer">
      <Label htmlFor={id} className="dojo-question__label">Your answer</Label>
      <div className="dojo-answer-row">
        <Input id={id} value={answer} onChange={event => setAnswer(event.target.value)} autoComplete="off" disabled={state.busy}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }} />
        <Button disabled={state.busy || !answer.trim()} onClick={submit}>Check answer</Button>
      </div>
    </div>}
  </>
}

// Authored Slidev components can mount the same React components as the dashboard.
const components = { Question, Button, Input, Label }
export type SlideComponentName = keyof typeof components
export function renderSlideComponent(name: SlideComponentName, props: Record<string, unknown>) {
  return <UIXProvider mode="dark"><ShellStyles /><div className="ui-as">
    {createElement(components[name] as ElementType, props)}
  </div></UIXProvider>
}
