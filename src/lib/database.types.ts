export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      campaigns: {
        Row: {
          active: boolean;
          audience: Json;
          content_id: string | null;
          created_at: string;
          ends_at: string | null;
          id: string;
          kind: string;
          name: string;
          override_body: string | null;
          override_title: string | null;
          priority: number;
          starts_at: string;
        };
        Insert: {
          active?: boolean;
          audience?: Json;
          content_id?: string | null;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          kind: string;
          name: string;
          override_body?: string | null;
          override_title?: string | null;
          priority?: number;
          starts_at?: string;
        };
        Update: {
          active?: boolean;
          audience?: Json;
          content_id?: string | null;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          override_body?: string | null;
          override_title?: string | null;
          priority?: number;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaigns_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
        ];
      };
      content_items: {
        Row: {
          active: boolean;
          author: string | null;
          body: string;
          categories: string[];
          created_at: string;
          id: string;
          notification_eligible: boolean;
          priority: number;
          tags: string[];
          type: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          author?: string | null;
          body: string;
          categories?: string[];
          created_at?: string;
          id?: string;
          notification_eligible?: boolean;
          priority?: number;
          tags?: string[];
          type: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          author?: string | null;
          body?: string;
          categories?: string[];
          created_at?: string;
          id?: string;
          notification_eligible?: boolean;
          priority?: number;
          tags?: string[];
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      daily_progress: {
        Row: {
          content_id: string;
          local_date: string;
          user_id: string;
          viewed_at: string;
        };
        Insert: {
          content_id: string;
          local_date: string;
          user_id: string;
          viewed_at?: string;
        };
        Update: {
          content_id?: string;
          local_date?: string;
          user_id?: string;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_progress_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_sets: {
        Row: {
          content_ids: string[];
          created_at: string;
          local_date: string;
          type: string;
          user_id: string;
        };
        Insert: {
          content_ids: string[];
          created_at?: string;
          local_date: string;
          type: string;
          user_id: string;
        };
        Update: {
          content_ids?: string[];
          created_at?: string;
          local_date?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          active: boolean;
          app_version: string | null;
          created_at: string;
          id: string;
          install_id: string;
          last_seen_at: string;
          locale: string | null;
          permission_status: string;
          platform: string;
          push_token: string | null;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          app_version?: string | null;
          created_at?: string;
          id?: string;
          install_id: string;
          last_seen_at?: string;
          locale?: string | null;
          permission_status?: string;
          platform: string;
          push_token?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          app_version?: string | null;
          created_at?: string;
          id?: string;
          install_id?: string;
          last_seen_at?: string;
          locale?: string | null;
          permission_status?: string;
          platform?: string;
          push_token?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      entitlements: {
        Row: {
          expires_at: string | null;
          is_premium: boolean;
          period_type: string | null;
          product_id: string | null;
          source: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          expires_at?: string | null;
          is_premium?: boolean;
          period_type?: string | null;
          product_id?: string | null;
          source?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          expires_at?: string | null;
          is_premium?: boolean;
          period_type?: string | null;
          product_id?: string | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          content_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          content_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_deliveries: {
        Row: {
          body: string | null;
          campaign_id: string | null;
          content_id: string | null;
          content_snapshot: Json | null;
          created_at: string;
          device_id: string | null;
          error_detail: string | null;
          expo_ticket_id: string | null;
          id: string;
          idempotency_key: string;
          kind: string;
          local_date: string;
          sent_at: string | null;
          slot: number;
          status: string;
          title: string | null;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          campaign_id?: string | null;
          content_id?: string | null;
          content_snapshot?: Json | null;
          created_at?: string;
          device_id?: string | null;
          error_detail?: string | null;
          expo_ticket_id?: string | null;
          id?: string;
          idempotency_key: string;
          kind: string;
          local_date: string;
          sent_at?: string | null;
          slot?: number;
          status?: string;
          title?: string | null;
          user_id: string;
        };
        Update: {
          body?: string | null;
          campaign_id?: string | null;
          content_id?: string | null;
          content_snapshot?: Json | null;
          created_at?: string;
          device_id?: string | null;
          error_detail?: string | null;
          expo_ticket_id?: string | null;
          id?: string;
          idempotency_key?: string;
          kind?: string;
          local_date?: string;
          sent_at?: string | null;
          slot?: number;
          status?: string;
          title?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_deliveries_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_prefs: {
        Row: {
          affirmations_per_day: number;
          quiet_end_minutes: number | null;
          quiet_start_minutes: number | null;
          quotes_per_day: number;
          streak_reminder: boolean;
          trial_reminder: boolean;
          updated_at: string;
          user_id: string;
          window_end_minutes: number;
          window_start_minutes: number;
        };
        Insert: {
          affirmations_per_day?: number;
          quiet_end_minutes?: number | null;
          quiet_start_minutes?: number | null;
          quotes_per_day?: number;
          streak_reminder?: boolean;
          trial_reminder?: boolean;
          updated_at?: string;
          user_id: string;
          window_end_minutes?: number;
          window_start_minutes?: number;
        };
        Update: {
          affirmations_per_day?: number;
          quiet_end_minutes?: number | null;
          quiet_start_minutes?: number | null;
          quotes_per_day?: number;
          streak_reminder?: boolean;
          trial_reminder?: boolean;
          updated_at?: string;
          user_id?: string;
          window_end_minutes?: number;
          window_start_minutes?: number;
        };
        Relationships: [];
      };
      notification_state: {
        Row: {
          affirmations_sent: number;
          local_date: string | null;
          next_due_at: string | null;
          quotes_sent: number;
          streak_risk_sent_on: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          affirmations_sent?: number;
          local_date?: string | null;
          next_due_at?: string | null;
          quotes_sent?: number;
          streak_risk_sent_on?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          affirmations_sent?: number;
          local_date?: string | null;
          next_due_at?: string | null;
          quotes_sent?: number;
          streak_risk_sent_on?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      personalization: {
        Row: {
          affirmation_interests: string[];
          created_at: string;
          future_traits: string[];
          gender: string | null;
          life_goal: string | null;
          motivation_level: string | null;
          obstacles: string[];
          onboarding_completed_at: string | null;
          primary_goals: string[];
          quote_interests: string[];
          raw_answers: Json;
          updated_at: string;
          user_id: string;
          variant: string | null;
        };
        Insert: {
          affirmation_interests?: string[];
          created_at?: string;
          future_traits?: string[];
          gender?: string | null;
          life_goal?: string | null;
          motivation_level?: string | null;
          obstacles?: string[];
          onboarding_completed_at?: string | null;
          primary_goals?: string[];
          quote_interests?: string[];
          raw_answers?: Json;
          updated_at?: string;
          user_id: string;
          variant?: string | null;
        };
        Update: {
          affirmation_interests?: string[];
          created_at?: string;
          future_traits?: string[];
          gender?: string | null;
          life_goal?: string | null;
          motivation_level?: string | null;
          obstacles?: string[];
          onboarding_completed_at?: string | null;
          primary_goals?: string[];
          quote_interests?: string[];
          raw_answers?: Json;
          updated_at?: string;
          user_id?: string;
          variant?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          install_id: string | null;
          locale: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          install_id?: string | null;
          locale?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          install_id?: string | null;
          locale?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      streak_completions: {
        Row: {
          completed_at: string;
          local_date: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string;
          local_date: string;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          local_date?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      streaks: {
        Row: {
          current_streak: number;
          last_completed_date: string | null;
          longest_streak: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          current_streak?: number;
          last_completed_date?: string | null;
          longest_streak?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          current_streak?: number;
          last_completed_date?: string | null;
          longest_streak?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      save_notification_prefs: {
        Args: { p_changes: Json; p_initial: boolean };
        Returns: Json;
      };
      save_daily_set: {
        Args: { p_local_date: string; p_type: string; p_content_ids: string[] };
        Returns: string[];
      };
      compute_next_due: {
        Args: {
          p_local_now: string;
          p_quiet_end: number;
          p_quiet_start: number;
          p_sent_today: number;
          p_total_per_day: number;
          p_tz: string;
          p_window_end: number;
          p_window_start: number;
        };
        Returns: string;
      };
      deactivate_device: { Args: { p_install_id: string }; Returns: undefined };
      enqueue_due_notifications: {
        Args: { p_batch?: number };
        Returns: number;
      };
      invoke_push_function: { Args: { p_path: string }; Returns: undefined };
      recalc_my_notification_state: { Args: never; Returns: undefined };
      recalc_notification_state: {
        Args: { p_user: string };
        Returns: undefined;
      };
      record_view: {
        Args: { p_content_id: string; p_local_date: string };
        Returns: {
          completed_today: boolean;
          current_streak: number;
          longest_streak: number;
          viewed_today: number;
        }[];
      };
      register_device: {
        Args: {
          p_app_version: string;
          p_install_id: string;
          p_locale: string;
          p_permission_status: string;
          p_platform: string;
          p_push_token: string;
          p_timezone: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
