import { useEffect } from 'react'
import { host, useHostValue } from './host'
import { ProjectPage } from './screens/ProjectPage'
import { StartScreen } from './screens/StartScreen'

// Screens: onboarding (02), Start (01, 03, 04), Project (03), Editor (05+), Settings (16).
export function App() {
  const project = useHostValue('projects.current', 'projects.changed')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void host.call('projects.choose')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col bg-shell">
      {/* The macOS traffic lights sit in this draggable strip. */}
      <div className="app-drag h-9 flex-none" />
      {project === undefined ? null : project ? <ProjectPage key={project.path} project={project} /> : <StartScreen />}
    </div>
  )
}
