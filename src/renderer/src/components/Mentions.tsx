import { useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react'
import type { DocumentInfo } from '@shared/host-api'
import { TEMPLATES, type TemplateInfo } from '@shared/templates'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, HtmlFileIcon, SmallFolderIcon, TemplateIcon } from './icons'

// The `@` popover of the Project page's chat bar and the editor's New Document.
// A bare `@` shows two folders, Documents and Templates: ↑/↓ move, → or ↵ opens
// a folder (the Project's subfolders too), ← or Backspace goes back up, ↵
// chooses. Typing after the `@` skips the folders and filters everything.
// A Document goes into the text as `@path`; a Template becomes a chip, which
// the bar shows and sends along on its own.

/** Where the popover is: the root (the two folders), Templates, or a folder of Documents (`''` for the top, else `dir/`). */
type Place = { in: 'root' } | { in: 'templates' } | { in: 'documents'; dir: string }

type Item =
  | { kind: 'folder'; name: string; to: Place }
  | { kind: 'document'; doc: DocumentInfo }
  | { kind: 'template'; template: TemplateInfo }

/** The `@word` the caret is in, if any: where it starts and what follows the `@`. */
function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|\s)@(\S*)$/.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caret - query.length - 1, query }
}

function itemsIn(place: Place, documents: DocumentInfo[]): Item[] {
  if (place.in === 'root') {
    return [
      { kind: 'folder', name: 'Documents', to: { in: 'documents', dir: '' } },
      { kind: 'folder', name: 'Templates', to: { in: 'templates' } },
    ]
  }
  if (place.in === 'templates') return TEMPLATES.map((template) => ({ kind: 'template', template }))
  const { dir } = place
  const folders = [
    ...new Set(documents.filter((doc) => doc.dir.startsWith(dir) && doc.dir !== dir).map((doc) => doc.dir.slice(dir.length).split('/')[0] ?? '')),
  ]
    .sort()
    .map((name): Item => ({ kind: 'folder', name, to: { in: 'documents', dir: `${dir}${name}/` } }))
  return [...folders, ...documents.filter((doc) => doc.dir === dir).map((doc): Item => ({ kind: 'document', doc }))]
}

function matching(query: string, documents: DocumentInfo[]): Item[] {
  const q = query.toLowerCase()
  return [
    ...documents.filter((doc) => doc.path.toLowerCase().includes(q)).map((doc): Item => ({ kind: 'document', doc })),
    ...TEMPLATES.filter((template) => template.name.toLowerCase().includes(q)).map((template): Item => ({ kind: 'template', template })),
  ]
}

/** One level up, and the folder to highlight there (the one just left). */
function up(place: Place): { place: Place; from: string } {
  if (place.in === 'templates') return { place: { in: 'root' }, from: 'Templates' }
  if (place.in === 'documents' && place.dir) {
    const parts = place.dir.split('/').slice(0, -1)
    const from = parts.pop() ?? ''
    return { place: { in: 'documents', dir: parts.length ? `${parts.join('/')}/` : '' }, from }
  }
  return { place: { in: 'root' }, from: 'Documents' }
}

function placeName(place: Place): string {
  if (place.in === 'templates') return 'Templates'
  if (place.in === 'documents') return place.dir ? `Documents / ${place.dir.slice(0, -1).split('/').join(' / ')}` : 'Documents'
  return ''
}

type Field = HTMLInputElement | HTMLTextAreaElement

export interface MentionsOptions {
  id: string
  text: string
  setText(text: string): void
  documents: DocumentInfo[]
  /** A Template was chosen: its `@query` is out of the text already. */
  onTemplate(template: TemplateInfo): void
  field: RefObject<Field | null>
}

