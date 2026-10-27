import type { IconGlyph } from "../../lib/icons";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  FullScreenIcon,
  LeftToRightListBulletIcon,
  MinimizeScreenIcon,
  PauseIcon as Pause,
  PictureInPictureExitIcon,
  PictureInPictureOnIcon,
  PlayIcon as Play,
  Settings02Icon,
  Tick02Icon,
  VolumeHighIcon,
  VolumeMute02Icon,
} from "../../lib/icons";

/*
 * The player's icons under the lucide names videocn imports, drawn from uix's icon sets (~/lib/icons), so they follow
 * the theme's set like every other icon. Sizes come from the button (its CSS sizes any svg without a size class).
 */
const as = (Glyph: IconGlyph) => ({ className }: { className?: string }) => <Glyph size={16} color="currentColor" className={className} />;

export const CheckIcon = as(Tick02Icon);
export const ChevronLeftIcon = as(ArrowLeft01Icon);
export const ChevronRightIcon = as(ArrowRight01Icon);
export const ListIcon = as(LeftToRightListBulletIcon);
export const MaximizeIcon = as(FullScreenIcon);
export const MinimizeIcon = as(MinimizeScreenIcon);
export const PauseIcon = as(Pause);
export const PlayIcon = as(Play);
/** Shown while the video is in picture-in-picture: leaving it */
export const PictureInPictureIcon = as(PictureInPictureExitIcon);
/** Shown otherwise: entering it */
export const PictureInPicture2Icon = as(PictureInPictureOnIcon);
export const SettingsIcon = as(Settings02Icon);
/** One speaker for every level: the icon says sound on or off, the slider says how loud */
export const Volume1Icon = as(VolumeHighIcon);
export const Volume2Icon = as(VolumeHighIcon);
export const VolumeXIcon = as(VolumeMute02Icon);
