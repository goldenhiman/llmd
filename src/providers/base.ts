import type { LLMProvider, GeneratedCommand, IntentClassification, VerificationResult, ShellContext, ProviderConfig, ProviderName } from '../types.js';
import { getSystemPrompt, getVerificationPrompt, getOrchestratorPrompt, getSystemPromptWithGatheredInfo } from '../utils/prompts.js';

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: ProviderName;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string>;

  async classifyIntent(query: string, context: ShellContext): Promise<IntentClassification> {
    const systemPrompt = getOrchestratorPrompt(context);

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ]);

    try {
      const parsed = this.parseJSON(response);
      const intent = String(parsed.intent || 'command');

      // Validate intent is one of the allowed values
      if (!['command', 'probe', 'conversation', 'clarify'].includes(intent)) {
        return { intent: 'command' };
      }

      return {
        intent: intent as IntentClassification['intent'],
        probeCommand: parsed.probeCommand ? this.sanitizeCommand(String(parsed.probeCommand)) : undefined,
        probeReason: parsed.probeReason ? String(parsed.probeReason) : undefined,
        conversationalResponse: parsed.conversationalResponse ? String(parsed.conversationalResponse) : undefined,
        clarifyingQuestions: Array.isArray(parsed.clarifyingQuestions) ? parsed.clarifyingQuestions.map(String) : undefined,
        commandHints: parsed.commandHints ? String(parsed.commandHints) : undefined,
      };
    } catch {
      // If parsing fails, default to command intent
      return { intent: 'command' };
    }
  }

  async generateCommand(query: string, context: ShellContext): Promise<GeneratedCommand> {
    const systemPrompt = getSystemPrompt(context);
    
    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ]);

    const result = this.extractCommand(response);
    
    if (!result.command) {
      throw new Error('Failed to extract a valid command from the response');
    }
    
    return result;
  }

  async generateCommandWithContext(query: string, context: ShellContext, gatheredInfo: string): Promise<GeneratedCommand> {
    const systemPrompt = getSystemPromptWithGatheredInfo(context, gatheredInfo);
    
    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ]);

    const result = this.extractCommand(response);
    
    if (!result.command) {
      throw new Error('Failed to extract a valid command from the response');
    }
    
    return result;
  }

  async verifyCommand(command: string, query: string, context: ShellContext): Promise<VerificationResult> {
    const verificationPrompt = getVerificationPrompt(command, query, context);
    
    const response = await this.chat([
      { role: 'system', content: 'You are a shell command verification expert. Respond STRICTLY in valid JSON format only. Do not include any text before or after the JSON object. The response must be parseable JSON.' },
      { role: 'user', content: verificationPrompt }
    ]);

    try {
      const parsed = this.parseJSON(response);
      return {
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
        isCorrect: Boolean(parsed.isCorrect ?? true),
        issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions.map(String) : []
      };
    } catch {
      return {
        confidence: 60,
        isCorrect: true,
        issues: ['Could not fully verify command'],
        suggestedQuestions: []
      };
    }
  }

  protected parseJSON(text: string): Record<string, unknown> {
    let cleanText = text.trim();
    
    const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleanText = codeBlockMatch[1].trim();
    }
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      return parsed;
    }
    
    throw new Error('No valid JSON found in response');
  }

  protected extractCommand(response: string): { command: string; explanation: string } {
    const trimmed = response.trim();
    
    try {
      const parsed = this.parseJSON(trimmed);
      if (parsed.command && typeof parsed.command === 'string') {
        const command = this.extractNestedCommand(parsed.command);
        return {
          command: this.sanitizeCommand(command),
          explanation: String(parsed.explanation || '')
        };
      }
    } catch {
      // JSON parsing failed, try other extraction methods
    }

    const commandMatch = trimmed.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (commandMatch) {
      let rawCommand = commandMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      rawCommand = this.extractNestedCommand(rawCommand);
      
      const explanationMatch = trimmed.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const explanation = explanationMatch 
        ? explanationMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        : '';
      
      return {
        command: this.sanitizeCommand(rawCommand),
        explanation
      };
    }

    return {
      command: this.sanitizeCommand(this.extractNestedCommand(trimmed)),
      explanation: 'Generated command'
    };
  }

  protected extractNestedCommand(input: string): string {
    let result = input.trim();
    
    let iterations = 0;
    const maxIterations = 3;
    
    while (iterations < maxIterations) {
      if (result.startsWith('{') && result.includes('"command"')) {
        try {
          const parsed = JSON.parse(result);
          if (parsed.command && typeof parsed.command === 'string') {
            result = parsed.command;
            iterations++;
            continue;
          }
        } catch {
          const match = result.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (match) {
            result = match[1]
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            iterations++;
            continue;
          }
        }
      }
      break;
    }
    
    return result;
  }

  protected sanitizeCommand(command: string): string {
    if (!command) {
      return '';
    }

    let sanitized = command.trim();

    sanitized = this.extractNestedCommand(sanitized);

    sanitized = sanitized.replace(/```[\w]*\s*/g, '');
    sanitized = sanitized.replace(/```/g, '');

    sanitized = sanitized.replace(/^[$#>]\s*/gm, '');

    sanitized = sanitized.replace(/`/g, '');

    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }
}
