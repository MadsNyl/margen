import { randomUUID } from 'node:crypto'
import type { TurnInput } from '@shared/agent'
import type { QueuedMessage } from '@shared/host-api'

// The Queue: Turns go out one at a time. A message sent while a Turn runs
// waits here and starts only once that Turn has fully ended (an Agent may
// merge a message sent mid-Turn into the running Turn). After an interrupt
// the Queue holds until the user sends again.

export interface TurnQueue {
  messages(): QueuedMessage[]
  held(): boolean
  /** Starts the Turn now if the Agent is free, else queues it. Sending releases a held Queue. */
  send(turn: TurnInput): void
  unqueue(id: string): void
  /** The running Turn is being interrupted: what's queued waits. */
  hold(): void
  /** The running Turn has ended; starts the next queued one unless the Queue is held. */
  turnEnded(): void
}

export function createTurnQueue({ start, onChange }: { start(turn: TurnInput): void; onChange(): void }): TurnQueue {
  let messages: QueuedMessage[] = []
  let running = false
  let held = false

  function run(turn: TurnInput) {
    running = true
    start(turn)
  }

  function next() {
    const [first, ...rest] = messages
    if (running || held || !first) return
    messages = rest
    onChange()
    run(first.turn)
  }

  return {
    messages: () => [...messages],
    held: () => held,
    send(turn) {
      if (!running && messages.length === 0) {
        if (held) {
          held = false
          onChange()
        }
        return run(turn)
      }
      messages = [...messages, { id: randomUUID(), turn }]
      held = false
      onChange()
      next()
    },
    unqueue(id) {
      const kept = messages.filter((message) => message.id !== id)
      if (kept.length === messages.length) return
      messages = kept
      onChange()
    },
    hold() {
      if (!running || held) return
      held = true
      onChange()
    },
    turnEnded() {
      running = false
      next()
    },
  }
}
