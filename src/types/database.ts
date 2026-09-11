// OTOMATIK URETILDI - ELLE DUZENLEMEYIN
//
// Kaynak: Supabase projesi ryuguxxnmccybquqigji (Tokyo), 2026-09-10.
// 2026-09-11'den beri aktif proje zxdojwbrttdarcgytzsi (Frankfurt); sema
// tasimada birebir kopyalandi ve dogrulandi.
// Yeniden uretmek icin: Supabase MCP `generate_typescript_types`
// veya: supabase gen types typescript --project-id zxdojwbrttdarcgytzsi
//
// Sema degistiginde (yeni migration) bu dosya da yenilenmelidir.
//
// 2026-09-10: 20260910000100 ile products_with_metrics view'i ve pg_trgm,
// 20260910000200 ile dashboard_summary view'i eklendi. View kolonlari nullable
// gorunur (Postgres view uzerinden NOT NULL garantisi veremez) - productService
// ve dashboardService bunu ?? ile karsilar.
//
// 20260910131409/131448: product_filter_counts view'i ve search_products
// fonksiyonu eklendi; products_with_metrics'e stock_code_normalized geldi.
//
// 20260910191458: product_filter_counts'a no_address kolonu.
// 20260910193945: address_record_counts view'i ve search_address_records
// fonksiyonu (Adresler ekraninin sunucu tarafi sorgusu).

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
      address_conflicts: {
        Row: {
          address: string
          conflict_type: string
          created_at: string
          existing_carton_count: number | null
          existing_created_at: string | null
          existing_is_active: boolean | null
          existing_record_id: string | null
          existing_updated_at: string | null
          id: string
          incoming_address: string
          incoming_barcode: string | null
          incoming_carton_count: number
          incoming_source: string | null
          incoming_stock_code: string
          incoming_stock_name: string
          product_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          stock_code: string
          stock_name: string
        }
        Insert: {
          address: string
          conflict_type?: string
          created_at?: string
          existing_carton_count?: number | null
          existing_created_at?: string | null
          existing_is_active?: boolean | null
          existing_record_id?: string | null
          existing_updated_at?: string | null
          id?: string
          incoming_address: string
          incoming_barcode?: string | null
          incoming_carton_count: number
          incoming_source?: string | null
          incoming_stock_code: string
          incoming_stock_name: string
          product_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          stock_code: string
          stock_name: string
        }
        Update: {
          address?: string
          conflict_type?: string
          created_at?: string
          existing_carton_count?: number | null
          existing_created_at?: string | null
          existing_is_active?: boolean | null
          existing_record_id?: string | null
          existing_updated_at?: string | null
          id?: string
          incoming_address?: string
          incoming_barcode?: string | null
          incoming_carton_count?: number
          incoming_source?: string | null
          incoming_stock_code?: string
          incoming_stock_name?: string
          product_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          stock_code?: string
          stock_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "address_conflicts_existing_record_id_fkey"
            columns: ["existing_record_id"]
            isOneToOne: false
            referencedRelation: "address_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_conflicts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_conflicts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      address_records: {
        Row: {
          address: string
          carton_count: number
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          updated_at: string
        }
        Insert: {
          address: string
          carton_count?: number
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          carton_count?: number
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "address_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          new_data: Json | null
          old_data: Json | null
          operation_id: string | null
          product_id: string | null
          stock_code: string | null
          stock_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          operation_id?: string | null
          product_id?: string | null
          stock_code?: string | null
          stock_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          operation_id?: string | null
          product_id?: string | null
          stock_code?: string | null
          stock_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          barcode: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          stock_code: string
          stock_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          stock_code: string
          stock_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          stock_code?: string
          stock_name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      address_aisle_summary: {
        Row: {
          address_count: number | null
          aisle: string | null
          carton_count: number | null
          product_count: number | null
          rack_count: number | null
        }
        Relationships: []
      }
      address_daily_activity: {
        Row: {
          carton_count: number | null
          created_count: number | null
          day: string | null
        }
        Relationships: []
      }
      address_record_counts: {
        Row: {
          active_cartons: number | null
          active_records: number | null
          all_records: number | null
          inactive_records: number | null
        }
        Relationships: []
      }
      dashboard_summary: {
        Row: {
          active_address_records: number | null
          products_with_address: number | null
          total_cartons: number | null
          total_products: number | null
        }
        Relationships: []
      }
      product_filter_counts: {
        Row: {
          all_products: number | null
          multiple_address: number | null
          no_address: number | null
          single_address: number | null
        }
        Relationships: []
      }
      products_with_metrics: {
        Row: {
          address_count: number | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          stock_code: string | null
          stock_code_normalized: string | null
          stock_name: string | null
          total_cartons: number | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      audit_operation_id: { Args: never; Returns: string }
      clear_address_records: {
        Args: { p_operation_id: string }
        Returns: number
      }
      create_address_conflict: {
        Args: {
          p_address: string
          p_conflict_type: string
          p_existing_address: string
          p_existing_carton_count: number
          p_existing_is_active: boolean
          p_existing_record_id: string
          p_existing_stock_code: string
          p_existing_stock_name: string
          p_incoming_address: string
          p_incoming_barcode: string
          p_incoming_carton_count: number
          p_incoming_stock_code: string
          p_incoming_stock_name: string
          p_product_id: string
          p_source: string
          p_stock_code: string
          p_stock_name: string
        }
        Returns: {
          address: string
          conflict_type: string
          created_at: string
          existing_carton_count: number | null
          existing_created_at: string | null
          existing_is_active: boolean | null
          existing_record_id: string | null
          existing_updated_at: string | null
          id: string
          incoming_address: string
          incoming_barcode: string | null
          incoming_carton_count: number
          incoming_source: string | null
          incoming_stock_code: string
          incoming_stock_name: string
          product_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          stock_code: string
          stock_name: string
        }
        SetofOptions: {
          from: "*"
          to: "address_conflicts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_address_conflict: {
        Args: { action: string; conflict_id: string; p_operation_id?: string }
        Returns: {
          address: string
          conflict_type: string
          created_at: string
          existing_carton_count: number | null
          existing_created_at: string | null
          existing_is_active: boolean | null
          existing_record_id: string | null
          existing_updated_at: string | null
          id: string
          incoming_address: string
          incoming_barcode: string | null
          incoming_carton_count: number
          incoming_source: string | null
          incoming_stock_code: string
          incoming_stock_name: string
          product_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          stock_code: string
          stock_name: string
        }
        SetofOptions: {
          from: "*"
          to: "address_conflicts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_address_records: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
        }
        Returns: {
          address: string
          carton_count: number
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          stock_code: string
          stock_name: string
          total_count: number
          updated_at: string
        }[]
      }
      search_products: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
        }
        Returns: {
          address_count: number
          barcodes: string[]
          id: string
          is_active: boolean
          stock_code: string
          stock_name: string
          total_cartons: number
          total_count: number
        }[]
      }
      restore_address_records: {
        Args: { p_operation_id: string; p_records: Json }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      suggest_stock_codes: {
        Args: { p_codes: string[]; p_limit?: number }
        Returns: {
          input_code: string
          score: number
          stock_code: string
          stock_name: string
        }[]
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_description: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_operation_id?: string
          p_product_id: string
          p_stock_code: string
          p_stock_name: string
        }
        Returns: {
          action: string
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          new_data: Json | null
          old_data: Json | null
          operation_id: string | null
          product_id: string | null
          stock_code: string | null
          stock_name: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
