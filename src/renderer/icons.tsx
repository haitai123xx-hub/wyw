import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 18, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const SearchIcon = (props: IconProps) => <IconBase {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></IconBase>;
export const PlusIcon = (props: IconProps) => <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase>;
export const ImportIcon = (props: IconProps) => <IconBase {...props}><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" /></IconBase>;
export const ExportIcon = (props: IconProps) => <IconBase {...props}><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M5 20h14" /></IconBase>;
export const FolderIcon = (props: IconProps) => <IconBase {...props}><path d="M3.5 7.5h6l2-2h9v13h-17z" /></IconBase>;
export const FileIcon = (props: IconProps) => <IconBase {...props}><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h5" /></IconBase>;
export const TagIcon = (props: IconProps) => <IconBase {...props}><path d="M4 5v6l8.8 8.8 7-7L11 4H5a1 1 0 0 0-1 1Z" /><circle cx="8" cy="8" r="1" /></IconBase>;
export const SettingsIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></IconBase>;
export const NoteIcon = (props: IconProps) => <IconBase {...props}><path d="M5 4h14v13l-3 3H5z" /><path d="M9 8h6M9 12h6M9 16h3" /></IconBase>;
export const ListIcon = (props: IconProps) => <IconBase {...props}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r=".7" fill="currentColor" /><circle cx="4.5" cy="12" r=".7" fill="currentColor" /><circle cx="4.5" cy="18" r=".7" fill="currentColor" /></IconBase>;
export const StyleIcon = (props: IconProps) => <IconBase {...props}><path d="M4 19 12 5l8 14M7 14h10" /></IconBase>;
export const TrashIcon = (props: IconProps) => <IconBase {...props}><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></IconBase>;
export const MoreIcon = (props: IconProps) => <IconBase {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></IconBase>;
export const CloseIcon = (props: IconProps) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>;
export const ChevronIcon = (props: IconProps) => <IconBase {...props}><path d="m9 6 6 6-6 6" /></IconBase>;
export const CheckIcon = (props: IconProps) => <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>;
export const BookIcon = (props: IconProps) => <IconBase {...props}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22z" /></IconBase>;
export const EditIcon = (props: IconProps) => <IconBase {...props}><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 7l3.5 3.5" /></IconBase>;
export const SparkleIcon = (props: IconProps) => <IconBase {...props}><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9zM19 15l.6 2.1L22 18l-2.4.9L19 21l-.6-2.1L16 18l2.4-.9z" /></IconBase>;
export const InfoIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></IconBase>;
export const UndoIcon = (props: IconProps) => <IconBase {...props}><path d="m9 7-5 5 5 5" /><path d="M4 12h9a6 6 0 0 1 6 6" /></IconBase>;

