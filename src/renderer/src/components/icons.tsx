import type { ReactNode } from 'react'

function Icon({ children, className = 'size-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`flex-none fill-none stroke-current ${className}`}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const SettingsIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M4.3 15.7l1.6-1.6M14.1 5.9l1.6-1.6" />
  </Icon>
)

export const FolderIcon = () => (
  <Icon className="size-[22px]">
    <path d="M2.5 5.5h5l1.5 2h8.5v8.5h-15z" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon className="size-[22px]">
    <path d="M10 4v12M4 10h12" />
  </Icon>
)
