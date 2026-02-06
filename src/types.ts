export interface ProviderConfig {
  apiKey: string;
  model: string;
}

export interface ToolInfo {
  name: string;
  path: string;
  description?: string;
}

export interface Config {
  defaultProvider: ProviderName;
  confidenceThreshold: number;
  providers: Partial<Record<ProviderName, ProviderConfig>>;
  lastVersionCheck?: number;
}

export type ProviderName = 'openai' | 'anthropic' | 'groq' | 'gemini' | 'openrouter';

export interface ShellContext {
  cwd: string;
  shell: string;
  os: string;
  env?: Record<string, string>;
}

export interface GeneratedCommand {
  command: string;
  explanation: string;
}

export interface VerificationResult {
  confidence: number;
  isCorrect: boolean;
  issues?: string[];
  suggestedQuestions?: string[];
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe';

export interface SeverityCheck {
  level: SeverityLevel;
  reason: string;
  warnings: string[];
}

// --- Orchestrator types ---

export type QueryIntent = 'command' | 'probe' | 'conversation' | 'clarify';

export interface IntentClassification {
  intent: QueryIntent;
  // For 'probe': what read-only command to run and why
  probeCommand?: string;
  probeReason?: string;
  // For 'conversation': the direct response text
  conversationalResponse?: string;
  // For 'clarify': questions to ask the user
  clarifyingQuestions?: string[];
  // For 'command': optional hints for the generation step
  commandHints?: string;
}

export interface LLMProvider {
  name: ProviderName;
  classifyIntent(query: string, context: ShellContext): Promise<IntentClassification>;
  generateCommand(query: string, context: ShellContext): Promise<GeneratedCommand>;
  generateCommandWithContext(query: string, context: ShellContext, gatheredInfo: string): Promise<GeneratedCommand>;
  verifyCommand(command: string, query: string, context: ShellContext): Promise<VerificationResult>;
}
