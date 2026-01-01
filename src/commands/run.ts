import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { configManager } from '../config/manager.js';
import { llmService } from '../services/llm.js';
import { verifyCommand, formatVerificationIssues, formatSuggestedQuestions } from '../services/verifier.js';
import { checkSeverity, getSeverityEmoji, requiresConfirmation } from '../services/severity.js';
import { executeCommand } from '../utils/terminal.js';
import { checkForUpdates, displayUpdateHint } from '../utils/version.js';
import type { GeneratedCommand, VerificationResult } from '../types.js';

// Store version check result (started in background)
let versionCheckPromise: Promise<Awaited<ReturnType<typeof checkForUpdates>>> | null = null;

export async function runCommand(query: string): Promise<void> {
  // Start version check in background (non-blocking)
  if (!versionCheckPromise) {
    versionCheckPromise = checkForUpdates();
  }

  // Check if any provider is configured
  if (!configManager.hasAnyProvider()) {
    console.log(chalk.yellow('\n⚠️  No LLM provider configured.'));
    console.log(chalk.dim('Run "llmd setup" to configure a provider.\n'));
    return;
  }

  const spinner = ora({
    text: 'Generating command...',
    color: 'cyan'
  }).start();

  try {
    // Generate command
    const generated = await llmService.generateCommand(query);
    spinner.text = 'Verifying command...';

    // Verify command
    const verification = await verifyCommand(generated.command, query);
    spinner.stop();

    // Handle low confidence - ask for clarification
    if (verification.needsClarification) {
      await handleClarification(query, generated, verification.result);
      return;
    }

    // Display and potentially execute command
    await displayAndExecute(generated, verification.result);

  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n✗ Error: ${message}\n`));
    
    if (message.includes('API')) {
      console.log(chalk.dim('Check your API key configuration with: llmd config list\n'));
    }
  }
}

async function handleClarification(
  originalQuery: string,
  generated: GeneratedCommand,
  verification: VerificationResult
): Promise<void> {
  console.log('\n' + chalk.yellow('⚠️  The command needs clarification:\n'));
  
  // Show current command
  console.log(chalk.dim('Generated command:'));
  console.log(chalk.cyan(`  $ ${generated.command}\n`));
  
  // Show confidence
  console.log(chalk.dim(`Confidence: ${verification.confidence}% (threshold: ${configManager.getConfidenceThreshold()}%)\n`));

  // Show issues
  const issues = formatVerificationIssues(verification);
  if (issues.length > 0) {
    console.log(chalk.yellow('Issues:'));
    issues.forEach(issue => console.log(chalk.dim(`  ${issue}`)));
    console.log();
  }

  // Show suggested questions
  const questions = formatSuggestedQuestions(verification);
  if (questions.length > 0) {
    console.log(chalk.cyan('Please clarify:'));
    questions.forEach(q => console.log(chalk.dim(`  ${q}`)));
    console.log();
  }

  // Ask for more info
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Provide more details', value: 'clarify' },
        { name: 'Run command anyway', value: 'run' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }
  ]);

  if (action === 'clarify') {
    const { additionalInfo } = await inquirer.prompt<{ additionalInfo: string }>([
      {
        type: 'input',
        name: 'additionalInfo',
        message: 'Add more details:'
      }
    ]);

    if (additionalInfo.trim()) {
      const enhancedQuery = `${originalQuery}. Additional context: ${additionalInfo}`;
      await runCommand(enhancedQuery);
    }
  } else if (action === 'run') {
    await displayAndExecute(generated, verification);
  }
}

async function displayAndExecute(
  generated: GeneratedCommand,
  verification: VerificationResult
): Promise<void> {
  // Check severity
  const severity = checkSeverity(generated.command);
  const severityEmoji = getSeverityEmoji(severity.level);

  // Build display content
  let content = chalk.bold.white(`$ ${generated.command}`);
  
  if (generated.explanation) {
    content += '\n\n' + chalk.dim(generated.explanation);
  }

  content += '\n\n' + chalk.dim(`Confidence: ${verification.confidence}%`);
  content += chalk.dim(` • Provider: ${llmService.getProviderName()}`);

  // Add severity warning if needed
  if (severity.level !== 'safe') {
    content += '\n\n' + chalk[severity.level === 'critical' || severity.level === 'high' ? 'red' : 'yellow'](
      `${severityEmoji} ${severity.level.toUpperCase()}: ${severity.reason}`
    );
    
    if (severity.warnings.length > 1) {
      severity.warnings.slice(1).forEach(warning => {
        content += '\n' + chalk.dim(`  • ${warning}`);
      });
    }
  }

  // Display command box
  console.log('\n' + boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: severity.level === 'critical' ? 'red' : 
                 severity.level === 'high' ? 'yellow' : 'cyan',
    title: 'Generated Command',
    titleAlignment: 'left'
  }));

  // Determine confirmation style based on severity
  if (requiresConfirmation(severity.level)) {
    // Dangerous command - require explicit confirmation
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('⚠️  This is a potentially dangerous command. Are you sure?'),
        default: false
      }
    ]);

    if (confirm) {
      await execute(generated.command);
    } else {
      console.log(chalk.dim('\nCommand cancelled.\n'));
    }
  } else {
    // Safe command - normal flow
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: 'list',
        name: 'action',
        message: 'Action:',
        choices: [
          { name: 'Run command', value: 'run' },
          { name: 'Edit command', value: 'edit' },
          { name: 'Cancel', value: 'cancel' }
        ],
        default: 'run'
      }
    ]);

    if (action === 'run') {
      await execute(generated.command);
    } else if (action === 'edit') {
      const { editedCommand } = await inquirer.prompt<{ editedCommand: string }>([
        {
          type: 'input',
          name: 'editedCommand',
          message: 'Edit command:',
          default: generated.command
        }
      ]);

      if (editedCommand.trim()) {
        // Check severity of edited command
        const editedSeverity = checkSeverity(editedCommand);
        if (requiresConfirmation(editedSeverity.level)) {
          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: chalk.red(`⚠️  ${editedSeverity.reason}. Continue?`),
              default: false
            }
          ]);
          if (!confirm) {
            console.log(chalk.dim('\nCommand cancelled.\n'));
            return;
          }
        }
        await execute(editedCommand);
      }
    } else {
      console.log(chalk.dim('\nCommand cancelled.\n'));
    }
  }
}

async function execute(command: string): Promise<void> {
  console.log(chalk.dim('\nExecuting...\n'));
  
  const result = await executeCommand(command);
  
  if (result.exitCode === 0) {
    console.log(chalk.green('\n✓ Command completed successfully\n'));
  } else {
    console.log(chalk.yellow(`\n⚠️  Command exited with code ${result.exitCode}\n`));
  }

  // Show update hint if available (non-blocking, won't delay if not ready)
  await showUpdateHintIfAvailable();
}

async function showUpdateHintIfAvailable(): Promise<void> {
  if (versionCheckPromise) {
    try {
      const versionResult = await versionCheckPromise;
      displayUpdateHint(versionResult);
    } catch {
      // Silently ignore version check errors
    }
  }
}

