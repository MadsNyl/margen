import { StartScreen } from './screens/StartScreen'

// Screens: onboarding (02), Start (01, 03, 04), Project (03), Editor (05+), Settings (16).
export function App() {
  return (
    <div className="flex h-full flex-col bg-shell">
      {/* The macOS traffic lights sit in this draggable strip. */}
      <div className="app-drag h-9 flex-none" />
      <StartScreen />
    </div>
  )
}
