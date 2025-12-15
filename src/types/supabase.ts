// src/types/supabase.ts
// Tipos “a mano” inspirados en el generador oficial de Supabase.
// Cuando conectes el generador, podrás reemplazar este archivo.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Esquema principal de la BD (public) */
export interface Database {
  public: {
    Tables: {
      /* ======================= bookings ======================= */
      bookings: {
        Row: {
          id: string;
          status: 'pending' | 'paid' | 'canceled';
          stripe_session_id: string | null;
          total: number | null;            // minor units (centavos, etc.)
          currency: string | null;         // p. ej. 'USD'
          origin_currency: string | null;  // p. ej. 'COP'
          tour_price_cop: number | null;   // precio unitario catálogo (COP)
          customer_email: string | null;
          customer_name: string | null;
          phone: string | null;
          tour_id: string | null;
          date: string | null;             // date YYYY-MM-DD
          persons: number | null;
          extras: Json | null;
          payment_provider: string | null; // 'stripe'
          user_id: string | null;
          created_at?: string | null;      // timestamptz
          updated_at?: string | null;      // timestamptz
        };
        Insert: {
          id?: string;
          status?: 'pending' | 'paid' | 'canceled';
          stripe_session_id?: string | null;
          total?: number | null;
          currency?: string | null;
          origin_currency?: string | null;
          tour_price_cop?: number | null;
          customer_email?: string | null;
          customer_name?: string | null;
          phone?: string | null;
          tour_id?: string | null;
          date?: string | null;
          persons?: number | null;
          extras?: Json | null;
          payment_provider?: string | null;
          user_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
        Relationships: []; // agrega FKs si las defines en la BD
      };

      /* ======================== events ======================== */
      events: {
        Row: {
          id: string;
          user_id: string | null;
          type: string;
          payload: Json | null;
          created_at: string | null; // timestamptz default now()
        };
        Insert: {
          user_id?: string | null;
          type: string;
          payload?: Json | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['events']['Insert']>;
        Relationships: [];
      };

      /* ========================= tours ======================== */
      tours: {
        Row: {
          id: string;
          slug: string;
          title: string;
          city?: string | null;
          tags?: string[] | null;          // considera índice GIN para contains()
          base_price?: number | null;      // COP (entero)
          duration_hours?: number | null;  // horas enteras
          images?: Json | null;            // JSONB [{ url, alt? }, ...]
          summary?: string | null;
          body_md?: string | null;
          search_tsv?: unknown | null;     // tsvector (para FTS)
          created_at?: string | null;
          updated_at?: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          city?: string | null;
          tags?: string[] | null;
          base_price?: number | null;
          duration_hours?: number | null;
          images?: Json | null;
          summary?: string | null;
          body_md?: string | null;
          search_tsv?: unknown | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tours']['Insert']>;
        Relationships: [];
      };

      /* ======================= reviews ======================== */
      reviews: {
        Row: {
          id: string;
          tour_id: string | null;
          tour_slug: string | null;
          user_id: string | null;
          rating: number;                 // 1..5
          comment: string | null;
          approved: boolean | null;       // default false
          honeypot: string | null;        // anti-bot
          ip: string | null;              // inet → string
          created_at: string | null;      // timestamptz
        };
        Insert: {
          id?: string;
          tour_id?: string | null;
          tour_slug?: string | null;
          user_id?: string | null;
          rating: number;
          comment?: string | null;
          approved?: boolean | null;
          honeypot?: string | null;
          ip?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
        Relationships: [
          // ejemplo (habilítalo si tienes FKs en la BD):
          // {
          //   foreignKeyName: 'reviews_tour_id_fkey',
          //   columns: ['tour_id'],
          //   isOneToOne: false,
          //   referencedRelation: 'tours',
          //   referencedColumns: ['id'],
          // }
        ];
      };

      /* ============== tour_availability (opcional) ============== */
      // La usas en availabilityFor(); define la tabla en la BD para tipar bien
      tour_availability: {
        Row: {
          tour_id: string;
          date: string;                 // YYYY-MM-DD
          price: number | null;         // minor units o COP entero según tu diseño
          capacity: number | null;      // asientos o cupos
          created_at?: string | null;   // timestamptz
          updated_at?: string | null;   // timestamptz
        };
        Insert: {
          tour_id: string;
          date: string;
          price?: number | null;
          capacity?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tour_availability']['Insert']>;
        Relationships: [
          // si añades FK a tours:
          // {
          //   foreignKeyName: 'tour_availability_tour_id_fkey',
          //   columns: ['tour_id'],
          //   isOneToOne: false,
          //   referencedRelation: 'tours',
          //   referencedColumns: ['id'],
          // }
        ];
      };
    };

    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}

/* =================== Helpers de conveniencia =================== */
/**
 * Acceso cómodo a tipos de filas/insert/update de tablas.
 * Ejemplos:
 *   type TourRow = Tables<'tours'>;
 *   type NewReview = TablesInsert<'reviews'>;
 *   type PatchBooking = TablesUpdate<'bookings'>;
 */
export type Tables<
  T extends keyof Database['public']['Tables']
> = Database['public']['Tables'][T]['Row'];

export type TablesInsert<
  T extends keyof Database['public']['Tables']
> = Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<
  T extends keyof Database['public']['Tables']
> = Database['public']['Tables'][T]['Update'];

/** Enums<'my_enum'> si en el futuro añades tipos enumerados. */
export type Enums<
  T extends keyof Database['public']['Enums'] = never
> = T extends never ? never : Database['public']['Enums'][T];
