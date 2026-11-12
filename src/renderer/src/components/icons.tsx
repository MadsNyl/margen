import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  Cancel01Icon,
  Clock01Icon,
  ComputerIcon,
  Cursor01Icon,
  Download04Icon,
  CursorPointer01Icon,
  File01Icon,
  FileCodeIcon,
  Film01Icon,
  FitToScreenIcon,
  Folder01Icon,
  LinkSquare02Icon,
  Mic01Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PauseIcon as PauseHugeIcon,
  PencilEdit01Icon,
  PlayIcon as PlayHugeIcon,
  Settings01Icon,
  Shield01Icon,
  SmartPhone01Icon,
  Tablet01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import type { TemplateId } from '@shared/templates'

// Every icon in the app is a Hugeicons stroke icon, at one stroke width.
// Sizes are Tailwind size classes; the icon takes the text colour.

function Icon({ icon, className = 'size-4', strokeWidth = 1.6 }: { icon: IconSvgElement; className?: string; strokeWidth?: number }) {
  return <HugeiconsIcon icon={icon} size="100%" strokeWidth={strokeWidth} className={`flex-none ${className}`} aria-hidden />
}

type Props = { className?: string }

export const SettingsIcon = ({ className }: Props) => <Icon icon={Settings01Icon} className={className} />
export const FolderIcon = ({ className = 'size-[22px]' }: Props) => <Icon icon={Folder01Icon} className={className} />
export const SmallFolderIcon = ({ className = 'size-4' }: Props) => <Icon icon={Folder01Icon} className={className} />
export const PlusIcon = ({ className = 'size-[22px]' }: Props) => <Icon icon={Add01Icon} className={className} />
export const HtmlFileIcon = ({ className }: Props) => <Icon icon={FileCodeIcon} className={className} />
export const MicIcon = ({ className }: Props) => <Icon icon={Mic01Icon} className={className} />
export const AttachIcon = ({ className }: Props) => <Icon icon={Attachment01Icon} className={className} />
export const ArrowUpIcon = ({ className }: Props) => <Icon icon={ArrowUp02Icon} className={className} strokeWidth={2} />
export const ArrowRightIcon = ({ className }: Props) => <Icon icon={ArrowRight02Icon} className={className} strokeWidth={2} />
export const OpenExternalIcon = ({ className = 'size-[15px]' }: Props) => <Icon icon={LinkSquare02Icon} className={className} />
export const DesktopIcon = ({ className }: Props) => <Icon icon={ComputerIcon} className={className} />
export const TabletIcon = ({ className }: Props) => <Icon icon={Tablet01Icon} className={className} />
export const MobileIcon = ({ className }: Props) => <Icon icon={SmartPhone01Icon} className={className} />
/** A dropdown's caret. */
export const ChevronDownIcon = ({ className = 'size-3.5 text-tx3' }: Props) => <Icon icon={ArrowDown01Icon} className={className} strokeWidth={2} />
/** A disclosure's caret, pointing right while closed. */
export const ChevronRightIcon = ({ className = 'size-3' }: Props) => <Icon icon={ArrowRight01Icon} className={className} strokeWidth={2} />
/** Going back up, as in the `@` popover's folders. */
export const ChevronLeftIcon = ({ className = 'size-3' }: Props) => <Icon icon={ArrowLeft01Icon} className={className} strokeWidth={2} />
/** The Blank Template. */
export const BlankFileIcon = ({ className }: Props) => <Icon icon={File01Icon} className={className} />
/** The Animation video Template. */
export const VideoIcon = ({ className }: Props) => <Icon icon={Film01Icon} className={className} />
export const TemplateIcon = ({ template, className }: Props & { template: TemplateId }) =>
  template === 'animation-video' ? <VideoIcon className={className} /> : <BlankFileIcon className={className} />
export const CloseIcon = ({ className = 'size-4' }: Props) => <Icon icon={Cancel01Icon} className={className} />
export const CheckIcon = ({ className = 'size-3.5' }: Props) => <Icon icon={Tick02Icon} className={className} strokeWidth={2} />
export const AddIcon = ({ className = 'size-4' }: Props) => <Icon icon={Add01Icon} className={className} />
export const HistoryIcon = ({ className }: Props) => <Icon icon={Clock01Icon} className={className} />
export const ShieldIcon = ({ className = 'size-3.5' }: Props) => <Icon icon={Shield01Icon} className={className} />
export const BrowseIcon = ({ className }: Props) => <Icon icon={Cursor01Icon} className={className} />
export const PickIcon = ({ className }: Props) => <Icon icon={CursorPointer01Icon} className={className} />
export const FitIcon = ({ className }: Props) => <Icon icon={FitToScreenIcon} className={className} />
export const HideChatIcon = ({ className }: Props) => <Icon icon={PanelRightCloseIcon} className={className} />
export const ShowChatIcon = ({ className }: Props) => <Icon icon={PanelRightOpenIcon} className={className} />
export const UpdateIcon = ({ className }: Props) => <Icon icon={Download04Icon} className={className} />
export const PlayIcon = ({ className = 'size-3.5' }: Props) => <Icon icon={PlayHugeIcon} className={className} strokeWidth={2} />
export const PauseIcon = ({ className = 'size-3.5' }: Props) => <Icon icon={PauseHugeIcon} className={className} strokeWidth={2} />
export const DrawIcon = ({ className }: Props) => <Icon icon={PencilEdit01Icon} className={className} />

/** Claude's spark, white on its terracotta tile, as in the chat panel's header. A brand mark, so not a Hugeicon. */
export const ClaudeMark = () => (
  <span className="grid size-5 flex-none place-items-center rounded-md bg-[#d97757]" aria-hidden>
    <svg viewBox="0 0 20 20" width="11" height="11">
      <path
        d="M10 2v16M2 10h16M4.3 4.3l11.4 11.4M15.7 4.3L4.3 15.7"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  </span>
)
