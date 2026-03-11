import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;
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

      this.logger.log('[SupabaseService] Initializing Supabase client with service role key...');
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      this.logger.log('[SupabaseService] ✅ Supabase client initialized successfully');
    } catch (error: any) {
      this.logger.error(`[SupabaseService] ❌ Initialization failed: ${error?.message}`);
      throw error; // Re-throw to fail startup if Supabase is critical
    }
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // Shorthand for common operations
  from(table: string) {
    return this.supabase.from(table);
  }

  get auth() {
    return this.supabase.auth;
  }
}
