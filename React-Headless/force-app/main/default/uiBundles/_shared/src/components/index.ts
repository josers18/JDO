export { formatValue, type ValueFormat } from './format';
export { useCountUp } from './useCountUp';
export { Sparkline } from './Sparkline';
export { GlassCard } from './GlassCard';
export { KpiTile } from './KpiTile';
export { Gauge } from './Gauge';
export { HealthRing } from './HealthRing';
export { ProgressBar } from './ProgressBar';
export { AttentionQueue, type AttentionItem } from './AttentionQueue';
export { HeroPulseBar, type PulseStat } from './HeroPulseBar';
export { AssistantDock, type AssistantMessage } from './AssistantDock';
export { DataList, type DataListRow } from './DataList';
export { DataTable, type TableColumn } from './DataTable';
export { Icon, type IconKey } from './iconMap';
export { Eyebrow } from './Eyebrow';
export { Pill, type PillTone } from './Pill';
export { ScoreRing, type RingTone } from './ScoreRing';
export { StatTile, type StatTone } from './StatTile';
export { Panel } from './Panel';
export { Meter } from './Meter';
export { EntityRow } from './EntityRow';
export { HeroBand } from './HeroBand';
export { AgentforceChat, CUMULUS_AGENTS, type AgentOption } from './AgentforceChat';
export { AppLauncher } from './AppLauncher';
export { UserMenu } from './UserMenu';
export { GlobalSearch, type SearchHit } from './GlobalSearch';
export { NotificationBell, type Alert } from './NotificationBell';

// ── Command-center home system ─────────────────────────────────
export { Button, type ButtonVariant, type ButtonSize } from './Button';
export { Modal, CrmNote } from './Modal';
export { ToastProvider, useToast } from './Toast';
export { CommandRail, type CommandRailSection, type CommandRailArcStep, type CommandRailPinned } from './CommandRail';
export { RightNowCard, type RightNowCardItem } from './RightNowCard';
export { PriorityQueueRow, type PriorityQueueRowItem, type QueueTier } from './PriorityQueueRow';
export {
  PriorityQueueCard,
  type PriorityQueueCardItem,
  type QueueSeverity,
  type QueueDueTier,
} from './PriorityQueueCard';
export { RecommendationCard, type RecommendationCardItem, type RecommendationKind } from './RecommendationCard';
export { type ClientProfile, type ClientSignal, type ClientTimelineEntry } from './home/types';
export { TaskModal } from './home/TaskModal';
export { ScheduleModal } from './home/ScheduleModal';
export { ScheduleDetailModal } from './home/ScheduleDetailModal';
export { CustomerGoalModal } from './home/CustomerGoalModal';
export type { CustomerGoalItem } from './home/types';
export {
  GOAL_STATUS_OPTIONS,
  GOAL_PRIORITY_OPTIONS,
  GOAL_TYPE_OPTIONS,
} from './home/types';
export { LifeEventModal } from './home/LifeEventModal';
export type { LifeEventItem } from './home/types';
export { LIFE_EVENT_TYPE_OPTIONS } from './home/types';
export { LeadModal } from './home/LeadModal';
export type { LeadItem } from './home/types';
export { LEAD_STATUS_OPTIONS, LEAD_SOURCE_OPTIONS } from './home/types';
export { tagSchedule, scheduleCounts } from './home/schedule';
export { ScheduleTable } from './home/ScheduleTable';
export { useReveal, RevealFooter, type RevealState } from './home/Reveal';
export {
  HomeViewProvider,
  HomeViewToggle,
  useHomeView,
  type HomeView,
} from './home/HomeView';
export type { ScheduleItem, ScheduleBucketKey } from './home/types';
export { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS } from './home/types';
export { CaseModal } from './home/CaseModal';
export { EmailModal } from './home/EmailModal';
export { PrepModal } from './home/PrepModal';
export { AiResultModal } from './home/AiResultModal';
export { DraftFollowupsModal, type DraftRow } from './home/DraftFollowupsModal';
export { useSpeech } from './home/useSpeech';
export { QuickViewModal } from './home/QuickViewModal';
export { WhyModal } from './home/WhyModal';
export { DetailModal, type DetailModalData } from './home/DetailModal';
export { DataExplorerModal, type ExplorerColumn, type ExplorerFilter } from './home/DataExplorerModal';
export {
  WorkspacePanel,
  type WorkspaceSelection,
  type WorkspaceSelectionKind,
  type WorkspacePanelHandlers,
  type WorkspaceBrief,
  type WorkspaceFact,
  type WorkspaceListItem,
  type WorkspaceAgendaItem,
  type PanelSignal,
  type PanelTimelineEntry,
  type ClientSelection,
  type TaskSelection,
  type OpportunitySelection,
  type MeetingSelection,
} from './home/WorkspacePanel';
export {
  WorkspaceSelectionProvider,
  useWorkspaceSelection,
  type PinnedClientRequest,
} from './home/WorkspaceSelection';

// ── Command-center configuration page ──────────────────────────
export { ConfigPage } from './config/ConfigPage';
export { BrandThemeSection } from './config/BrandThemeSection';
export { DisplaySizeControl } from './config/DisplaySizeControl';
