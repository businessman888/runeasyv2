import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SupabaseService } from '../../database/supabase.service';

/**
 * Question structure matching frontend expectations
 */
export interface ReadinessQuestion {
    id: string; // 'sleep', 'legs'/'dor', 'mood'/'energia', 'stress', 'motivation'/'vontade'
    question: string;
    options: Array<{
        value: number;
        label: string;
        description?: string;
    }>;
}

/**
 * A complete set of 5 readiness questions
 */
export interface QuestionSet {
    setNumber: number;
    setName: string;
    questions: ReadinessQuestion[];
}

/**
 * Service to manage the 40 question sets for Readiness Quiz.
 * Now fetches from Supabase database with user-based exclusion logic.
 */
@Injectable()
export class QuestionSetsParserService implements OnModuleInit {
    private readonly logger = new Logger(QuestionSetsParserService.name);
    private questionSets: QuestionSet[] = [];
    private readonly TOTAL_SETS = 40;

    constructor(
        private readonly supabaseService: SupabaseService,
    ) { }

    async onModuleInit() {
        // Load from file as fallback cache (legacy behavior)
        await this.loadQuestionSets();
        // Also preload from database
        await this.preloadFromDatabase();
    }

    /**
     * Preload question sets from database into memory cache
     */
    private async preloadFromDatabase(): Promise<void> {
        try {
            const supabase = this.supabaseService.getClient();
            const { data, error } = await supabase
                .from('readiness_question_sets')
                .select('*')
                .order('set_number', { ascending: true });

            if (error) {
                this.logger.warn(`Failed to preload from database: ${error.message}`);
                return;
            }

            if (data && data.length > 0) {
                this.questionSets = data.map(row => this.mapDbToQuestionSet(row));
                this.logger.log(`[QuestionSetsParser] Preloaded ${this.questionSets.length} sets from database`);
            }
        } catch (error: any) {
            this.logger.warn(`Database preload error: ${error?.message}`);
        }
    }

    /**
     * Map database row to QuestionSet interface
     */
    private mapDbToQuestionSet(dbRow: any): QuestionSet {
        return {
            setNumber: dbRow.set_number,
            setName: dbRow.set_name,
            questions: dbRow.questions as ReadinessQuestion[],
        };
    }

    /**
     * Get question set for a specific user using exclusion logic.
     * Selects the first set that the user has NOT responded to yet.
     * Falls back to LRU (Least Recently Used) when all sets are exhausted.
     */
    async getQuestionSetForUser(userId: string): Promise<QuestionSet> {
        this.logger.log(`[QuizSelection] Selecting question set for user ${userId}`);

        try {
            const supabase = this.supabaseService.getClient();

            // 1. Get set_numbers already responded by this user
            const { data: history, error: historyError } = await supabase
                .from('readiness_history')
                .select('set_number, created_at')
                .eq('user_id', userId)
                .not('set_number', 'is', null)
                .order('created_at', { ascending: false });

            if (historyError) {
                this.logger.error(`[QuizSelection] Error fetching history: ${historyError.message}`);
                return this.getFallbackSet();
            }

            const respondedSetNumbers = new Set(history?.map(h => h.set_number) || []);
            const respondedCount = respondedSetNumbers.size;

            this.logger.log(`[QuizSelection] User ${userId} has responded to ${respondedCount} sets`);

            // 2. Get all available sets from database
            const { data: allSets, error: setsError } = await supabase
                .from('readiness_question_sets')
                .select('*')
                .order('set_number', { ascending: true });

            if (setsError || !allSets?.length) {
                this.logger.error(`[QuizSelection] Error fetching question sets: ${setsError?.message}`);
                return this.getFallbackSet();
            }

            // 3. Find first unresponded set
            const unrespondedSet = allSets.find(s => !respondedSetNumbers.has(s.set_number));

            if (unrespondedSet) {
                this.logger.log(`[QuizSelection] User ${userId} has responded ${respondedCount} sets. Delivering NEW Set #${unrespondedSet.set_number} ("${unrespondedSet.set_name}")`);
                return this.mapDbToQuestionSet(unrespondedSet);
            }

            // 4. All sets exhausted - use LRU (Least Recently Used)
            // The oldest responded set is at the end of the history array (sorted desc)
            const oldestResponded = history?.[history.length - 1];
            if (oldestResponded) {
                const lruSet = allSets.find(s => s.set_number === oldestResponded.set_number);
                if (lruSet) {
                    this.logger.log(`[QuizSelection] User ${userId} completed all ${this.TOTAL_SETS} sets. Reusing LRU Set #${lruSet.set_number} (last used: ${oldestResponded.created_at})`);
                    return this.mapDbToQuestionSet(lruSet);
                }
            }

            // 5. Final fallback: first available set
            this.logger.warn(`[QuizSelection] Fallback to first available set for user ${userId}`);
            return this.mapDbToQuestionSet(allSets[0]);

        } catch (error: any) {
            this.logger.error(`[QuizSelection] Unexpected error for user ${userId}: ${error?.message}`);
            return this.getFallbackSet();
        }
    }

