import { useContext, type ComponentType } from "react";
import { IconSetContext, type IconSet } from "./icon-context";
export { IconSetContext, type IconSet } from "./icon-context";
import * as Huge from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as Iconoir from "iconoir-react";
import * as Mingcute from "@mingcute/react/core-regular";
import { AwardFilled, GithubFilled, MortarboardFilled, Book2Filled, MoonFilled, SunFilled, CertificateFilled, CommentFilled, GroupFilled, HeartFilled, Chat2AIFilled, CheckFilled, ClaudeFilled, CompassFilled, EyeglassFilled, FolderLockedFilled, GeminiFilled, QuillPenAIFilled, Settings4Filled } from "@mingcute/react/core-filled";
import { ArrowLeftRegular, LockRegular } from "@mingcute/react/core-regular";
import { solar, type SolarName } from "./solar-icons";
import { fluent, type FluentName } from "./fluent-icons";

/**
 * The uix icons, in five sets to compare: Iconoir (iconoir.com), MingCute (mingcute.com, its Regular style),
 * Solar (480 Design, its Linear style), Fluent (Microsoft's Fluent UI System Icons, 24 px regular) and Hugeicons,
 * the set the affectUI components ship with. Each glyph keeps its Hugeicons name, so the components read
 * the same either way; the set comes from IconSetContext (Storybook's "Icons" toolbar). The line sets draw with their
 * own default stroke; MingCute and Fluent are drawn as filled shapes, so they have none.
 */

export type IconGlyph = ComponentType<{ size: number; stroke?: number; color: string; className?: string }>;

/** Solar comes as SVG bodies drawn in currentColor at a 1.5 stroke; a stroke given here replaces it */
function SolarGlyph({ name, size, stroke, color, className }: { name: SolarName; size: number; stroke?: number; color: string; className?: string }) {
  const body = stroke == null ? solar[name] : solar[name].replace(/stroke-width="[\d.]+"/g, `stroke-width="${stroke}"`);
  return <svg viewBox="0 0 24 24" width={size} height={size} color={color} className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />;
}

/** Fluent comes as SVG bodies filled in currentColor */
function FluentGlyph({ name, size, color, className }: { name: FluentName; size: number; color: string; className?: string }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} color={color} className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: fluent[name] }} />;
}

function glyph(huge: IconSvgElement, Line: typeof Iconoir.Check, Shape: typeof Mingcute.CheckRegular, solarName: SolarName, fluentName: FluentName): IconGlyph {
  return function Glyph({ size, stroke, color, className }) {
    const set = useContext(IconSetContext);
    if (set === "fluent") return <FluentGlyph name={fluentName} size={size} color={color} className={className} />;
    if (set === "solar") return <SolarGlyph name={solarName} size={size} stroke={stroke} color={color} className={className} />;
    if (set === "hugeicons") return <HugeiconsIcon icon={huge} size={size} strokeWidth={stroke ?? 1.9} color={color} className={className} aria-hidden />;
    if (set === "mingcute") return <Shape size={size} color={color} className={className} aria-hidden />;
    return <Line width={size} height={size} strokeWidth={stroke ?? 1.5} color={color} className={className} aria-hidden />;
  };
}

/* Hugeicons name → Iconoir, MingCute, Solar. No Iconoir match: Slack → Hashtag, Target (brand research) → DocMagnifyingGlass,
   Ticket → Label. No MingCute match: Slack → Hashtag. Solar has no brands or megaphone: Facebook → like,
   Instagram → camera, TikTok → music-note, Slack → hashtag, Megaphone → speaker. Fluent has no brands, telescope or
   T-shirt: Facebook → thumb-like, Instagram → camera, TikTok → music-note-2, Slack → number-symbol,
   Telescope (audience research) → people-search, T-shirt → clothes-hanger */
