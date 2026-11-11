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

export const SmallFolderIcon = ({ className = 'size-4' }: { className?: string }) => (
  <Icon className={className}>
    <path d="M2.5 5.5h5l1.5 2h8.5v8.5h-15z" />
  </Icon>
)

export const HtmlFileIcon = () => (
  <Icon>
    <path d="M5 2h7l4 4v12H5z" />
    <path d="M12 2v4h4M8.5 10.5L7 12l1.5 1.5M11.5 10.5L13 12l-1.5 1.5" />
  </Icon>
)

export const MicIcon = () => (
  <Icon>
    <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
    <path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" />
  </Icon>
)

export const ArrowUpIcon = () => (
  <Icon>
    <path d="M10 16V4M5 9l5-5 5 5" strokeWidth={2} />
  </Icon>
)