    /**
     * Get fallback set when database operations fail
     */
    private getFallbackSet(): QuestionSet {
        // Use cached sets from memory if available
        if (this.questionSets.length > 0) {
            const setNumber = this.getSetNumberForDay(new Date());
            const set = this.questionSets.find(s => s.setNumber === setNumber);
            return set || this.questionSets[0];
        }
        return this.getFallbackSets()[0];
    }

    /**
     * Load and parse question sets from the markdown file
     */
    async loadQuestionSets(): Promise<void> {
        try {
            const filePath = path.join(process.cwd(), 'assets', 'OpenL-2601092005.md');
            this.logger.log(`Loading question sets from: ${filePath}`);

            if (!fs.existsSync(filePath)) {
                this.logger.warn(`Question sets file not found at ${filePath}, using fallback questions`);
                this.questionSets = this.getFallbackSets();
                return;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            this.questionSets = this.parseMarkdownContent(content);

            this.logger.log(`Loaded ${this.questionSets.length} question sets`);
        } catch (error) {
            this.logger.error('Failed to load question sets, using fallback', error);
            this.questionSets = this.getFallbackSets();
        }
    }

    /**
     * Parse the markdown content into structured question sets
     */
    private parseMarkdownContent(content: string): QuestionSet[] {
        const sets: QuestionSet[] = [];
        const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let currentSet: Partial<QuestionSet> | null = null;
        let currentQuestions: ReadinessQuestion[] = [];
        let questionIndex = 0;

        // Question ID mapping based on position
        const questionIds = ['sleep', 'legs', 'mood', 'stress', 'motivation'];

        this.logger.log(`Parsing markdown with ${lines.length} non-empty lines`);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detect set header: "Set 2:", "SET 7", "Set 25: O Motivacional", etc.
            // Very flexible regex
            const setMatch = line.match(/^Set\s*(\d+)\s*[:\-\.]?\s*(.*)?$/i);
            if (setMatch) {
                const newSetNumber = parseInt(setMatch[1], 10);

                // LOG: Every set detected
                this.logger.log(`>>> Detected Set ${newSetNumber} header at line ${i + 1}`);

                // Save previous set if exists and has 5 questions
                if (currentSet && currentQuestions.length >= 5) {
                    sets.push({
                        setNumber: currentSet.setNumber!,
                        setName: currentSet.setName || `Set ${currentSet.setNumber}`,
                        questions: currentQuestions.slice(0, 5),
                    });
                    this.logger.log(`    Saved Set ${currentSet.setNumber} (${currentQuestions.length} questions)`);
                } else if (currentSet) {
                    this.logger.warn(`    Set ${currentSet.setNumber} SKIPPED - only had ${currentQuestions.length} questions`);
                }

                // Start new set
                currentSet = {
                    setNumber: newSetNumber,
                    setName: setMatch[2]?.trim() || `Set ${newSetNumber}`,
                };
                currentQuestions = [];
                questionIndex = 0;
                continue;
            }

            // Detect question line - very flexible pattern
            // Matches: "1. Sono:", "2.  Dor:", "Energia:", etc.
            const questionMatch = line.match(/^(?:\d+\.?\s*)?(Sono|Dor|Energia|Estresse|Vontade)\s*[:\-]\s*(.*)$/i);

            if (questionMatch && currentSet) {
                const category = questionMatch[1].toLowerCase();
                let questionText = questionMatch[2]?.trim() || this.getDefaultQuestion(category);

                // Map category to question ID
                const idMap: Record<string, string> = {
                    'sono': 'sleep',
                    'dor': 'legs',
                    'energia': 'mood',
                    'estresse': 'stress',
                    'vontade': 'motivation',
                };

                const id = idMap[category] || questionIds[questionIndex % 5];

                // Look ahead for options
                const options = this.parseOptionsFromLines(lines, i + 1);

                if (options.length >= 5) {
                    currentQuestions.push({
                        id,
                        question: questionText,
                        options: options.slice(0, 5),
                    });
                    questionIndex++;
                }
            }
        }

        // Don't forget the last set
        if (currentSet && currentQuestions.length >= 5) {
            sets.push({
                setNumber: currentSet.setNumber!,
                setName: currentSet.setName || `Set ${currentSet.setNumber}`,
                questions: currentQuestions.slice(0, 5),
            });
            this.logger.log(`    Saved final Set ${currentSet.setNumber} (${currentQuestions.length} questions)`);
        } else if (currentSet) {
            this.logger.warn(`    Final Set ${currentSet.setNumber} SKIPPED - only had ${currentQuestions.length} questions`);
        }

        // If we don't have set 1 (first questions before any "Set X" header)
        if (sets.length === 0 || sets[0].setNumber !== 1) {
            const set1Questions = this.parseInitialSet(lines, questionIds);
            if (set1Questions.length >= 5) {
                sets.unshift({
                    setNumber: 1,
                    setName: 'O Clínico (Foco em Sintomas)',
                    questions: set1Questions.slice(0, 5),
                });
                this.logger.log('Added Set 1 from initial questions');
            }
        }

        this.logger.log(`=== TOTAL SETS PARSED: ${sets.length} ===`);

        return sets.sort((a, b) => a.setNumber - b.setNumber);
    }