export const AiBrain01Icon = glyph(Huge.AiBrain01Icon, Iconoir.Brain, Mingcute.BrainRegular, "brain", "brain-circuit");
export const AiMagicIcon = glyph(Huge.AiMagicIcon, Iconoir.MagicWand, Mingcute.Magic1Regular, "magic-stick", "wand");
export const Analytics01Icon = glyph(Huge.Analytics01Icon, Iconoir.GraphUp, Mingcute.ChartLineRegular, "graph-up", "data-trending");
export const ArrowDown01Icon = glyph(Huge.ArrowDown01Icon, Iconoir.NavArrowDown, Mingcute.DownRegular, "alt-arrow-down", "chevron-down");
export const ArrowRight01Icon = glyph(Huge.ArrowRight01Icon, Iconoir.NavArrowRight, Mingcute.RightRegular, "alt-arrow-right", "chevron-right");
export const ArrowUp02Icon = glyph(Huge.ArrowUp02Icon, Iconoir.ArrowUp, Mingcute.ArrowUpRegular, "arrow-up", "arrow-up");
export const ArrowUpDownIcon = glyph(Huge.ArrowUpDownIcon, Iconoir.ArrowSeparateVertical, Mingcute.TransferVerticalRegular, "sort-vertical", "arrow-sort");
export const BookOpen01Icon = glyph(Huge.BookOpen01Icon, Iconoir.Book, Mingcute.BookRegular, "book", "book-open");
export const BubbleChatIcon = glyph(Huge.BubbleChatIcon, Iconoir.ChatBubble, Mingcute.Chat1Regular, "chat-round-dots", "chat");
export const Calendar03Icon = glyph(Huge.Calendar03Icon, Iconoir.Calendar, Mingcute.CalendarRegular, "calendar", "calendar-ltr");
export const Cancel01Icon = glyph(Huge.Cancel01Icon, Iconoir.Xmark, Mingcute.CloseRegular, "close", "dismiss");
export const ChartColumnIcon = glyph(Huge.ChartColumnIcon, Iconoir.ReportColumns, Mingcute.ChartBarRegular, "chart", "data-bar-vertical");
export const CheckListIcon = glyph(Huge.CheckListIcon, Iconoir.TaskList, Mingcute.ListCheckRegular, "checklist", "task-list-ltr");
/** The evals toggle: MingCute content-ai-line */
export const EvalsIcon = glyph(Huge.CheckListIcon, Iconoir.TaskList, Mingcute.ContentAIRegular, "checklist", "task-list-ltr");
export const CheckmarkCircle02Icon = glyph(Huge.CheckmarkCircle02Icon, Iconoir.CheckCircle, Mingcute.CheckCircleRegular, "check-circle", "checkmark-circle");
export const CpuIcon = glyph(Huge.CpuIcon, Iconoir.Cpu, Mingcute.ChipRegular, "cpu", "developer-board");
export const DashboardSquare02Icon = glyph(Huge.DashboardSquare02Icon, Iconoir.ViewGrid, Mingcute.DashboardRegular, "widget", "board");
export const Database01Icon = glyph(Huge.Database01Icon, Iconoir.Database, Mingcute.ServerRegular, "database", "database");
export const Delete02Icon = glyph(Huge.Delete02Icon, Iconoir.Trash, Mingcute.Delete2Regular, "trash-bin-trash", "delete");
export const Dollar01Icon = glyph(Huge.Dollar01Icon, Iconoir.Dollar, Mingcute.CurrencyDollarRegular, "dollar", "money");
export const Facebook01Icon = glyph(Huge.Facebook01Icon, Iconoir.Facebook, Mingcute.FacebookRegular, "like", "thumb-like");
export const File01Icon = glyph(Huge.File01Icon, Iconoir.Page, Mingcute.FileRegular, "file", "document");
export const UploadIcon = glyph(Huge.Upload04Icon, Iconoir.Upload, Mingcute.UploadRegular, "file", "document");
/* For the affectUI screens (onboarding, settings & billing, folder) */
export const Upload04Icon = UploadIcon;
export const ArrowLeft02Icon = glyph(Huge.ArrowLeft02Icon, Iconoir.ArrowLeft, Mingcute.ArrowLeftRegular, "alt-arrow-left", "chevron-left");
export const ChatEdit01Icon = glyph(Huge.ChatEdit01Icon, Iconoir.ChatLines, Mingcute.EditRegular, "pen", "edit");
export const Copy01Icon = glyph(Huge.Copy01Icon, Iconoir.Copy, Mingcute.CopyRegular, "document-text", "document");
export const CopyrightIcon = glyph(Huge.CopyrightIcon, Iconoir.Copyright, Mingcute.CopyrightRegular, "copyright", "copyright");
export const CreditCardIcon = glyph(Huge.CreditCardIcon, Iconoir.CreditCard, Mingcute.BankCardRegular, "wallet-money", "money");
export const CustomerSupportIcon = glyph(Huge.CustomerSupportIcon, Iconoir.Headset, Mingcute.HeadphoneRegular, "question-circle", "question-circle");
export const Download04Icon = glyph(Huge.Download04Icon, Iconoir.Download, Mingcute.DownloadRegular, "file", "document");
export const ImageUpload01Icon = glyph(Huge.ImageUpload01Icon, Iconoir.MediaImagePlus, Mingcute.PicRegular, "gallery", "image");
export const Key01Icon = glyph(Huge.Key01Icon, Iconoir.Key, Mingcute.Key1Regular, "settings", "settings");
export const Link01Icon = glyph(Huge.Link01Icon, Iconoir.Link, Mingcute.LinkRegular, "share", "share");
export const UserMultiple02Icon = glyph(Huge.UserMultiple02Icon, Iconoir.Group, Mingcute.GroupRegular, "users-group-rounded", "people-team");
export const UserSearch01Icon = glyph(Huge.UserSearch01Icon, Iconoir.UserScan, Mingcute.UserSearchRegular, "magnifier", "people-search");
export const File02Icon = glyph(Huge.File02Icon, Iconoir.Page, Mingcute.DocRegular, "document-text", "document-text");
export const FilterIcon = glyph(Huge.FilterIcon, Iconoir.Filter, Mingcute.FilterRegular, "filter", "filter");
export const Folder01Icon = glyph(Huge.Folder01Icon, Iconoir.Folder, Mingcute.FolderRegular, "folder", "folder");
export const FolderOpenIcon = glyph(Huge.FolderOpenIcon, Iconoir.Folder, Mingcute.FolderOpenRegular, "folder-open", "folder-open");
export const Globe02Icon = glyph(Huge.Globe02Icon, Iconoir.Globe, Mingcute.GlobeRegular, "global", "globe");
export const GridViewIcon = glyph(Huge.GridViewIcon, Iconoir.ViewGrid, Mingcute.GridRegular, "widget-2", "grid");
export const HelpCircleIcon = glyph(Huge.HelpCircleIcon, Iconoir.HelpCircle, Mingcute.QuestionRegular, "question-circle", "question-circle");
export const Home01Icon = glyph(Huge.Home01Icon, Iconoir.HomeSimple, Mingcute.Home1Regular, "home", "home");
export const Image01Icon = glyph(Huge.Image01Icon, Iconoir.MediaImage, Mingcute.PicRegular, "gallery", "image");
export const InstagramIcon = glyph(Huge.InstagramIcon, Iconoir.Instagram, Mingcute.InstagramRegular, "camera", "camera");
export const LeftToRightListBulletIcon = glyph(Huge.LeftToRightListBulletIcon, Iconoir.List, Mingcute.ListOrderedRegular, "list", "text-bullet-list-ltr");
export const Location01Icon = glyph(Huge.Location01Icon, Iconoir.MapPin, Mingcute.LocationRegular, "map-point", "location");
export const Logout01Icon = glyph(Huge.Logout01Icon, Iconoir.LogOut, Mingcute.ExitRegular, "logout-2", "sign-out");
export const Mail01Icon = glyph(Huge.Mail01Icon, Iconoir.Mail, Mingcute.MailRegular, "letter", "mail");
export const Megaphone01Icon = glyph(Huge.Megaphone01Icon, Iconoir.Megaphone, Mingcute.AnnouncementRegular, "speaker", "megaphone");
export const Mic01Icon = glyph(Huge.Mic01Icon, Iconoir.Microphone, Mingcute.MicRegular, "microphone", "mic");
export const MoneyReceive01Icon = glyph(Huge.MoneyReceive01Icon, Iconoir.Wallet, Mingcute.WalletRegular, "wallet-money", "money-hand");
export const MoreHorizontalIcon = glyph(Huge.MoreHorizontalIcon, Iconoir.MoreHoriz, Mingcute.More1Regular, "menu-dots", "more-horizontal");
export const PaintBoardIcon = glyph(Huge.PaintBoardIcon, Iconoir.Palette, Mingcute.PaletteRegular, "palette", "color");
export const PencilEdit02Icon = glyph(Huge.PencilEdit02Icon, Iconoir.EditPencil, Mingcute.EditRegular, "pen", "edit");
export const PinIcon = glyph(Huge.PinIcon, Iconoir.Pin, Mingcute.PinRegular, "pin", "pin");
export const PlayIcon = glyph(Huge.PlayIcon, Iconoir.Play, Mingcute.PlayRegular, "play", "play");
export const Plug01Icon = glyph(Huge.Plug01Icon, Iconoir.Puzzle, Mingcute.PluginRegular, "plug-circle", "plug-connected");
export const PlusSignIcon = glyph(Huge.PlusSignIcon, Iconoir.Plus, Mingcute.AddRegular, "add", "add");
export const PresentationBarChart01Icon = glyph(Huge.PresentationBarChart01Icon, Iconoir.Presentation, Mingcute.Presentation1Regular, "presentation-graph", "presenter");
export const Search01Icon = glyph(Huge.Search01Icon, Iconoir.Search, Mingcute.SearchRegular, "magnifier", "search");
export const Settings01Icon = glyph(Huge.Settings01Icon, Iconoir.Settings, Mingcute.Settings1Regular, "settings", "settings");
/** Settings in the profile menu: MingCute settings-4-fill */
export const SettingsFillIcon = glyph(Huge.Settings01Icon, Iconoir.Settings, Settings4Filled, "settings", "settings");
/** The chat's own mark – MingCute's chat-2-ai-fill in every icon set */
export const ChatAiIcon: IconGlyph = ({ size, color, className }) => <Chat2AIFilled size={size} color={color} className={className} aria-hidden />;

