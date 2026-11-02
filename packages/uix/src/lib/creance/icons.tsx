import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      className="cr-icon"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="M3 8.5l3 3 7-7" /></Icon>;
export const CrossIcon = (p: IconProps) => <Icon {...p}><path d="M4 4l8 8M12 4l-8 8" /></Icon>;
export const PauseIcon = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5l2 1.5" /></Icon>;
export const BlockedIcon = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6" /><path d="M4 12l8-8" /></Icon>;
export const AlertIcon = (p: IconProps) => <Icon {...p}><path d="M8 2l6.5 11.5h-13z" /><path d="M8 6.5v3M8 11.5v.01" /></Icon>;
export const DotIcon = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="3.5" fill="currentColor" stroke="none" /></Icon>;
export const ChevronIcon = (p: IconProps) => <Icon {...p}><path d="M6 4l4 4-4 4" /></Icon>;
export const RetryIcon = (p: IconProps) => <Icon {...p}><path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" /></Icon>;
export const ShieldIcon = (p: IconProps) => <Icon {...p}><path d="M8 1.5l5 2v4c0 3.3-2.2 5.8-5 7-2.8-1.2-5-3.7-5-7v-4z" /></Icon>;
export const ArrowDownIcon = (p: IconProps) => <Icon {...p}><path d="M8 3v10M4 9l4 4 4-4" /></Icon>;
export const ChevronDownIcon = (p: IconProps) => <Icon {...p}><path d="M4 6l4 4 4-4" /></Icon>;
export const InfoIcon = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="6.5" /><path d="M8 7.5v4M8 4.8v.01" /></Icon>;
export const ChevronLeftIcon = (p: IconProps) => <Icon {...p}><path d="M10 4l-4 4 4 4" /></Icon>;
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5l3 3" /></Icon>;
export const CopyIcon = (p: IconProps) => <Icon {...p}><rect x="5" y="5" width="8" height="8" rx="2" /><path d="M3 10V4a1 1 0 0 1 1-1h6" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M8 3v10M3 8h10" /></Icon>;
export const SunIcon = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></Icon>;
export const MoonIcon = (p: IconProps) => <Icon {...p}><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" /></Icon>;
export const MonitorIcon = (p: IconProps) => <Icon {...p}><rect x="2" y="3" width="12" height="8" rx="1.5" /><path d="M6 14h4M8 11v3" /></Icon>;
export const ThumbIcon = (p: IconProps) => <Icon {...p}><path d="M5 7l2.5-5c1 0 1.8.8 1.6 1.8L8.7 6.5H12a1.5 1.5 0 0 1 1.5 1.8l-.8 4.5A1.5 1.5 0 0 1 11.2 14H5zM2 7h3v7H2z" /></Icon>;
export const DotsIcon = (p: IconProps) => <Icon {...p}><circle cx="3.5" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="1.2" fill="currentColor" stroke="none" /></Icon>;
export const PlayIcon = (p: IconProps) => <Icon {...p}><path d="M5 3.5v9l7.5-4.5z" fill="currentColor" /></Icon>;
export const PauseBarsIcon = (p: IconProps) => <Icon {...p}><path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth="2.2" /></Icon>;
export const VolumeIcon = (p: IconProps) => <Icon {...p}><path d="M3 6h2.5L9 3v10L5.5 10H3z" /><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" /></Icon>;
export const MutedIcon = (p: IconProps) => <Icon {...p}><path d="M3 6h2.5L9 3v10L5.5 10H3z" /><path d="M11.5 6l3 4M14.5 6l-3 4" /></Icon>;
export const ExpandIcon = (p: IconProps) => <Icon {...p}><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></Icon>;
export const StopIcon = (p: IconProps) => <Icon {...p}><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" /></Icon>;
export const MenuIcon = (p: IconProps) => <Icon {...p}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></Icon>;
export const SidebarIcon = (p: IconProps) => <Icon {...p}><rect x="2.2" y="2.8" width="11.6" height="10.4" rx="2.2" /><path d="M6.2 2.8v10.4" /></Icon>;
export const SendIcon = (p: IconProps) => <Icon {...p}><path d="M8 13V3.5M4 7.5l4-4 4 4" /></Icon>;
export const SparkIcon = (p: IconProps) => <Icon {...p}><path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.300 4.300l1.900 1.900M9.800 9.800l1.900 1.900M4.300 11.700l1.900-1.900M9.800 6.200l1.900-1.900" /></Icon>;
export const FileIcon = (p: IconProps) => <Icon {...p}><path d="M4 2.5h5l3 3V13a.5.5 0 0 1-.5.5h-7.500a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" /><path d="M9 2.5v3h3" /></Icon>;
export const ImageIcon = (p: IconProps) => <Icon {...p}><rect x="2.5" y="3" width="11" height="10" rx="2" /><circle cx="6" cy="6.5" r="1.200" /><path d="M3 12l3.500-3.500 2.500 2.500 2-2 2.500 2.500" /></Icon>;
export const ArrowUpIcon = (p: IconProps) => <Icon {...p}><path d="M8 13V3M4 7l4-4 4 4" /></Icon>;
export const MinusIcon = (p: IconProps) => <Icon {...p}><path d="M3 8h10" /></Icon>;
