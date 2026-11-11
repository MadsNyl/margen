import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Annotation, ModelChoice, TurnInput } from '@shared/agent'
import { host, useHostValue } from '../host'
import { useSession } from './session'

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
  /** The model and effort the next Turn uses: the last chosen, in any Document. */
  choice: ModelChoice
  setChoice(choice: ModelChoice): void
  /** Adds an Annotation, numbered next in the Session, and opens its comment box. */
  add(id: string, annotation: Omit<Annotation, 'number'>): void
  /** Changes a pending Annotation in place (a drawing's strokes, targets and screenshots). */
  update(id: string, change: Partial<Annotation>): void
  /** Holds back the next send until `work` (a drawing's screenshots) has finished. */
  waitFor(work: Promise<unknown>): void
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
  const [forDocument, setForDocument] = useState(document)
  if (forDocument !== document) {
    setForDocument(document)
    setText('')
    setAnnotations([])
    setOpen(null)
    setFading([])
    setLastSent([])
  }
  const choice = useHostValue('model.choice', 'model.changed') ?? NO_CHOICE
  const setChoice = useCallback((next: ModelChoice) => void host.call('model.setChoice', next).catch(() => {}), [])
  // Annotations are numbered per Session, after the highest it has used: sent, queued, or sent and not back from the host yet.
  const session = useSession(document)
  const queue = useHostValue('session.queue', 'session.queue')
  const used = Math.max(
    0,
    ...(session?.entries ?? []).flatMap((entry) => (entry.type === 'user' ? numbers(entry.turn) : [])),
    ...(queue?.document === document ? queue.messages.flatMap((message) => numbers(message.turn)) : []),
  )
  const justSent = useRef<{ session?: string; number: number }>({ number: 0 })
  const state = useRef({ text, annotations, choice, used, session: session?.id })
  useLayoutEffect(() => {
    state.current = { text, annotations, choice, used, session: session?.id }
  })

  const add = useCallback((id: string, annotation: Omit<Annotation, 'number'>) => {
    const { annotations, used, session } = state.current
    const sent = justSent.current.session === session ? justSent.current.number : 0
    const number = Math.max(used, sent, ...annotations.map((p) => p.annotation.number)) + 1
    const pending = { id, annotation: { ...annotation, number } as Annotation }
    state.current = { ...state.current, annotations: [...annotations, pending] }
    setAnnotations((list) => [...list, pending])
    setOpen(id)
  }, [])

  const update = useCallback((id: string, change: Partial<Annotation>) => {
    const apply = (list: PendingAnnotation[]) => list.map((p) => (p.id === id ? { ...p, annotation: { ...p.annotation, ...change } as Annotation } : p))
    // At once too, so a send waiting on this change sends it before React renders.
    state.current = { ...state.current, annotations: apply(state.current.annotations) }
    setAnnotations(apply)
  }, [])

  const working = useRef(new Set<Promise<unknown>>())
  const waitFor = useCallback((work: Promise<unknown>) => {
    const settled = work.catch(() => {}).finally(() => working.current.delete(settled))
    working.current.add(settled)
  }, [])

  const setComment = useCallback((id: string, comment: string) => {
    setAnnotations((list) => list.map((p) => (p.id === id ? { ...p, annotation: { ...p.annotation, comment } } : p)))
  }, [])

  const remove = useCallback((id: string) => {
    setAnnotations((list) => list.filter((p) => p.id !== id))
    setOpen((current) => (current === id ? null : current))
  }, [])

  const sendNow = useCallback(() => {
    const { text, annotations, choice, session } = state.current
    if (!text.trim() && annotations.length === 0) return
    const before = justSent.current.session === session ? justSent.current.number : 0
    justSent.current = { session, number: Math.max(before, ...annotations.map((p) => p.annotation.number)) }
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

  const send = useCallback(() => {
    if (working.current.size === 0) return sendNow()
    void Promise.all(working.current).then(sendNow)
  }, [sendNow])

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
      update,
      waitFor,
      setComment,
      setOpen,
      remove,
      hasContent: text.trim() !== '' || annotations.length > 0,
      send,
    }),
    [text, annotations, open, fading, lastSent, choice, setChoice, add, update, waitFor, setComment, remove, send],
  )
  return <DraftContext.Provider value={draft}>{children}</DraftContext.Provider>
}

const NO_CHOICE: ModelChoice = {}

const numbers = (turn: TurnInput) => turn.annotations.map((annotation) => annotation.number)

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
