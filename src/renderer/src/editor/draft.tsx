import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Annotation, TurnInput } from '@shared/agent'
import { host } from '../host'
import type { ModelChoice } from './ModelPicker'

// The Composer's draft: the message text and the Annotations collected for it.
// The chat panel's input, the chips, the markers on the Document and the comment
// box next to the newest Annotation all show this one draft.

/** An Annotation waiting to be sent. `id` is how the Document view follows its element. */
export interface PendingAnnotation {
  id: string
  annotation: Annotation
}

export interface Draft {
  text: string
  annotations: PendingAnnotation[]
  /** The Annotation whose comment box is open. */
  open: string | null
  /** Just sent: their markers are fading from the Document. */
  fading: PendingAnnotation[]
  /** The Annotations of the last Turn sent, for the glow after the Document reloads. */
  lastSent: PendingAnnotation[]
  setText(text: string): void
  /** The model and effort the next Turn uses. */
  choice: ModelChoice
  setChoice(choice: ModelChoice): void
  /** Adds an Annotation, numbered next, and opens its comment box. */
  add(id: string, annotation: Omit<Annotation, 'number'>): void
  setComment(id: string, comment: string): void
  /** Opens an Annotation's comment box, or closes it with `null`. */
  setOpen(id: string | null): void
  remove(id: string): void
  hasContent: boolean
  /** Sends the draft as one Turn. If the host refuses it, the draft comes back. */
  send(): void
}

const FADE_MS = 650

const DraftContext = createContext<Draft | null>(null)

export function useDraft(): Draft {
  const draft = useContext(DraftContext)
  if (!draft) throw new Error('useDraft is only for inside the editor')
  return draft
}

/** The draft for the open Document. Switching Documents starts an empty one. */
export function DraftProvider({ document, children }: { document: string; children: ReactNode }) {
  const [text, setText] = useState('')
  const [annotations, setAnnotations] = useState<PendingAnnotation[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [fading, setFading] = useState<PendingAnnotation[]>([])
  const [lastSent, setLastSent] = useState<PendingAnnotation[]>([])
  const [choice, setChoice] = useState<ModelChoice>({})
  const [forDocument, setForDocument] = useState(document)
  if (forDocument !== document) {
    setForDocument(document)
    setText('')
    setAnnotations([])
    setOpen(null)
    setFading([])
    setLastSent([])
    setChoice({})
  }
  const next = useRef(1)
  useEffect(() => {
    next.current = 1
  }, [document])
  const state = useRef({ text, annotations, choice })
  useLayoutEffect(() => {
    state.current = { text, annotations, choice }
  })

  const add = useCallback((id: string, annotation: Omit<Annotation, 'number'>) => {
    const pending = { id, annotation: { ...annotation, number: next.current++ } as Annotation }
    setAnnotations((list) => [...list, pending])
    setOpen(id)
  }, [])

  const setComment = useCallback((id: string, comment: string) => {
    setAnnotations((list) => list.map((p) => (p.id === id ? { ...p, annotation: { ...p.annotation, comment } } : p)))
  }, [])

  const remove = useCallback((id: string) => {
    setAnnotations((list) => list.filter((p) => p.id !== id))
    setOpen((current) => (current === id ? null : current))
  }, [])

  const send = useCallback(() => {
    const { text, annotations, choice } = state.current
    if (!text.trim() && annotations.length === 0) return
    const turn: TurnInput = {
      text: text.trim(),
      annotations: annotations.map((p) => p.annotation),
      ...(choice.model && { model: choice.model }),
      ...(choice.effort && { effort: choice.effort }),
    }
    setText('')
    setAnnotations([])
    setOpen(null)
    setFading(annotations)
    setTimeout(() => setFading((list) => list.filter((p) => !annotations.includes(p))), FADE_MS)
    host.call('session.send', turn).then(
      () => setLastSent(annotations),
      () => {
        setText((now) => now || text)
        setAnnotations((now) => [...annotations, ...now])
      },
    )
  }, [])

  const draft = useMemo<Draft>(
    () => ({
      text,
      annotations,
      open,
      fading,
      lastSent,
      setText,
      choice,
      setChoice,
      add,
      setComment,
      setOpen,
      remove,
      hasContent: text.trim() !== '' || annotations.length > 0,
      send,
    }),
    [text, annotations, open, fading, lastSent, choice, add, setComment, remove, send],
  )
  return <DraftContext.Provider value={draft}>{children}</DraftContext.Provider>
}

/** The short label for an element in chips and the chat: its selector's last two steps, `section.hero › h1`. */
export function labelOf(selector: string): string {
  return selector.split(' > ').slice(-2).join(' › ')
}

/** What an Annotation points at, as a label. */
export function annotationLabel(annotation: Annotation): string {
  if (annotation.kind === 'pick') return labelOf(annotation.selector)
  const [first] = annotation.targets
  if (!first) return 'empty space'
  return annotation.targets.length === 1 ? labelOf(first.selector) : `${annotation.targets.length} elements`
}