/** MingCute glyphs that stay MingCute in every icon set – the learner's library, chapters and progress */
const fixed = (Glyph: typeof LockRegular): IconGlyph => ({ size, color, className }) => <Glyph size={size} color={color} className={className} aria-hidden />;
/** The learner's menu: Courses (once Study and Authoring), Explore, then the Collection – Certificates and Materials */
/** Courses: the ones you study and the ones you write, on one page */
export const CoursesIcon = fixed(MortarboardFilled as typeof LockRegular);
export const StudyIcon = fixed(EyeglassFilled as typeof LockRegular);
export const ExploreIcon = fixed(CompassFilled as typeof LockRegular);
export const AuthoringIcon = fixed(QuillPenAIFilled as typeof LockRegular);
export const CertificateIcon = fixed(CertificateFilled as typeof LockRegular);
export const MaterialsIcon = fixed(Book2Filled as typeof LockRegular);
/** Explore's top courses: the rank's plaque, and likes, comments and learners */
export const AwardIcon = fixed(AwardFilled as typeof LockRegular);
export const LikesIcon = fixed(HeartFilled as typeof LockRegular);
export const CommentsIcon = fixed(CommentFilled as typeof LockRegular);
export const LearnersIcon = fixed(GroupFilled as typeof LockRegular);
/** Light and dark, for the appearance toggle */
export const SunIcon = fixed(SunFilled as typeof LockRegular);
export const MoonIcon = fixed(MoonFilled as typeof LockRegular);
export const LockIcon = fixed(LockRegular);
/** Finished: mingcute:check-fill */
export const DoneIcon = fixed(CheckFilled as typeof LockRegular);
/** Not open yet: mingcute:folder-locked-fill */
export const LockedIcon = fixed(FolderLockedFilled as typeof LockRegular);
export const BackIcon = fixed(ArrowLeftRegular);
export const ClaudeIcon = fixed(ClaudeFilled as typeof LockRegular);
export const GeminiIcon = fixed(GeminiFilled as typeof LockRegular);
/** GitHub Copilot, as an agent: the GitHub mark */
export const GitHubCopilotIcon = fixed(GithubFilled as typeof LockRegular);
/** The player's settings: MingCute settings-2-line */
export const Settings02Icon = glyph(Huge.Settings02Icon, Iconoir.Settings, Mingcute.Settings2Regular, "settings", "settings");
/** The workspace settings toggle, next to evals: MingCute settings-4-line */
export const Settings04Icon = glyph(Huge.Settings02Icon, Iconoir.Settings, Mingcute.Settings4Regular, "settings", "settings");
export const Share08Icon = glyph(Huge.Share08Icon, Iconoir.ShareIos, Mingcute.Share2Regular, "share", "share");
export const ShoppingBag01Icon = glyph(Huge.ShoppingBag01Icon, Iconoir.ShoppingBag, Mingcute.ShoppingBag1Regular, "bag", "shopping-bag");
export const SidebarLeftIcon = glyph(Huge.SidebarLeftIcon, Iconoir.LayoutLeft, Mingcute.LayoutLeftRegular, "panel-left", "panel-left");
export const SidebarRightIcon = glyph(Huge.SidebarRightIcon, Iconoir.LayoutRight, Mingcute.LayoutRightRegular, "panel-right", "panel-right");
export const SlackIcon = glyph(Huge.SlackIcon, Iconoir.Hashtag, Mingcute.HashtagRegular, "hashtag", "number-symbol");
export const SparklesIcon = glyph(Huge.SparklesIcon, Iconoir.Sparks, Mingcute.SparklesRegular, "stars", "sparkle");
export const TShirtIcon = glyph(Huge.TShirtIcon, Iconoir.Shirt, Mingcute.TShirtRegular, "t-shirt", "clothes-hanger");
export const Table01Icon = glyph(Huge.Table01Icon, Iconoir.Table, Mingcute.TableRegular, "table", "table");
export const Target02Icon = glyph(Huge.Target02Icon, Iconoir.DocMagnifyingGlass, Mingcute.TargetRegular, "target", "target");
export const TaskDaily01Icon = glyph(Huge.TaskDaily01Icon, Iconoir.CalendarCheck, Mingcute.ScheduleRegular, "calendar-mark", "calendar-checkmark");
export const Telescope01Icon = glyph(Huge.Telescope01Icon, Iconoir.Binocular, Mingcute.TelescopeRegular, "telescope", "people-search");
export const TestTube01Icon = glyph(Huge.TestTube01Icon, Iconoir.TestTube, Mingcute.TestTubeRegular, "test-tube", "beaker");
export const Tick02Icon = glyph(Huge.Tick02Icon, Iconoir.Check, Mingcute.CheckRegular, "check", "checkmark");
export const Ticket01Icon = glyph(Huge.Ticket01Icon, Iconoir.Label, Mingcute.TicketRegular, "ticket", "ticket-diagonal");
export const TiktokIcon = glyph(Huge.TiktokIcon, Iconoir.Tiktok, Mingcute.TiktokRegular, "music-note", "music-note-2");
export const UserAdd01Icon = glyph(Huge.UserAdd01Icon, Iconoir.UserPlus, Mingcute.UserAddRegular, "user-plus", "person-add");
export const UserGroupIcon = glyph(Huge.UserGroupIcon, Iconoir.Group, Mingcute.GroupRegular, "users-group-rounded", "people-team");
export const UserIcon = glyph(Huge.UserIcon, Iconoir.User, Mingcute.User1Regular, "user", "person");
export const WorkflowSquare03Icon = glyph(Huge.WorkflowSquare03Icon, Iconoir.GitFork, Mingcute.ProcessRegular, "git-fork", "flow");