    /**
     * Parse the initial questions (before first Set header) as Set 1
     */
    private parseInitialSet(lines: string[], questionIds: string[]): ReadinessQuestion[] {
        const questions: ReadinessQuestion[] = [];
        let questionIndex = 0;

        for (let i = 0; i < lines.length && questionIndex < 5; i++) {
            const line = lines[i];

            // Stop at first Set header
            if (line.match(/^Set\s*\d+/i)) break;

            // Look for numbered questions
            const questionMatch = line.match(/^(\d+)\.\s*(Sono|Dor|Energia|Estresse|Vontade)\s*[:\-]\s*(.+)?$/i);
            if (questionMatch) {
                const category = questionMatch[2].toLowerCase();
                const questionText = questionMatch[3]?.trim() || this.getDefaultQuestion(category);

                const idMap: Record<string, string> = {
                    'sono': 'sleep',
                    'dor': 'legs',
                    'energia': 'mood',
                    'estresse': 'stress',
                    'vontade': 'motivation',
                };

                const id = idMap[category] || questionIds[questionIndex];
                const options = this.parseOptionsFromLines(lines, i + 1);

                if (options.length >= 5) {
                    questions.push({
                        id,
                        question: questionText,
                        options: options.slice(0, 5),
                    });
                    questionIndex++;
                }
            }
        }

        return questions;
    }

