import { useContext, type ComponentType } from "react";
import { IconSetContext, type IconSet } from "./icon-context";
export { IconSetContext, type IconSet } from "./icon-context";
import * as Huge from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as Iconoir from "iconoir-react";
import * as Mingcute from "@mingcute/react/core-regular";
import { AwardFilled, GithubFilled, MortarboardFilled, Book2Filled, MoonFilled, SunFilled, CertificateFilled, CommentFilled, GroupFilled, HeartFilled, Chat2AIFilled, CheckFilled, ClaudeFilled, CompassFilled, EyeglassFilled, FolderLockedFilled, QuillPenAIFilled, Settings4Filled } from "@mingcute/react/core-filled";
import { ArrowLeftRegular, LockRegular } from "@mingcute/react/core-regular";
import { solar, type SolarName } from "./solar-icons";
import { fluent, type FluentName } from "./fluent-icons";

declare const __UIX_ICON_SET__: IconSet | undefined;
const fixedFamily = typeof __UIX_ICON_SET__ !== "undefined" && __UIX_ICON_SET__ === "mingcute";

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

type GlyphVariants = { huge: IconSvgElement; Line: typeof Iconoir.Check; solarName: SolarName; fluentName: FluentName };

function glyph(Shape: typeof Mingcute.CheckRegular, variants?: () => GlyphVariants): IconGlyph {
  // A fixed website build never needs to construct the other families. Keeping
  // their values behind a callback lets the bundler remove those imports too.
  if (fixedFamily || !variants) return fixed(Shape);
  const { huge, Line, solarName, fluentName } = variants();
  return function Glyph({ size, stroke, color, className }) {
    const selected = useContext(IconSetContext);
    const set = typeof __UIX_ICON_SET__ === "undefined" ? selected : __UIX_ICON_SET__;
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
export const AiBrain01Icon = /* @__PURE__ */ glyph(Mingcute.BrainRegular, fixedFamily ? undefined : () => ({ huge: Huge.AiBrain01Icon, Line: Iconoir.Brain, solarName: "brain", fluentName: "brain-circuit" }));
export const AiMagicIcon = /* @__PURE__ */ glyph(Mingcute.Magic1Regular, fixedFamily ? undefined : () => ({ huge: Huge.AiMagicIcon, Line: Iconoir.MagicWand, solarName: "magic-stick", fluentName: "wand" }));
export const Analytics01Icon = /* @__PURE__ */ glyph(Mingcute.ChartLineRegular, fixedFamily ? undefined : () => ({ huge: Huge.Analytics01Icon, Line: Iconoir.GraphUp, solarName: "graph-up", fluentName: "data-trending" }));
export const ArrowDown01Icon = /* @__PURE__ */ glyph(Mingcute.DownRegular, fixedFamily ? undefined : () => ({ huge: Huge.ArrowDown01Icon, Line: Iconoir.NavArrowDown, solarName: "alt-arrow-down", fluentName: "chevron-down" }));
export const ArrowRight01Icon = /* @__PURE__ */ glyph(Mingcute.RightRegular, fixedFamily ? undefined : () => ({ huge: Huge.ArrowRight01Icon, Line: Iconoir.NavArrowRight, solarName: "alt-arrow-right", fluentName: "chevron-right" }));
export const ArrowUp02Icon = /* @__PURE__ */ glyph(Mingcute.ArrowUpRegular, fixedFamily ? undefined : () => ({ huge: Huge.ArrowUp02Icon, Line: Iconoir.ArrowUp, solarName: "arrow-up", fluentName: "arrow-up" }));
export const ArrowUpDownIcon = /* @__PURE__ */ glyph(Mingcute.TransferVerticalRegular, fixedFamily ? undefined : () => ({ huge: Huge.ArrowUpDownIcon, Line: Iconoir.ArrowSeparateVertical, solarName: "sort-vertical", fluentName: "arrow-sort" }));
export const BookOpen01Icon = /* @__PURE__ */ glyph(Mingcute.BookRegular, fixedFamily ? undefined : () => ({ huge: Huge.BookOpen01Icon, Line: Iconoir.Book, solarName: "book", fluentName: "book-open" }));
export const BubbleChatIcon = /* @__PURE__ */ glyph(Mingcute.Chat1Regular, fixedFamily ? undefined : () => ({ huge: Huge.BubbleChatIcon, Line: Iconoir.ChatBubble, solarName: "chat-round-dots", fluentName: "chat" }));
export const Calendar03Icon = /* @__PURE__ */ glyph(Mingcute.CalendarRegular, fixedFamily ? undefined : () => ({ huge: Huge.Calendar03Icon, Line: Iconoir.Calendar, solarName: "calendar", fluentName: "calendar-ltr" }));
export const Menu01Icon = /* @__PURE__ */ glyph(Mingcute.MenuRegular, fixedFamily ? undefined : () => ({ huge: Huge.Menu01Icon, Line: Iconoir.Menu, solarName: "hamburger-menu", fluentName: "navigation" }));
export const Cancel01Icon = /* @__PURE__ */ glyph(Mingcute.CloseRegular, fixedFamily ? undefined : () => ({ huge: Huge.Cancel01Icon, Line: Iconoir.Xmark, solarName: "close", fluentName: "dismiss" }));
export const ChartColumnIcon = /* @__PURE__ */ glyph(Mingcute.ChartBarRegular, fixedFamily ? undefined : () => ({ huge: Huge.ChartColumnIcon, Line: Iconoir.ReportColumns, solarName: "chart", fluentName: "data-bar-vertical" }));
export const CheckListIcon = /* @__PURE__ */ glyph(Mingcute.ListCheckRegular, fixedFamily ? undefined : () => ({ huge: Huge.CheckListIcon, Line: Iconoir.TaskList, solarName: "checklist", fluentName: "task-list-ltr" }));
/** The evals toggle: MingCute content-ai-line */
export const EvalsIcon = /* @__PURE__ */ glyph(Mingcute.ContentAIRegular, fixedFamily ? undefined : () => ({ huge: Huge.CheckListIcon, Line: Iconoir.TaskList, solarName: "checklist", fluentName: "task-list-ltr" }));
export const CheckmarkCircle02Icon = /* @__PURE__ */ glyph(Mingcute.CheckCircleRegular, fixedFamily ? undefined : () => ({ huge: Huge.CheckmarkCircle02Icon, Line: Iconoir.CheckCircle, solarName: "check-circle", fluentName: "checkmark-circle" }));
export const CpuIcon = /* @__PURE__ */ glyph(Mingcute.ChipRegular, fixedFamily ? undefined : () => ({ huge: Huge.CpuIcon, Line: Iconoir.Cpu, solarName: "cpu", fluentName: "developer-board" }));
export const DashboardSquare02Icon = /* @__PURE__ */ glyph(Mingcute.DashboardRegular, fixedFamily ? undefined : () => ({ huge: Huge.DashboardSquare02Icon, Line: Iconoir.ViewGrid, solarName: "widget", fluentName: "board" }));
export const Database01Icon = /* @__PURE__ */ glyph(Mingcute.ServerRegular, fixedFamily ? undefined : () => ({ huge: Huge.Database01Icon, Line: Iconoir.Database, solarName: "database", fluentName: "database" }));
export const Delete02Icon = /* @__PURE__ */ glyph(Mingcute.Delete2Regular, fixedFamily ? undefined : () => ({ huge: Huge.Delete02Icon, Line: Iconoir.Trash, solarName: "trash-bin-trash", fluentName: "delete" }));
export const Dollar01Icon = /* @__PURE__ */ glyph(Mingcute.CurrencyDollarRegular, fixedFamily ? undefined : () => ({ huge: Huge.Dollar01Icon, Line: Iconoir.Dollar, solarName: "dollar", fluentName: "money" }));
export const Facebook01Icon = /* @__PURE__ */ glyph(Mingcute.FacebookRegular, fixedFamily ? undefined : () => ({ huge: Huge.Facebook01Icon, Line: Iconoir.Facebook, solarName: "like", fluentName: "thumb-like" }));
export const File01Icon = /* @__PURE__ */ glyph(Mingcute.FileRegular, fixedFamily ? undefined : () => ({ huge: Huge.File01Icon, Line: Iconoir.Page, solarName: "file", fluentName: "document" }));
export const UploadIcon = /* @__PURE__ */ glyph(Mingcute.UploadRegular, fixedFamily ? undefined : () => ({ huge: Huge.Upload04Icon, Line: Iconoir.Upload, solarName: "file", fluentName: "document" }));
/* For the affectUI screens (onboarding, settings & billing, folder) */
export const Upload04Icon = UploadIcon;
export const ArrowLeft02Icon = /* @__PURE__ */ glyph(Mingcute.ArrowLeftRegular, fixedFamily ? undefined : () => ({ huge: Huge.ArrowLeft02Icon, Line: Iconoir.ArrowLeft, solarName: "alt-arrow-left", fluentName: "chevron-left" }));
export const ChatEdit01Icon = /* @__PURE__ */ glyph(Mingcute.EditRegular, fixedFamily ? undefined : () => ({ huge: Huge.ChatEdit01Icon, Line: Iconoir.ChatLines, solarName: "pen", fluentName: "edit" }));
export const Copy01Icon = /* @__PURE__ */ glyph(Mingcute.CopyRegular, fixedFamily ? undefined : () => ({ huge: Huge.Copy01Icon, Line: Iconoir.Copy, solarName: "document-text", fluentName: "document" }));
export const CopyrightIcon = /* @__PURE__ */ glyph(Mingcute.CopyrightRegular, fixedFamily ? undefined : () => ({ huge: Huge.CopyrightIcon, Line: Iconoir.Copyright, solarName: "copyright", fluentName: "copyright" }));
export const CreditCardIcon = /* @__PURE__ */ glyph(Mingcute.BankCardRegular, fixedFamily ? undefined : () => ({ huge: Huge.CreditCardIcon, Line: Iconoir.CreditCard, solarName: "wallet-money", fluentName: "money" }));
export const CustomerSupportIcon = /* @__PURE__ */ glyph(Mingcute.HeadphoneRegular, fixedFamily ? undefined : () => ({ huge: Huge.CustomerSupportIcon, Line: Iconoir.Headset, solarName: "question-circle", fluentName: "question-circle" }));
export const Download04Icon = /* @__PURE__ */ glyph(Mingcute.DownloadRegular, fixedFamily ? undefined : () => ({ huge: Huge.Download04Icon, Line: Iconoir.Download, solarName: "file", fluentName: "document" }));
export const ImageUpload01Icon = /* @__PURE__ */ glyph(Mingcute.PicRegular, fixedFamily ? undefined : () => ({ huge: Huge.ImageUpload01Icon, Line: Iconoir.MediaImagePlus, solarName: "gallery", fluentName: "image" }));
export const Key01Icon = /* @__PURE__ */ glyph(Mingcute.Key1Regular, fixedFamily ? undefined : () => ({ huge: Huge.Key01Icon, Line: Iconoir.Key, solarName: "settings", fluentName: "settings" }));
export const Link01Icon = /* @__PURE__ */ glyph(Mingcute.LinkRegular, fixedFamily ? undefined : () => ({ huge: Huge.Link01Icon, Line: Iconoir.Link, solarName: "share", fluentName: "share" }));
export const UserMultiple02Icon = /* @__PURE__ */ glyph(Mingcute.GroupRegular, fixedFamily ? undefined : () => ({ huge: Huge.UserMultiple02Icon, Line: Iconoir.Group, solarName: "users-group-rounded", fluentName: "people-team" }));
export const UserSearch01Icon = /* @__PURE__ */ glyph(Mingcute.UserSearchRegular, fixedFamily ? undefined : () => ({ huge: Huge.UserSearch01Icon, Line: Iconoir.UserScan, solarName: "magnifier", fluentName: "people-search" }));
export const File02Icon = /* @__PURE__ */ glyph(Mingcute.DocRegular, fixedFamily ? undefined : () => ({ huge: Huge.File02Icon, Line: Iconoir.Page, solarName: "document-text", fluentName: "document-text" }));
export const FilterIcon = /* @__PURE__ */ glyph(Mingcute.FilterRegular, fixedFamily ? undefined : () => ({ huge: Huge.FilterIcon, Line: Iconoir.Filter, solarName: "filter", fluentName: "filter" }));
export const Folder01Icon = /* @__PURE__ */ glyph(Mingcute.FolderRegular, fixedFamily ? undefined : () => ({ huge: Huge.Folder01Icon, Line: Iconoir.Folder, solarName: "folder", fluentName: "folder" }));
export const FolderOpenIcon = /* @__PURE__ */ glyph(Mingcute.FolderOpenRegular, fixedFamily ? undefined : () => ({ huge: Huge.FolderOpenIcon, Line: Iconoir.Folder, solarName: "folder-open", fluentName: "folder-open" }));
export const Globe02Icon = /* @__PURE__ */ glyph(Mingcute.GlobeRegular, fixedFamily ? undefined : () => ({ huge: Huge.Globe02Icon, Line: Iconoir.Globe, solarName: "global", fluentName: "globe" }));
export const GridViewIcon = /* @__PURE__ */ glyph(Mingcute.GridRegular, fixedFamily ? undefined : () => ({ huge: Huge.GridViewIcon, Line: Iconoir.ViewGrid, solarName: "widget-2", fluentName: "grid" }));
export const HelpCircleIcon = /* @__PURE__ */ glyph(Mingcute.QuestionRegular, fixedFamily ? undefined : () => ({ huge: Huge.HelpCircleIcon, Line: Iconoir.HelpCircle, solarName: "question-circle", fluentName: "question-circle" }));
export const Home01Icon = /* @__PURE__ */ glyph(Mingcute.Home1Regular, fixedFamily ? undefined : () => ({ huge: Huge.Home01Icon, Line: Iconoir.HomeSimple, solarName: "home", fluentName: "home" }));
export const Image01Icon = /* @__PURE__ */ glyph(Mingcute.PicRegular, fixedFamily ? undefined : () => ({ huge: Huge.Image01Icon, Line: Iconoir.MediaImage, solarName: "gallery", fluentName: "image" }));
export const InstagramIcon = /* @__PURE__ */ glyph(Mingcute.InstagramRegular, fixedFamily ? undefined : () => ({ huge: Huge.InstagramIcon, Line: Iconoir.Instagram, solarName: "camera", fluentName: "camera" }));
export const LeftToRightListBulletIcon = /* @__PURE__ */ glyph(Mingcute.ListOrderedRegular, fixedFamily ? undefined : () => ({ huge: Huge.LeftToRightListBulletIcon, Line: Iconoir.List, solarName: "list", fluentName: "text-bullet-list-ltr" }));
export const Location01Icon = /* @__PURE__ */ glyph(Mingcute.LocationRegular, fixedFamily ? undefined : () => ({ huge: Huge.Location01Icon, Line: Iconoir.MapPin, solarName: "map-point", fluentName: "location" }));
export const Logout01Icon = /* @__PURE__ */ glyph(Mingcute.ExitRegular, fixedFamily ? undefined : () => ({ huge: Huge.Logout01Icon, Line: Iconoir.LogOut, solarName: "logout-2", fluentName: "sign-out" }));
export const Mail01Icon = /* @__PURE__ */ glyph(Mingcute.MailRegular, fixedFamily ? undefined : () => ({ huge: Huge.Mail01Icon, Line: Iconoir.Mail, solarName: "letter", fluentName: "mail" }));
export const Megaphone01Icon = /* @__PURE__ */ glyph(Mingcute.AnnouncementRegular, fixedFamily ? undefined : () => ({ huge: Huge.Megaphone01Icon, Line: Iconoir.Megaphone, solarName: "speaker", fluentName: "megaphone" }));
export const Mic01Icon = /* @__PURE__ */ glyph(Mingcute.MicRegular, fixedFamily ? undefined : () => ({ huge: Huge.Mic01Icon, Line: Iconoir.Microphone, solarName: "microphone", fluentName: "mic" }));
export const MoneyReceive01Icon = /* @__PURE__ */ glyph(Mingcute.WalletRegular, fixedFamily ? undefined : () => ({ huge: Huge.MoneyReceive01Icon, Line: Iconoir.Wallet, solarName: "wallet-money", fluentName: "money-hand" }));
export const MoreHorizontalIcon = /* @__PURE__ */ glyph(Mingcute.More1Regular, fixedFamily ? undefined : () => ({ huge: Huge.MoreHorizontalIcon, Line: Iconoir.MoreHoriz, solarName: "menu-dots", fluentName: "more-horizontal" }));
export const PaintBoardIcon = /* @__PURE__ */ glyph(Mingcute.PaletteRegular, fixedFamily ? undefined : () => ({ huge: Huge.PaintBoardIcon, Line: Iconoir.Palette, solarName: "palette", fluentName: "color" }));
export const PencilEdit02Icon = /* @__PURE__ */ glyph(Mingcute.EditRegular, fixedFamily ? undefined : () => ({ huge: Huge.PencilEdit02Icon, Line: Iconoir.EditPencil, solarName: "pen", fluentName: "edit" }));
export const PinIcon = /* @__PURE__ */ glyph(Mingcute.PinRegular, fixedFamily ? undefined : () => ({ huge: Huge.PinIcon, Line: Iconoir.Pin, solarName: "pin", fluentName: "pin" }));
export const PlayIcon = /* @__PURE__ */ glyph(Mingcute.PlayRegular, fixedFamily ? undefined : () => ({ huge: Huge.PlayIcon, Line: Iconoir.Play, solarName: "play", fluentName: "play" }));
export const Plug01Icon = /* @__PURE__ */ glyph(Mingcute.PluginRegular, fixedFamily ? undefined : () => ({ huge: Huge.Plug01Icon, Line: Iconoir.Puzzle, solarName: "plug-circle", fluentName: "plug-connected" }));
export const PlusSignIcon = /* @__PURE__ */ glyph(Mingcute.AddRegular, fixedFamily ? undefined : () => ({ huge: Huge.PlusSignIcon, Line: Iconoir.Plus, solarName: "add", fluentName: "add" }));
export const PresentationBarChart01Icon = /* @__PURE__ */ glyph(Mingcute.Presentation1Regular, fixedFamily ? undefined : () => ({ huge: Huge.PresentationBarChart01Icon, Line: Iconoir.Presentation, solarName: "presentation-graph", fluentName: "presenter" }));
export const Search01Icon = /* @__PURE__ */ glyph(Mingcute.SearchRegular, fixedFamily ? undefined : () => ({ huge: Huge.Search01Icon, Line: Iconoir.Search, solarName: "magnifier", fluentName: "search" }));
export const Settings01Icon = /* @__PURE__ */ glyph(Mingcute.Settings1Regular, fixedFamily ? undefined : () => ({ huge: Huge.Settings01Icon, Line: Iconoir.Settings, solarName: "settings", fluentName: "settings" }));
/** Settings in the profile menu: MingCute settings-4-fill */
export const SettingsFillIcon = /* @__PURE__ */ glyph(Settings4Filled, fixedFamily ? undefined : () => ({ huge: Huge.Settings01Icon, Line: Iconoir.Settings, solarName: "settings", fluentName: "settings" }));
/** The chat's own mark – MingCute's chat-2-ai-fill in every icon set */
export const ChatAiIcon: IconGlyph = ({ size, color, className }) => <Chat2AIFilled size={size} color={color} className={className} aria-hidden />;

/** MingCute glyphs that stay MingCute in every icon set – the learner's library, chapters and progress */
function fixed(Glyph: typeof LockRegular): IconGlyph {
  return ({ size, color, className }) => <Glyph size={size} color={color} className={className} aria-hidden />;
}
/** The learner's menu: Courses (once Study and Authoring), Explore, then the Collection – Certificates and Materials */
/** Courses: the ones you study and the ones you write, on one page */
export const CoursesIcon = /* @__PURE__ */ fixed(MortarboardFilled as typeof LockRegular);
export const StudyIcon = /* @__PURE__ */ fixed(EyeglassFilled as typeof LockRegular);
export const ExploreIcon = /* @__PURE__ */ fixed(CompassFilled as typeof LockRegular);
export const AuthoringIcon = /* @__PURE__ */ fixed(QuillPenAIFilled as typeof LockRegular);
export const CertificateIcon = /* @__PURE__ */ fixed(CertificateFilled as typeof LockRegular);
export const MaterialsIcon = /* @__PURE__ */ fixed(Book2Filled as typeof LockRegular);
/** Explore's top courses: the rank's plaque, and likes, comments and learners */
export const AwardIcon = /* @__PURE__ */ fixed(AwardFilled as typeof LockRegular);
export const LikesIcon = /* @__PURE__ */ fixed(HeartFilled as typeof LockRegular);
export const CommentsIcon = /* @__PURE__ */ fixed(CommentFilled as typeof LockRegular);
export const LearnersIcon = /* @__PURE__ */ fixed(GroupFilled as typeof LockRegular);
/** Light and dark, for the appearance toggle */
export const SunIcon = /* @__PURE__ */ fixed(SunFilled as typeof LockRegular);
export const MoonIcon = /* @__PURE__ */ fixed(MoonFilled as typeof LockRegular);
export const LockIcon = /* @__PURE__ */ fixed(LockRegular);
/** Finished: mingcute:check-fill */
export const DoneIcon = /* @__PURE__ */ fixed(CheckFilled as typeof LockRegular);
/** Not open yet: mingcute:folder-locked-fill */
export const LockedIcon = /* @__PURE__ */ fixed(FolderLockedFilled as typeof LockRegular);
export const BackIcon = /* @__PURE__ */ fixed(ArrowLeftRegular);
export const ClaudeIcon = /* @__PURE__ */ fixed(ClaudeFilled as typeof LockRegular);
/** GitHub Copilot, as an agent: the GitHub mark */
export const GitHubCopilotIcon = /* @__PURE__ */ fixed(GithubFilled as typeof LockRegular);
/** The player's settings: MingCute settings-2-line */
export const Settings02Icon = /* @__PURE__ */ glyph(Mingcute.Settings2Regular, fixedFamily ? undefined : () => ({ huge: Huge.Settings02Icon, Line: Iconoir.Settings, solarName: "settings", fluentName: "settings" }));
/** The workspace settings toggle, next to evals: MingCute settings-4-line */
export const Settings04Icon = /* @__PURE__ */ glyph(Mingcute.Settings4Regular, fixedFamily ? undefined : () => ({ huge: Huge.Settings02Icon, Line: Iconoir.Settings, solarName: "settings", fluentName: "settings" }));
export const Share08Icon = /* @__PURE__ */ glyph(Mingcute.Share2Regular, fixedFamily ? undefined : () => ({ huge: Huge.Share08Icon, Line: Iconoir.ShareIos, solarName: "share", fluentName: "share" }));
export const ShoppingBag01Icon = /* @__PURE__ */ glyph(Mingcute.ShoppingBag1Regular, fixedFamily ? undefined : () => ({ huge: Huge.ShoppingBag01Icon, Line: Iconoir.ShoppingBag, solarName: "bag", fluentName: "shopping-bag" }));
export const SidebarLeftIcon = /* @__PURE__ */ glyph(Mingcute.LayoutLeftRegular, fixedFamily ? undefined : () => ({ huge: Huge.SidebarLeftIcon, Line: Iconoir.LayoutLeft, solarName: "panel-left", fluentName: "panel-left" }));
export const SidebarRightIcon = /* @__PURE__ */ glyph(Mingcute.LayoutRightRegular, fixedFamily ? undefined : () => ({ huge: Huge.SidebarRightIcon, Line: Iconoir.LayoutRight, solarName: "panel-right", fluentName: "panel-right" }));
export const SlackIcon = /* @__PURE__ */ glyph(Mingcute.HashtagRegular, fixedFamily ? undefined : () => ({ huge: Huge.SlackIcon, Line: Iconoir.Hashtag, solarName: "hashtag", fluentName: "number-symbol" }));
export const SparklesIcon = /* @__PURE__ */ glyph(Mingcute.SparklesRegular, fixedFamily ? undefined : () => ({ huge: Huge.SparklesIcon, Line: Iconoir.Sparks, solarName: "stars", fluentName: "sparkle" }));
export const TShirtIcon = /* @__PURE__ */ glyph(Mingcute.TShirtRegular, fixedFamily ? undefined : () => ({ huge: Huge.TShirtIcon, Line: Iconoir.Shirt, solarName: "t-shirt", fluentName: "clothes-hanger" }));
export const Table01Icon = /* @__PURE__ */ glyph(Mingcute.TableRegular, fixedFamily ? undefined : () => ({ huge: Huge.Table01Icon, Line: Iconoir.Table, solarName: "table", fluentName: "table" }));
export const Target02Icon = /* @__PURE__ */ glyph(Mingcute.TargetRegular, fixedFamily ? undefined : () => ({ huge: Huge.Target02Icon, Line: Iconoir.DocMagnifyingGlass, solarName: "target", fluentName: "target" }));
export const TaskDaily01Icon = /* @__PURE__ */ glyph(Mingcute.ScheduleRegular, fixedFamily ? undefined : () => ({ huge: Huge.TaskDaily01Icon, Line: Iconoir.CalendarCheck, solarName: "calendar-mark", fluentName: "calendar-checkmark" }));
export const Telescope01Icon = /* @__PURE__ */ glyph(Mingcute.TelescopeRegular, fixedFamily ? undefined : () => ({ huge: Huge.Telescope01Icon, Line: Iconoir.Binocular, solarName: "telescope", fluentName: "people-search" }));
export const TestTube01Icon = /* @__PURE__ */ glyph(Mingcute.TestTubeRegular, fixedFamily ? undefined : () => ({ huge: Huge.TestTube01Icon, Line: Iconoir.TestTube, solarName: "test-tube", fluentName: "beaker" }));
export const Tick02Icon = /* @__PURE__ */ glyph(Mingcute.CheckRegular, fixedFamily ? undefined : () => ({ huge: Huge.Tick02Icon, Line: Iconoir.Check, solarName: "check", fluentName: "checkmark" }));
export const Ticket01Icon = /* @__PURE__ */ glyph(Mingcute.TicketRegular, fixedFamily ? undefined : () => ({ huge: Huge.Ticket01Icon, Line: Iconoir.Label, solarName: "ticket", fluentName: "ticket-diagonal" }));
export const TiktokIcon = /* @__PURE__ */ glyph(Mingcute.TiktokRegular, fixedFamily ? undefined : () => ({ huge: Huge.TiktokIcon, Line: Iconoir.Tiktok, solarName: "music-note", fluentName: "music-note-2" }));
export const UserAdd01Icon = /* @__PURE__ */ glyph(Mingcute.UserAddRegular, fixedFamily ? undefined : () => ({ huge: Huge.UserAdd01Icon, Line: Iconoir.UserPlus, solarName: "user-plus", fluentName: "person-add" }));
export const UserGroupIcon = /* @__PURE__ */ glyph(Mingcute.GroupRegular, fixedFamily ? undefined : () => ({ huge: Huge.UserGroupIcon, Line: Iconoir.Group, solarName: "users-group-rounded", fluentName: "people-team" }));
export const UserIcon = /* @__PURE__ */ glyph(Mingcute.User1Regular, fixedFamily ? undefined : () => ({ huge: Huge.UserIcon, Line: Iconoir.User, solarName: "user", fluentName: "person" }));
export const WorkflowSquare03Icon = /* @__PURE__ */ glyph(Mingcute.ProcessRegular, fixedFamily ? undefined : () => ({ huge: Huge.WorkflowSquare03Icon, Line: Iconoir.GitFork, solarName: "git-fork", fluentName: "flow" }));

/* The video player's controls. No exact match: MingCute low volume → Speaker, picture-in-picture → Miniplayer and
   Minimize; Iconoir picture-in-picture → OpenInWindow and WindowXmark */
export const PauseIcon = /* @__PURE__ */ glyph(Mingcute.PauseRegular, fixedFamily ? undefined : () => ({ huge: Huge.PauseIcon, Line: Iconoir.Pause, solarName: "pause", fluentName: "pause" }));
export const VolumeHighIcon = /* @__PURE__ */ glyph(Mingcute.VolumeRegular, fixedFamily ? undefined : () => ({ huge: Huge.VolumeHighIcon, Line: Iconoir.SoundHigh, solarName: "volume-loud", fluentName: "speaker-2" }));
export const VolumeLowIcon = /* @__PURE__ */ glyph(Mingcute.VolumeRegular, fixedFamily ? undefined : () => ({ huge: Huge.VolumeLowIcon, Line: Iconoir.SoundLow, solarName: "volume-small", fluentName: "speaker-1" }));
export const VolumeMute02Icon = /* @__PURE__ */ glyph(Mingcute.VolumeMuteRegular, fixedFamily ? undefined : () => ({ huge: Huge.VolumeMute02Icon, Line: Iconoir.SoundOff, solarName: "volume-cross", fluentName: "speaker-mute" }));
export const FullScreenIcon = /* @__PURE__ */ glyph(Mingcute.FullscreenRegular, fixedFamily ? undefined : () => ({ huge: Huge.FullScreenIcon, Line: Iconoir.Expand, solarName: "maximize-square", fluentName: "full-screen-maximize" }));
export const MinimizeScreenIcon = /* @__PURE__ */ glyph(Mingcute.FullscreenExitRegular, fixedFamily ? undefined : () => ({ huge: Huge.MinimizeScreenIcon, Line: Iconoir.Collapse, solarName: "minimize-square", fluentName: "full-screen-minimize" }));
export const PictureInPictureOnIcon = /* @__PURE__ */ glyph(Mingcute.MiniplayerRegular, fixedFamily ? undefined : () => ({ huge: Huge.PictureInPictureOnIcon, Line: Iconoir.OpenInWindow, solarName: "pip", fluentName: "picture-in-picture" }));
export const PictureInPictureExitIcon = /* @__PURE__ */ glyph(Mingcute.MinimizeRegular, fixedFamily ? undefined : () => ({ huge: Huge.PictureInPictureExitIcon, Line: Iconoir.WindowXmark, solarName: "pip-2", fluentName: "picture-in-picture-exit" }));
export const ArrowLeft01Icon = /* @__PURE__ */ glyph(Mingcute.LeftRegular, fixedFamily ? undefined : () => ({ huge: Huge.ArrowLeft01Icon, Line: Iconoir.NavArrowLeft, solarName: "alt-arrow-left", fluentName: "chevron-left" }));
