import { useId, useState, type ReactNode } from 'react'
import type { AgentSetupResult, AgentStatus } from '@shared/agent'
import { Brand } from '../components/Brand'
import { host } from '../host'

type StepState = 'missing' | 'working' | 'done' | 'failed'

/** One onboarding step's run: idle, running, or ended in failure. */
interface Run {
  working: boolean
  error?: string
}

export function OnboardingScreen(props: { initial: AgentStatus; onContinue: () => void }) {
  const [status, setStatus] = useState(props.initial)
  const [install, setInstall] = useState<Run>({ working: false })
  const [signIn, setSignIn] = useState<Run>({ working: false })

  async function runStep(call: 'agent.install' | 'agent.signIn', setRun: (run: Run) => void) {
    setRun({ working: true })
    let result: AgentSetupResult
    try {
      result = await host.call(call)
    } catch (error) {
      setRun({ working: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
    setStatus(result.status)
    // Cancelled is back to how the step was before.
    setRun(result.ok || result.cancelled ? { working: false } : { working: false, error: result.message })
  }

  const installState = stepState(status.installed, install)
  const signInState = stepState(status.installed && status.signedIn, signIn)

  return (
    <main className="relative mx-2 mb-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
      <div className="grain-banner" aria-hidden />
      <header className="relative z-10 flex h-12 flex-none items-center px-3">
        <Brand />
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-[72px] pb-[60px]">
          <h1 className="m-0 text-center text-[44px] leading-[1.15] font-light tracking-[-0.025em]">
            Point at it. Circle it.
            <br />
            <span className="font-normal">Make it real.</span>
          </h1>
          <p className="mt-3.5 mb-0 text-center text-[15px] leading-[1.55] font-light text-tx2">
            Margen uses your own Claude Code and your own subscription.
            <br />
            You sign in with Claude's official tool, so Margen never sees your login.
          </p>

          <div className="mt-10 w-[540px] animate-[rise_.7s_cubic-bezier(.2,.7,.2,1)_both] overflow-hidden rounded-[22px] border border-line bg-card shadow-[0_10px_40px_-12px_rgba(0,0,0,.14)]">
            <Step
              number={1}
              title="Claude Code"
              state={installState}
              action={installState === 'failed' ? 'Try again' : 'Install'}
              actionPrimary
              onAction={() => void runStep('agent.install', setInstall)}
            >
              {installState === 'missing' && 'Not found on this Mac.'}
              {installState === 'working' && 'Running the official installer…'}
              {installState === 'failed' && <>Install failed: {install.error}</>}
              {installState === 'done' && (
                <>
                  Found{status.path && <> <Code>{status.path}</Code></>}
                  {status.version && <> · v{status.version}</>}
                </>
              )}
            </Step>
            <Step
              number={2}
              title="Sign in to Claude"
              state={signInState}
              action={signInState === 'failed' ? 'Try again' : 'Sign in'}
              actionPrimary={status.installed}
              actionDisabled={!status.installed}
              onAction={() => void runStep('agent.signIn', setSignIn)}
              onCancel={() => void host.call('agent.cancelSignIn')}
            >
              {signInState === 'missing' && (
                <>
                  Opens Terminal and runs <Code>claude auth login</Code>.
                </>
              )}
              {signInState === 'working' && 'Finish signing in in the Terminal window…'}
              {signInState === 'failed' && <>{signIn.error} Run Sign in again once you've finished in Terminal.</>}
              {signInState === 'done' && (status.plan ? `Signed in · ${planName(status.plan)}` : 'Signed in')}
            </Step>
          </div>
          <div className="mt-[18px] flex w-[540px] justify-end">
            <button
              className="btn btn-primary"
              disabled={installState !== 'done' || signInState !== 'done'}
              onClick={props.onContinue}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

function stepState(done: boolean, run: Run): StepState {
  if (run.working) return 'working'
  if (done) return 'done'
  return run.error ? 'failed' : 'missing'
}

/** `claude auth status` reports the plan as e.g. "max"; show it as "Claude Max". */
function planName(plan: string): string {
  return `Claude ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`
}

const markClass: Record<StepState, string> = {
  missing: 'border-[1.5px] border-dashed border-[#d4d4d8] text-tx3',
  working: 'animate-spin border-[1.5px] border-[#e4e4e7] border-t-primary',
  done: 'bg-mint font-semibold text-mint-strong',
  failed: 'border-[1.5px] border-ink text-ink',
}

function Step(props: {
  number: number
  title: string
  state: StepState
  action: string
  actionPrimary?: boolean
  actionDisabled?: boolean
  onAction: () => void
  /** While working, a Cancel in place of the action. */
  onCancel?: () => void
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-state={props.state}
      className="grid grid-cols-[28px_1fr_auto] items-center gap-3.5 border-t border-border px-5 py-[18px] first:border-t-0"
    >
      <div className={`grid size-[26px] place-items-center rounded-full text-[11.5px] ${markClass[props.state]}`} aria-hidden>
        {props.state === 'done' ? '✓' : props.state === 'working' ? '' : props.number}
      </div>
      <div className="min-w-0">
        <h4 id={titleId} className="m-0 mb-[3px] text-sm font-medium">
          {props.title}
        </h4>
        <small className="block text-[12.5px] leading-[1.45] break-words text-tx2">{props.children}</small>
      </div>
      {props.state === 'working' && props.onCancel ? (
        <button className="btn" onClick={props.onCancel}>
          Cancel
        </button>
      ) : props.state !== 'done' ? (
        <button
          className={`btn ${props.actionPrimary ? 'btn-primary' : ''} ${props.state === 'working' ? 'invisible' : ''}`}
          disabled={props.actionDisabled}
          onClick={props.onAction}
        >
          {props.action}
        </button>
      ) : null}
    </div>
  )
}

function Code(props: { children: ReactNode }) {
  return <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[11px]">{props.children}</code>
}
