export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      check_ins: {
        Row: {
          check_in_date: string
          created_at: string
          id: string
          study_duration_seconds: number
          user_fingerprint: string
          words_mastered: number
          words_studied: number
        }
        Insert: {
          check_in_date?: string
          created_at?: string
          id?: string
          study_duration_seconds?: number
          user_fingerprint: string
          words_mastered?: number
          words_studied?: number
        }
        Update: {
          check_in_date?: string
          created_at?: string
          id?: string
          study_duration_seconds?: number
          user_fingerprint?: string
          words_mastered?: number
          words_studied?: number
        }
        Relationships: []
      }
      study_records: {
        Row: {
          created_at: string
          id: string
          last_reviewed_at: string | null
          next_review_at: string | null
          review_count: number
          status: string
          updated_at: string
          user_fingerprint: string
          word_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_reviewed_at?: string | null
          next_review_at?: string | null
          review_count?: number
          status?: string
          updated_at?: string
          user_fingerprint: string
          word_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_reviewed_at?: string | null
          next_review_at?: string | null
          review_count?: number
          status?: string
          updated_at?: string
          user_fingerprint?: string
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_records_word_id_fkey"
            columns: ["word_id"]
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_cards: {
        Row: {
          card: Json
          ts: number
          updated_at: string
          user_id: string
          word: string
        }
        Insert: {
          card: Json
          ts: number
          updated_at?: string
          user_id: string
          word: string
        }
        Update: {
          card?: Json
          ts?: number
          updated_at?: string
          user_id?: string
          word?: string
        }
        Relationships: []
      }
      vocab_profile: {
        Row: {
          meta: Json
          seed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          meta?: Json
          seed: number
          updated_at?: string
          user_id: string
        }
        Update: {
          meta?: Json
          seed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      words: {
        Row: {
          category: string
          created_at: string
          definition: string
          difficulty: number
          example: string | null
          id: string
          phonetic: string | null
          word: string
        }
        Insert: {
          category?: string
          created_at?: string
          definition: string
          difficulty?: number
          example?: string | null
          id?: string
          phonetic?: string | null
          word: string
        }
        Update: {
          category?: string
          created_at?: string
          definition?: string
          difficulty?: number
          example?: string | null
          id?: string
          phonetic?: string | null
          word?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      vocab_push_cards: {
        Args: { rows: Json }
        Returns: number
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