/* The video player's controls. No exact match: MingCute low volume → Speaker, picture-in-picture → Miniplayer and
   Minimize; Iconoir picture-in-picture → OpenInWindow and WindowXmark */
export const PauseIcon = glyph(Huge.PauseIcon, Iconoir.Pause, Mingcute.PauseRegular, "pause", "pause");
export const VolumeHighIcon = glyph(Huge.VolumeHighIcon, Iconoir.SoundHigh, Mingcute.VolumeRegular, "volume-loud", "speaker-2");
export const VolumeLowIcon = glyph(Huge.VolumeLowIcon, Iconoir.SoundLow, Mingcute.VolumeRegular, "volume-small", "speaker-1");
export const VolumeMute02Icon = glyph(Huge.VolumeMute02Icon, Iconoir.SoundOff, Mingcute.VolumeMuteRegular, "volume-cross", "speaker-mute");
export const FullScreenIcon = glyph(Huge.FullScreenIcon, Iconoir.Expand, Mingcute.FullscreenRegular, "maximize-square", "full-screen-maximize");
export const MinimizeScreenIcon = glyph(Huge.MinimizeScreenIcon, Iconoir.Collapse, Mingcute.FullscreenExitRegular, "minimize-square", "full-screen-minimize");
export const PictureInPictureOnIcon = glyph(Huge.PictureInPictureOnIcon, Iconoir.OpenInWindow, Mingcute.MiniplayerRegular, "pip", "picture-in-picture");
export const PictureInPictureExitIcon = glyph(Huge.PictureInPictureExitIcon, Iconoir.WindowXmark, Mingcute.MinimizeRegular, "pip-2", "picture-in-picture-exit");
export const ArrowLeft01Icon = glyph(Huge.ArrowLeft01Icon, Iconoir.NavArrowLeft, Mingcute.LeftRegular, "alt-arrow-left", "chevron-left");
