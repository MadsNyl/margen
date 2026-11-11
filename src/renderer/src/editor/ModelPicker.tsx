import type { Effort } from '@shared/agent'
import { Menu, MenuHeading, MenuItem, useDropdown } from '../components/Menu'

/** The model and effort the next Turns use. Left out, Claude Code's own default. */
export interface ModelChoice {
  model?: string
  effort?: Effort
}

const MODELS = [
  { label: 'Default model', value: undefined },
  { label: 'Opus', value: 'opus' },
  { label: 'Sonnet', value: 'sonnet' },
  { label: 'Haiku', value: 'haiku' },
]

const EFFORTS: { label: string; value: Effort | undefined }[] = [
  { label: 'Default effort', value: undefined },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Max', value: 'max' },
]

/** The Composer's model and effort menu (user story 74). */
export function ModelPicker({ value, onChange }: { value: ModelChoice; onChange: (choice: ModelChoice) => void }) {
  const { open, setOpen, ref } = useDropdown()
  const model = MODELS.find((m) => m.value === value.model)?.label ?? value.model
  const effort = EFFORTS.find((e) => e.value === value.effort && e.value)?.label
  const pick = (choice: ModelChoice) => {
    onChange({ ...value, ...choice })
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Model and effort"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12px] text-tx2 hover:bg-black/[.04] hover:text-tx"
        onClick={() => setOpen(!open)}
      >
        {effort ? `${model} · ${effort}` : model}
      </button>
      {open && (
        <Menu className="bottom-full left-0 mb-2 w-[220px]">
          <MenuHeading>Model</MenuHeading>
          {MODELS.map(({ label, value: model }) => (
            <MenuItem key={label} current={model === value.model} onClick={() => pick({ model })}>
              {label}
            </MenuItem>
          ))}
          <hr className="my-1 border-border" />
          <MenuHeading>Effort</MenuHeading>
          {EFFORTS.map(({ label, value: effort }) => (
            <MenuItem key={label} current={effort === value.effort} onClick={() => pick({ effort })}>
              {label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  )
}
