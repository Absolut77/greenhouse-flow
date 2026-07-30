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
          metadata: Json
          operators_count: number | null
          settings: Json | null
          stage_type: string
          started_at: string | null
          status: string
        }
        Insert: {
          batch_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          operators_count?: number | null
          settings?: Json | null
          stage_type: string
          started_at?: string | null
          status?: string
        }
        Update: {
          batch_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          operators_count?: number | null
          settings?: Json | null
          stage_type?: string
          started_at?: string | null
          status?: string
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
          dry_cap_grams: number | null
          dry_cap_locked_at: string | null
          drying_location: string | null
          external_processor: string | null
          harvest_date: string | null
          harvest_room: string | null
          id: string
          parent_batch_id: string | null
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
          dry_cap_grams?: number | null
          dry_cap_locked_at?: string | null
          drying_location?: string | null
          external_processor?: string | null
          harvest_date?: string | null
          harvest_room?: string | null
          id?: string
          parent_batch_id?: string | null
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
          dry_cap_grams?: number | null
          dry_cap_locked_at?: string | null
          drying_location?: string | null
          external_processor?: string | null
          harvest_date?: string | null
          harvest_room?: string | null
          id?: string
          parent_batch_id?: string | null
          plant_count?: number | null
          status?: string
          strain?: string | null
          weight_per_plant?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_parent_batch_id_fkey"
            columns: ["parent_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      curing_containers: {
        Row: {
          batch_id: string
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          notes: string | null
          stage_id: string | null
          updated_at: string
          weight_in_grams: number
          weight_out_grams: number | null
        }
        Insert: {
          batch_id: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          notes?: string | null
          stage_id?: string | null
          updated_at?: string
          weight_in_grams?: number
          weight_out_grams?: number | null
        }
        Update: {
          batch_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          notes?: string | null
          stage_id?: string | null
          updated_at?: string
          weight_in_grams?: number
          weight_out_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "curing_containers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curing_containers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "batch_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      destructions: {
        Row: {
          batch_id: string
          comments: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          is_sanitation_log: boolean
          person_count: number | null
          phase: string | null
          photos: string[]
          reason: string | null
          sanitation_products: string | null
          sanitation_type: string | null
          stage_code: string | null
          stage_id: string | null
          updated_at: string
          weight_grams: number
        }
        Insert: {
          batch_id: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          is_sanitation_log?: boolean
          person_count?: number | null
          phase?: string | null
          photos?: string[]
          reason?: string | null
          sanitation_products?: string | null
          sanitation_type?: string | null
          stage_code?: string | null
          stage_id?: string | null
          updated_at?: string
          weight_grams?: number
        }
        Update: {
          batch_id?: string
          comments?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          is_sanitation_log?: boolean
          person_count?: number | null
          phase?: string | null
          photos?: string[]
          reason?: string | null
          sanitation_products?: string | null
          sanitation_type?: string | null
          stage_code?: string | null
          stage_id?: string | null
          updated_at?: string
          weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "destructions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destructions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "batch_stages"
            referencedColumns: ["id"]
          },
        ]
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
          container_id: string | null
          direction: string | null
          event_id: string
          id: string
          inventory_lot_id: string | null
          quantity_grams: number | null
          units: number | null
        }
        Insert: {
          container_id?: string | null
          direction?: string | null
          event_id: string
          id?: string
          inventory_lot_id?: string | null
          quantity_grams?: number | null
          units?: number | null
        }
        Update: {
          container_id?: string | null
          direction?: string | null
          event_id?: string
          id?: string
          inventory_lot_id?: string | null
          quantity_grams?: number | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_items_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "stock_containers"
            referencedColumns: ["id"]
          },
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
          carrier: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          dry_destroyed_grams: number | null
          event_number: string
          event_type: string | null
          id: string
          linked_shipment_event_id: string | null
          notes: string | null
          processing_loss_grams: number | null
          reception_kind: string | null
          reference_number: string | null
          related_batch_id: string | null
          shipment_kind: string | null
          status: string | null
          supplier: string | null
        }
        Insert: {
          carrier?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          dry_destroyed_grams?: number | null
          event_number: string
          event_type?: string | null
          id?: string
          linked_shipment_event_id?: string | null
          notes?: string | null
          processing_loss_grams?: number | null
          reception_kind?: string | null
          reference_number?: string | null
          related_batch_id?: string | null
          shipment_kind?: string | null
          status?: string | null
          supplier?: string | null
        }
        Update: {
          carrier?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          dry_destroyed_grams?: number | null
          event_number?: string
          event_type?: string | null
          id?: string
          linked_shipment_event_id?: string | null
          notes?: string | null
          processing_loss_grams?: number | null
          reception_kind?: string | null
          reference_number?: string | null
          related_batch_id?: string | null
          shipment_kind?: string | null
          status?: string | null
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_linked_shipment_event_id_fkey"
            columns: ["linked_shipment_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
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
          format_id: string | null
          id: string
          location: string | null
          lot_kind: string
          lot_number: string
          notes: string | null
          parent_lot_id: string | null
          product_type: string | null
          quantity_grams: number | null
          status: string | null
          strain: string | null
          units: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          flower_size?: string | null
          format?: string | null
          format_id?: string | null
          id?: string
          location?: string | null
          lot_kind?: string
          lot_number: string
          notes?: string | null
          parent_lot_id?: string | null
          product_type?: string | null
          quantity_grams?: number | null
          status?: string | null
          strain?: string | null
          units?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          flower_size?: string | null
          format?: string | null
          format_id?: string | null
          id?: string
          location?: string | null
          lot_kind?: string
          lot_number?: string
          notes?: string | null
          parent_lot_id?: string | null
          product_type?: string | null
          quantity_grams?: number | null
          status?: string | null
          strain?: string | null
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
            foreignKeyName: "inventory_lots_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "packaging_formats"
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
      non_cannabis_receptions: {
        Row: {
          category: string | null
          created_at: string
          event_id: string
          id: string
          item_name: string
          location: string | null
          notes: string | null
          quantity: number | null
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_id: string
          id?: string
          item_name: string
          location?: string | null
          notes?: string | null
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          event_id?: string
          id?: string
          item_name?: string
          location?: string | null
          notes?: string | null
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "non_cannabis_receptions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          current_value: number
          kind: string
          updated_at: string
          year: number
        }
        Insert: {
          current_value?: number
          kind: string
          updated_at?: string
          year: number
        }
        Update: {
          current_value?: number
          kind?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      packaging_bags: {
        Row: {
          bag_count: number
          bag_type: string
          batch_id: string
          created_at: string
          created_by: string | null
          flower_type: string
          format_id: string | null
          gross_weight_grams: number | null
          id: string
          inventory_lot_id: string | null
          location: string | null
          net_weight_grams: number
          notes: string | null
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          bag_count?: number
          bag_type: string
          batch_id: string
          created_at?: string
          created_by?: string | null
          flower_type: string
          format_id?: string | null
          gross_weight_grams?: number | null
          id?: string
          inventory_lot_id?: string | null
          location?: string | null
          net_weight_grams: number
          notes?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          bag_count?: number
          bag_type?: string
          batch_id?: string
          created_at?: string
          created_by?: string | null
          flower_type?: string
          format_id?: string | null
          gross_weight_grams?: number | null
          id?: string
          inventory_lot_id?: string | null
          location?: string | null
          net_weight_grams?: number
          notes?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_bags_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_bags_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "packaging_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_bags_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_bags_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "batch_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_formats: {
        Row: {
          created_at: string
          format_type: string
          id: string
          is_active: boolean
          is_free_weight: boolean
          name: string
          net_weight_grams: number | null
          sort_order: number
          unit_weight_grams: number
          units_per_pack: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          format_type?: string
          id?: string
          is_active?: boolean
          is_free_weight?: boolean
          name: string
          net_weight_grams?: number | null
          sort_order?: number
          unit_weight_grams?: number
          units_per_pack?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          format_type?: string
          id?: string
          is_active?: boolean
          is_free_weight?: boolean
          name?: string
          net_weight_grams?: number | null
          sort_order?: number
          unit_weight_grams?: number
          units_per_pack?: number
          updated_at?: string
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
          analysis_data: Json | null
          analysis_weight_grams: number | null
          batch_id: string
          container_id: string | null
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
          analysis_data?: Json | null
          analysis_weight_grams?: number | null
          batch_id: string
          container_id?: string | null
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
          analysis_data?: Json | null
          analysis_weight_grams?: number | null
          batch_id?: string
          container_id?: string | null
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
            foreignKeyName: "samples_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "curing_containers"
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
      stock_cartons: {
        Row: {
          carton_code: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          location: string | null
          lot_id: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          carton_code: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          location?: string | null
          lot_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          carton_code?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          location?: string | null
          lot_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_cartons_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_cartons_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_containers: {
        Row: {
          carton_id: string | null
          container_code: string
          container_type: string
          created_at: string
          created_by: string | null
          format_id: string | null
          gross_weight_grams: number | null
          id: string
          location: string | null
          lot_id: string
          net_weight_grams: number
          notes: string | null
          status: string
          unit_count: number
          unit_weight_grams: number
          updated_at: string
        }
        Insert: {
          carton_id?: string | null
          container_code: string
          container_type?: string
          created_at?: string
          created_by?: string | null
          format_id?: string | null
          gross_weight_grams?: number | null
          id?: string
          location?: string | null
          lot_id: string
          net_weight_grams?: number
          notes?: string | null
          status?: string
          unit_count?: number
          unit_weight_grams?: number
          updated_at?: string
        }
        Update: {
          carton_id?: string | null
          container_code?: string
          container_type?: string
          created_at?: string
          created_by?: string | null
          format_id?: string | null
          gross_weight_grams?: number | null
          id?: string
          location?: string | null
          lot_id?: string
          net_weight_grams?: number
          notes?: string | null
          status?: string
          unit_count?: number
          unit_weight_grams?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_containers_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "stock_cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_containers_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "packaging_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_containers_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
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
      lot_container_summary: {
        Row: {
          available_containers: number | null
          available_grams: number | null
          available_units: number | null
          container_type: string | null
          lot_id: string | null
          total_containers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_containers_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_count: { Args: never; Returns: number }
      apply_event_item_container: {
        Args: {
          _container_id: string
          _direction: string
          _grams: number
          _sign: number
          _units: number
        }
        Returns: undefined
      }
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
      close_event:
        | {
            Args: {
              _completed_at?: string
              _dry_destroyed_g: number
              _event_id: string
              _lot_name: string
              _unit_weight_g: number
              _units: number
              _used_g: number
            }
            Returns: string
          }
        | {
            Args: {
              _completed_at?: string
              _dry_destroyed_g: number
              _event_id: string
              _lot_name: string
              _surplus_returns?: Json
              _unit_weight_g: number
              _units: number
              _used_g: number
            }
            Returns: string
          }
      current_user_display: {
        Args: never
        Returns: {
          uid: string
          uinitials: string
          uname: string
        }[]
      }
      delete_batch_cascade: { Args: { _batch_id: string }; Returns: undefined }
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
      import_bulk_inventory: { Args: { _payload: Json }; Returns: Json }
      next_number: { Args: { _kind: string }; Returns: string }
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
