/** Margin's mark and the soft Fraunces "margen" wordmark. */
export function Brand() {
  return (
    <span className="flex h-8 items-center gap-1.5 px-1">
      <span className="relative inline-block h-4 w-3 flex-none" aria-hidden>
        <i className="absolute inset-y-0 left-0 w-[19%] rounded-full bg-[#ff5a36]" />
        <i className="absolute right-0 top-[15%] h-[15%] w-[56%] rounded-full bg-[#ffb800]" />
        <i className="absolute right-0 top-[42.5%] h-[15%] w-[44%] rounded-full bg-[#7c6cff]" />
        <i className="absolute right-0 top-[70%] h-[15%] w-[56%] rounded-full bg-[#1e9e5a]" />
      </span>
      <span className="wordmark">margen</span>
    </span>
  )
}
