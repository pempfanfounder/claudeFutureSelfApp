// Shared types for the Future Self edge functions.

export type PushKind = 'quote' | 'affirmation' | 'streak_risk' | 'trial_reminder';

export const PUSH_KINDS: readonly PushKind[] = [
  'quote',
  'affirmation',
  'streak_risk',
  'trial_reminder',
];

/** Payload enqueued into pgmq 'push_jobs' by the in-DB cron functions. */
export interface PushJob {
  user_id: string;
  kind: PushKind;
  /** YYYY-MM-DD in the user's timezone. */
  local_date: string;
  slot: number;
}

/** Row shape returned by public.queue_read (pgmq.message_record). */
export interface QueueMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: PushJob;
}

export interface DeviceRow {
  id: string;
  push_token: string;
  platform: string;
}

export interface NotificationPrefsRow {
  quotes_per_day: number;
  affirmations_per_day: number;
  streak_reminder: boolean;
  trial_reminder: boolean | null;
}

export interface PersonalizationRow {
  variant: string | null;
  primary_goals: string[] | null;
  obstacles: string[] | null;
  future_traits: string[] | null;
  quote_interests: string[] | null;
  affirmation_interests: string[] | null;
}

export interface CampaignRow {
  id: string;
  kind: string;
  content_id: string | null;
  override_title: string | null;
  override_body: string | null;
  audience: Record<string, unknown> | null;
  priority: number;
}
