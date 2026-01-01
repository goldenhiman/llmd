import { configManager } from '../config/manager.js';
import { llmService } from './llm.js';
import type { VerificationResult } from '../types.js';

export interface VerificationOutcome {
  passed: boolean;
  result: VerificationResult;
  needsClarification: boolean;
}

export async function verifyCommand(command: string, query: string): Promise<VerificationOutcome> {
  const threshold = configManager.getConfidenceThreshold();
  
  const result = await llmService.verifyCommand(command, query);
  
  const passed = result.confidence >= threshold && result.isCorrect;
  const needsClarification = !passed && (result.suggestedQuestions?.length ?? 0) > 0;

  return {
    passed,
    result,
    needsClarification
  };
}

export function formatVerificationIssues(result: VerificationResult): string[] {
  const messages: string[] = [];

  if (result.issues && result.issues.length > 0) {
    messages.push(...result.issues.map(issue => `• ${issue}`));
  }

  return messages;
}

export function formatSuggestedQuestions(result: VerificationResult): string[] {
  if (!result.suggestedQuestions || result.suggestedQuestions.length === 0) {
    return [];
  }

  return result.suggestedQuestions.map((q, i) => `${i + 1}. ${q}`);
}

