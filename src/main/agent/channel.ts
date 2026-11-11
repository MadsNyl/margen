/** An unbounded push queue read as an AsyncIterable. Values pushed before anyone reads are kept. */
export function createChannel<T>() {
  const buffer: T[] = []
  const waiting: ((result: IteratorResult<T>) => void)[] = []
  let closed = false

  return {
    push(value: T): void {
      if (closed) return
      const next = waiting.shift()
      if (next) next({ value, done: false })
      else buffer.push(value)
    },
    close(): void {
      closed = true
      for (const next of waiting.splice(0)) next({ value: undefined, done: true })
    },
    iterable: {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next: () => {
            if (buffer.length > 0) return Promise.resolve({ value: buffer.shift() as T, done: false })
            if (closed) return Promise.resolve({ value: undefined, done: true })
            return new Promise((resolve) => waiting.push(resolve))
          },
          // Breaking out of a for-await must not close the Session's stream.
          return: () => Promise.resolve({ value: undefined, done: true }),
        }
      },
    } satisfies AsyncIterable<T>,
  }
}