export function useMentions({ id, text, setText, documents, onTemplate, field }: MentionsOptions) {
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  /** The folder open in the popover, for the `@` starting at `start`; another `@` starts at the root. */
  const [at, setAt] = useState<{ start: number; place: Place }>({ start: -1, place: { in: 'root' } })
  // Where to put the caret once a choice has changed the text.
  const placeCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (placeCaret.current === null) return
    field.current?.setSelectionRange(placeCaret.current, placeCaret.current)
    placeCaret.current = null
  }, [text, field])

  const mention = dismissed ? null : mentionAt(text, caret)
  const place: Place = mention && at.start === mention.start ? at.place : { in: 'root' }
  const items = !mention ? [] : mention.query ? matching(mention.query, documents) : itemsIn(place, documents)
  // Filtering hides the popover when nothing matches; an empty folder still shows, saying so.
  const open = mention !== null && (items.length > 0 || (!mention.query && place.in !== 'root'))
  const highlighted = Math.max(0, Math.min(active, items.length - 1))

  function edit(value: string, to: number) {
    setText(value)
    setCaret(to)
    setActive(0)
    setDismissed(false)
    placeCaret.current = to
  }

  function go(next: Place, highlight = 0) {
    if (!mention) return
    setAt({ start: mention.start, place: next })
    setActive(highlight)
  }

  function choose(item: Item) {
    if (!mention) return
    if (item.kind === 'folder') return go(item.to)
    const rest = text.slice(caret).replace(/^\S*\s?/, '')
    if (item.kind === 'template') {
      edit(text.slice(0, mention.start) + rest, mention.start)
      onTemplate(item.template)
      return
    }
    const before = `${text.slice(0, mention.start)}@${item.doc.path} `
    edit(before + rest, before.length)
  }

  function goUp() {
    const { place: next, from } = up(place)
    go(
      next,
      Math.max(
        0,
        itemsIn(next, documents).findIndex((item) => item.kind === 'folder' && item.name === from),
      ),
    )
  }

  /** Handles a key for the popover while it's open; true when it did, so the field does nothing else with it. */
  function onKeyDown(event: KeyboardEvent<Field>): boolean {
    if (!open || !mention) return false
    const item = items[highlighted]
    const handled = (() => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          if (items.length) setActive((highlighted + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
          return true
        case 'ArrowRight':
          if (item?.kind !== 'folder') return false
          choose(item)
          return true
        case 'Enter':
        case 'Tab':
          if (item) choose(item)
          return true
        case 'ArrowLeft':
        case 'Backspace':
          if (mention.query || place.in === 'root') return false
          goUp()
          return true
        case 'Escape':
          setDismissed(true)
          return true
        default:
          return false
      }
    })()
    if (handled) event.preventDefault()
    return handled
  }

  const optionId = (index: number) => `${id}-option-${index}`

  return {
    onKeyDown,
    fieldProps: {
      'aria-controls': open ? id : undefined,
      'aria-activedescendant': open && items.length ? optionId(highlighted) : undefined,
      onChange(event: ChangeEvent<Field>) {
        const { value, selectionStart } = event.target
        setText(value)
        setCaret(selectionStart ?? value.length)
        setActive(0)
        setDismissed(false)
        // Typing skips the folders: emptied again, the `@` starts at the root.
        setAt({ start: -1, place: { in: 'root' } })
      },
      onSelect: (event: { currentTarget: Field }) => setCaret(event.currentTarget.selectionStart ?? 0),
      onBlur: () => setDismissed(true),
      onFocus: () => setDismissed(false),
    },
    popover: open && (
      <div className="w-72 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,.2)]">
        {!mention?.query && place.in !== 'root' && (
          <button
            type="button"
            tabIndex={-1}
            className="flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-tx3 hover:text-tx"
            onMouseDown={(event) => event.preventDefault()}
            onClick={goUp}
          >
            <ChevronLeftIcon />
            <span className="truncate">{placeName(place)}</span>
          </button>
        )}
        <ul id={id} role="listbox" aria-label="Mentions" className="m-0 max-h-64 list-none overflow-y-auto p-0">
          {items.map((item, index) => (
            <li
              key={item.kind === 'document' ? item.doc.path : item.kind === 'template' ? `template:${item.template.id}` : `folder:${item.name}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlighted}
              className={`flex h-8 cursor-default items-center gap-2 rounded-lg px-2.5 text-[13px] ${index === highlighted ? 'bg-muted' : ''}`}
              // Only a mouse that really moves: the list opening under a still cursor mustn't undo ↑/↓.
              onMouseMove={(event) => {
                if (event.movementX || event.movementY) setActive(index)
              }}
              // Keeps focus in the field, so the click doesn't close the popover first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              {item.kind === 'folder' && (
                <>
                  <SmallFolderIcon className="size-4 text-tx3" />
                  <span className="truncate">{item.name}</span>
                  <ChevronRightIcon className="ml-auto size-3 text-tx3" />
                </>
              )}
              {item.kind === 'document' && (
                <>
                  <HtmlFileIcon />
                  <span className="truncate">{item.doc.name}</span>
                  {item.doc.dir && <small className="ml-auto flex-none text-[11px] text-tx3">{item.doc.dir}</small>}
                </>
              )}
              {item.kind === 'template' && (
                <>
                  <TemplateIcon template={item.template.id} />
                  <span className="truncate">{item.template.name}</span>
                  {mention?.query && <small className="ml-auto flex-none text-[11px] text-tx3">Template</small>}
                </>
              )}
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="m-0 px-2.5 py-2 text-[12.5px] text-tx3">Nothing here yet</p>}
      </div>
    ),
  }
}

/** The `@Template` chip a choice from the popover puts in the field; × or Backspace at the start drops it. */
export function TemplateChip({ template, onRemove }: { template: TemplateInfo; onRemove: () => void }) {
  return (
    <span role="group" aria-label="Template" className="inline-flex h-7 flex-none items-center gap-1.5 rounded-full bg-violet-soft pr-1.5 pl-2.5 text-[12.5px] text-violet-tx">
      <TemplateIcon template={template.id} className="size-3.5" />
      <span className="whitespace-nowrap">@{template.name}</span>
      <button
        type="button"
        aria-label={`Remove ${template.name}`}
        className="grid place-items-center px-[3px] opacity-70 hover:opacity-100"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
      >
        <CloseIcon className="size-3" />
      </button>
    </span>
  )
}
