export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          user_id: string | null
          user_initials: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
          user_initials?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
          user_initials?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      batch_stages: {
        Row: {
          batch_id: string
          comments: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          operators_count: number | null
          settings: Json | null
          stage_type: string
          started_at: string | null
        }
        Insert: {
          batch_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          operators_count?: number | null
          settings?: Json | null
          stage_type: string
          started_at?: string | null
        }
        Update: {
          batch_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          operators_count?: number | null
          settings?: Json | null
          stage_type?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_stages_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_number: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          drying_location: string | null
          harvest_date: string | null
          harvest_room: string | null
          id: string
          plant_count: number | null
          status: string
          strain: string | null
          weight_per_plant: number | null
        }
        Insert: {
          batch_number: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          drying_location?: string | null
          harvest_date?: string | null
          harvest_room?: string | null
          id?: string
          plant_count?: number | null
          status?: string
          strain?: string | null
          weight_per_plant?: number | null
        }
        Update: {
          batch_number?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          drying_location?: string | null
          harvest_date?: string | null
          harvest_room?: string | null
          id?: string
          plant_count?: number | null
          status?: string
          strain?: string | null
          weight_per_plant?: number | null
        }
        Relationships: []
      }
      drying_logs: {
        Row: {
          batch_id: string
          comments: string | null
          created_at: string
          created_by: string | null
          humidity_current: number | null
          humidity_external: number | null
          humidity_setpoint: number | null
          id: string
          log_date: string
          room_number: string | null
          temp_current: number | null
          temp_external: number | null
          temp_setpoint: number | null
        }
        Insert: {
          batch_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          humidity_current?: number | null
          humidity_external?: number | null
          humidity_setpoint?: number | null
          id?: string
          log_date?: string
          room_number?: string | null
          temp_current?: number | null
          temp_external?: number | null
          temp_setpoint?: number | null
        }
        Update: {
          batch_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          humidity_current?: number | null
          humidity_external?: number | null
          humidity_setpoint?: number | null
          id?: string
          log_date?: string
          room_number?: string | null
          temp_current?: number | null
          temp_external?: number | null
          temp_setpoint?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drying_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      event_items: {
        Row: {
          direction: string | null
          event_id: string
          id: string
          inventory_lot_id: string | null
          quantity_grams: number | null
          units: number | null
        }
        Insert: {
          direction?: string | null
          event_id: string
          id?: string
          inventory_lot_id?: string | null
          quantity_grams?: number | null
          units?: number | null
        }
        Update: {
          direction?: string | null
          event_id?: string
          id?: string
          inventory_lot_id?: string | null
          quantity_grams?: number | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_items_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          event_number: string
          event_type: string | null
          id: string
          notes: string | null
          related_batch_id: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          event_number: string
          event_type?: string | null
          id?: string
          notes?: string | null
          related_batch_id?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          event_number?: string
          event_type?: string | null
          id?: string
          notes?: string | null
          related_batch_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_related_batch_id_fkey"
            columns: ["related_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      excise_reels: {
        Row: {
          box_id: string | null
          id: string
          original_quantity: number | null
          province: string | null
          received_at: string | null
          serial_number: string
          spoiled_at_reception: number
          status: string | null
        }
        Insert: {
          box_id?: string | null
          id?: string
          original_quantity?: number | null
          province?: string | null
          received_at?: string | null
          serial_number: string
          spoiled_at_reception?: number
          status?: string | null
        }
        Update: {
          box_id?: string | null
          id?: string
          original_quantity?: number | null
          province?: string | null
          received_at?: string | null
          serial_number?: string
          spoiled_at_reception?: number
          status?: string | null
        }
        Relationships: []
      }
      inventory_lots: {
        Row: {
          batch_id: string | null
          created_at: string
          flower_size: string | null
          format: string | null
          id: string
          location: string | null
          lot_number: string
          parent_lot_id: string | null
          product_type: string | null
          quantity_grams: number | null
          status: string | null
          units: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          flower_size?: string | null
          format?: string | null
          id?: string
          location?: string | null
          lot_number: string
          parent_lot_id?: string | null
          product_type?: string | null
          quantity_grams?: number | null
          status?: string | null
          units?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          flower_size?: string | null
          format?: string | null
          id?: string
          location?: string | null
          lot_number?: string
          parent_lot_id?: string | null
          product_type?: string | null
          quantity_grams?: number | null
          status?: string | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_parent_lot_id_fkey"
            columns: ["parent_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_formats: {
        Row: {
          id: string
          is_active: boolean
          name: string
          net_weight_grams: number | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          net_weight_grams?: number | null
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          net_weight_grams?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          initials: string | null
          is_active: boolean
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          initials?: string | null
          is_active?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          initials?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      samples: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          is_destruction: boolean
          notes: string | null
          sample_date: string
          sample_type: string | null
          stage_id: string | null
          weight_grams: number | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_destruction?: boolean
          notes?: string | null
          sample_date?: string
          sample_type?: string | null
          stage_id?: string | null
          weight_grams?: number | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_destruction?: boolean
          notes?: string | null
          sample_date?: string
          sample_type?: string | null
          stage_id?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "batch_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stamp_movements: {
        Row: {
          comments: string | null
          event_id: string | null
          id: string
          lot_id: string | null
          moved_at: string
          movement_type: string | null
          quantity: number | null
          reel_id: string
        }
        Insert: {
          comments?: string | null
          event_id?: string | null
          id?: string
          lot_id?: string | null
          moved_at?: string
          movement_type?: string | null
          quantity?: number | null
          reel_id: string
        }
        Update: {
          comments?: string | null
          event_id?: string | null
          id?: string
          lot_id?: string | null
          moved_at?: string
          movement_type?: string | null
          quantity?: number | null
          reel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stamp_movements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_movements_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "excise_reels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weights: {
        Row: {
          batch_id: string
          category: string | null
          comments: string | null
          container_count: number | null
          id: string
          recorded_at: string
          stage: string | null
          weight_grams: number | null
        }
        Insert: {
          batch_id: string
          category?: string | null
          comments?: string | null
          container_count?: number | null
          id?: string
          recorded_at?: string
          stage?: string | null
          weight_grams?: number | null
        }
        Update: {
          batch_id?: string
          category?: string | null
          comments?: string | null
          container_count?: number | null
          id?: string
          recorded_at?: string
          stage?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weights_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_event_item_stock: {
        Args: {
          _direction: string
          _grams: number
          _lot_id: string
          _sign: number
          _units: number
        }
        Returns: undefined
      }
      current_user_display: {
        Args: never
        Returns: {
          uid: string
          uinitials: string
          uname: string
        }[]
      }
      delete_packaged_lot: { Args: { _lot_id: string }; Returns: undefined }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recompute_reel_status: { Args: { _reel_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "operator" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "operator", "viewer"],
    },
  },
} as const
