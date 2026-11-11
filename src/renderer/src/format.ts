// Small text formatting for the UI.

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** "node_modules, .git and dist" */
export function joinList(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** "Edited 4 minutes ago", "Edited yesterday", "Edited Oct 28". */
export function editedAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso)
  const minutes = Math.floor((now - then.getTime()) / 60_000)
  if (minutes < 1) return 'Edited just now'
  if (minutes < 60) return `Edited ${plural(minutes, 'minute')} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Edited ${plural(hours, 'hour')} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Edited yesterday'
  if (days < 7) return `Edited ${days} days ago`
  if (days < 14) return 'Edited last week'
  const sameYear = then.getFullYear() === new Date(now).getFullYear()
  return `Edited ${then.toLocaleDateString('en', { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })}`
}
