import { useEffect, useState } from 'react'
import type { AgentStatus } from '@shared/agent'
import { host } from './host'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { StartScreen } from './screens/StartScreen'

type Screen = { name: 'loading' } | { name: 'onboarding'; status: AgentStatus } | { name: 'start' }

// Screens: onboarding (02), Start (01, 03, 04), Project (03), Editor (05+), Settings (16).
export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })

  // Onboarding only shows while Claude Code is missing or signed out.
  useEffect(() => {
    void host.call('agent.detect').then(
      (status) => setScreen(status.installed && status.signedIn ? { name: 'start' } : { name: 'onboarding', status }),
      () => setScreen({ name: 'onboarding', status: { installed: false, signedIn: false } }),
    )
  }, [])

  return (
    <div className="flex h-full flex-col bg-shell">
      {/* The macOS traffic lights sit in this draggable strip. */}
      <div className="app-drag h-9 flex-none" />
      {screen.name === 'onboarding' && (
        <OnboardingScreen initial={screen.status} onContinue={() => setScreen({ name: 'start' })} />
      )}
      {screen.name === 'start' && <StartScreen />}
    </div>
  )
}
