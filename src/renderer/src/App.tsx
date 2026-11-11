import { useEffect, useState } from 'react'
import type { AgentStatus } from '@shared/agent'
import { host, useHostValue } from './host'
import { EditorScreen } from './screens/EditorScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { ProjectPage } from './screens/ProjectPage'
import { StartScreen } from './screens/StartScreen'

type Screen = { name: 'loading' } | { name: 'onboarding'; status: AgentStatus } | { name: 'start' }

// Screens: onboarding (02), Start (01, 03, 04), Project (03), Editor (05+), Settings (16).
export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })
  const project = useHostValue('projects.current', 'projects.changed')
  const document = useHostValue('document.current', 'document.opened')
  const ready = screen.name === 'start'

  // Onboarding only shows while Claude Code is missing or signed out.
  useEffect(() => {
    void host.call('agent.detect').then(
      (status) => setScreen(status.installed && status.signedIn ? { name: 'start' } : { name: 'onboarding', status }),
      () => setScreen({ name: 'onboarding', status: { installed: false, signedIn: false } }),
    )
  }, [])

  // ⌘O opens a folder from the Start screen and the Project page.
  useEffect(() => {
    if (!ready) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void host.call('projects.choose')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready])

  return (
    <div className="flex h-full flex-col bg-shell">
      {/* The macOS traffic lights sit in this draggable strip. */}
      <div className="app-drag h-9 flex-none" />
      {screen.name === 'onboarding' && (
        <OnboardingScreen initial={screen.status} onContinue={() => setScreen({ name: 'start' })} />
      )}
      {ready &&
        project !== undefined &&
        (!project ? (
          <StartScreen />
        ) : document ? (
          <EditorScreen project={project} document={document} />
        ) : (
          <ProjectPage key={project.path} project={project} />
        ))}
    </div>
  )
}
