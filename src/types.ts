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

export interface LLMProvider {
  name: ProviderName;
  generateCommand(query: string, context: ShellContext): Promise<GeneratedCommand>;
  verifyCommand(command: string, query: string, context: ShellContext): Promise<VerificationResult>;
}