    /**
     * Parse options from lines following a question
     * Format: (1) Label | (2) Label | ... or on multiple lines
     */
    private parseOptionsFromLines(lines: string[], startIndex: number): Array<{ value: number; label: string }> {
        const options: Array<{ value: number; label: string }> = [];

        // Check next several lines for options (increased from 5 to 10 to handle multi-line formats)
        for (let i = startIndex; i < Math.min(startIndex + 10, lines.length); i++) {
            const line = lines[i];

            // Skip markers like "> o"
            if (line === '> o' || line === '>') continue;

            // Look for pattern: (1) Label | (2) Label | ...
            const optionMatches = line.matchAll(/\((\d)\)\s*([^|(]+)/g);
            for (const match of optionMatches) {
                const value = parseInt(match[1], 10);
                const label = match[2].trim();
                if (value >= 1 && value <= 5 && label) {
                    // Avoid duplicates
                    if (!options.find(o => o.value === value)) {
                        options.push({ value, label });
                    }
                }
            }

            // Stop if we found all 5 or hit a new question/set
            if (options.length >= 5) break;
            if (line.match(/^\d+\.\s*(Sono|Dor|Energia|Estresse|Vontade)/i)) break;
            if (line.match(/^(Sono|Dor|Energia|Estresse|Vontade)\s*[:\-]/i)) break;
            if (line.match(/^Set\s*\d+/i)) break;
        }

        return options.sort((a, b) => b.value - a.value); // 5 to 1 order for display
    }

    private getDefaultQuestion(category: string): string {
        const defaults: Record<string, string> = {
            'sono': 'Como foi sua qualidade de sono?',
            'dor': 'Está sentindo algum desconforto físico?',
            'energia': 'Como está seu nível de energia?',
            'estresse': 'Qual seu nível de estresse?',
            'vontade': 'Qual sua motivação para treinar?',
        };
        return defaults[category] || 'Como você está?';
    }

    /**
     * Get a random set number for today based on São Paulo date
     * Uses a deterministic seed based on date so the same set is used all day
     * 
     * TIMEZONE: Uses America/Sao_Paulo (UTC-3)
     * CUTOFF: Midnight (00:00) São Paulo time
     */
    getSetNumberForDay(date: Date): number {
        const SAO_PAULO_OFFSET_HOURS = -3; // UTC-3 (BRT)

        // Convert input date to São Paulo time
        const saoPauloTime = new Date(date.getTime() + (SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000));

        // Extract date components in São Paulo time
        const year = saoPauloTime.getUTCFullYear();
        const month = saoPauloTime.getUTCMonth();
        const day = saoPauloTime.getUTCDate();

        // Create a deterministic seed from the São Paulo date
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const seed = this.hashString(dateString);

        // Use seed to pick a set number (1-40)
        const availableSets = this.questionSets.length > 0 ? this.questionSets.length : this.TOTAL_SETS;
        const setIndex = seed % availableSets;
        const setNumber = this.questionSets[setIndex]?.setNumber || (setIndex + 1);

        this.logger.log(`[QuestionSetsParser] Date: ${dateString} (São Paulo) → Set ${setNumber} (seed: ${seed}, index: ${setIndex})`);

        return setNumber;
    }

    /**
     * Simple string hash for deterministic randomness
     */
    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Get a specific question set by number
     */
    getQuestionSet(setNumber: number): QuestionSet | null {
        return this.questionSets.find(s => s.setNumber === setNumber) || null;
    }

    /**
     * Get today's question set
     */
    getTodaysQuestionSet(): QuestionSet {
        const setNumber = this.getSetNumberForDay(new Date());
        const set = this.getQuestionSet(setNumber);

        if (set) {
            return set;
        }

        // Fallback to first set or generate default
        return this.questionSets[0] || this.getFallbackSets()[0];
    }

    /**
     * Get all loaded question sets
     */
    getAllSets(): QuestionSet[] {
        return this.questionSets;
    }

    /**
     * Fallback sets if file parsing fails
     */
    private getFallbackSets(): QuestionSet[] {
        return [{
            setNumber: 1,
            setName: 'O Clínico (Padrão)',
            questions: [
                {
                    id: 'sleep',
                    question: 'Sua bateria carregou bem durante a noite?',
                    options: [
                        { value: 5, label: '100% Full' },
                        { value: 4, label: '75%' },
                        { value: 3, label: '50%' },
                        { value: 2, label: '25%' },
                        { value: 1, label: 'Modo economia' },
                    ],
                },
                {
                    id: 'legs',
                    question: 'Como estão suas pernas hoje?',
                    options: [
                        { value: 5, label: 'Com molas' },
                        { value: 4, label: 'Leves' },
                        { value: 3, label: 'Normais' },
                        { value: 2, label: 'Pesadas' },
                        { value: 1, label: 'Como chumbo' },
                    ],
                },
                {
                    id: 'mood',
                    question: 'Qual o clima da sua mente?',
                    options: [
                        { value: 5, label: 'Céu limpo' },
                        { value: 4, label: 'Ensolarado' },
                        { value: 3, label: 'Instável' },
                        { value: 2, label: 'Nublado' },
                        { value: 1, label: 'Tempestade' },
                    ],
                },
                {
                    id: 'stress',
                    question: 'Como está o peso das preocupações?',
                    options: [
                        { value: 5, label: 'Inexistente' },
                        { value: 4, label: 'Leve' },
                        { value: 3, label: 'Presente' },
                        { value: 2, label: 'Pesado' },
                        { value: 1, label: 'Insuportável' },
                    ],
                },
                {
                    id: 'motivation',
                    question: 'Onde está sua motivação?',
                    options: [
                        { value: 5, label: 'Já estou de tênis' },
                        { value: 4, label: 'Vamos nessa!' },
                        { value: 3, label: 'Talvez' },
                        { value: 2, label: 'Preciso de café' },
                        { value: 1, label: 'Ainda na cama' },
                    ],
                },
            ],
        }];
    }
}
