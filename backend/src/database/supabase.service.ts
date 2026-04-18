import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;
  private supabaseAuth: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private configService: ConfigService) { }

  onModuleInit() {
    this.logger.log('[SupabaseService] onModuleInit starting...');

    try {
      const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
      const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')
        || this.configService.get<string>('SUPABASE_KEY');

      this.logger.log(`[SupabaseService] SUPABASE_URL: ${supabaseUrl ? 'SET' : 'MISSING'}`);
      this.logger.log(`[SupabaseService] SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? 'SET (' + supabaseKey.substring(0, 10) + '...)' : 'MISSING'}`);

      if (!supabaseUrl || !supabaseKey) {
        this.logger.error('[SupabaseService] ❌ Missing Supabase configuration!');
        throw new Error('Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
      }

      // DB client: never used for auth sign-in. Keeps service_role as the bearer token
      // for every .from() call, so RLS is always bypassed server-side.
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // Auth-only client: calling signInWithIdToken mutates the client's in-memory session,
      // which would otherwise contaminate subsequent .from() queries with the user's JWT
      // and trigger RLS. Isolating it here keeps the DB client pure.
      this.supabaseAuth = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      this.logger.log('[SupabaseService] ✅ Supabase clients initialized (db + auth isolated)');
    } catch (error: any) {
      this.logger.error(`[SupabaseService] ❌ Initialization failed: ${error?.message}`);
      throw error;
    }
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  from(table: string) {
    return this.supabase.from(table);
  }

  get auth() {
    return this.supabaseAuth.auth;
  }
}
