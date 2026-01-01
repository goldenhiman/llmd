# Contributing to llmd

Thank you for your interest in contributing to llmd! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're here to build something useful together.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yourusername/llmd/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Your environment (OS, Node.js version, llmd version)
   - Any relevant error messages

### Suggesting Features

1. Check existing issues and discussions for similar ideas
2. Create a new issue with the "feature request" label
3. Describe the feature and its use case
4. Explain why it would be valuable

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Commit with a descriptive message
7. Push and open a Pull Request

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm, yarn, or pnpm

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/llmd.git
cd llmd

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode (watches for changes)
npm run dev

# Link for local testing
npm link
```

### Project Structure

```
llmd/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── types.ts              # TypeScript interfaces
│   ├── commands/             # CLI command handlers
│   │   ├── run.ts            # Main command execution
│   │   ├── config.ts         # Config management
│   │   └── setup.ts          # Setup wizard
│   ├── providers/            # LLM provider implementations
│   │   ├── base.ts           # Abstract base class
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── groq.ts
│   │   ├── gemini.ts
│   │   └── openrouter.ts
│   ├── services/             # Core services
│   │   ├── llm.ts            # LLM orchestration
│   │   ├── verifier.ts       # Command verification
│   │   └── severity.ts       # Danger detection
│   ├── config/
│   │   └── manager.ts        # Configuration management
│   └── utils/
│       ├── prompts.ts        # LLM prompts
│       └── terminal.ts       # Terminal utilities
├── tests/                    # Test files
├── package.json
├── tsconfig.json
└── README.md
```

## Coding Standards

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Define interfaces for all data structures
- Avoid `any` - use `unknown` if type is truly unknown
- Use meaningful variable and function names

### Code Style

- Use 2-space indentation
- Use single quotes for strings
- Add trailing commas in multi-line arrays/objects
- Keep functions small and focused

### Commits

- Use present tense: "Add feature" not "Added feature"
- Be descriptive but concise
- Reference issues when applicable: "Fix #123: Handle empty input"

## Adding a New Provider

To add support for a new LLM provider:

1. Create a new file in `src/providers/`:

```typescript
// src/providers/newprovider.ts
import { BaseLLMProvider } from './base.js';
import type { ProviderConfig, ProviderName } from '../types.js';

export class NewProvider extends BaseLLMProvider {
  name: ProviderName = 'newprovider';
  private client: NewProviderSDK;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new NewProviderSDK({ apiKey: config.apiKey });
  }

  async chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    // Implement the chat method using the provider's SDK
    const response = await this.client.chat(messages);
    return response.text;
  }
}
```

2. Add the provider to `src/types.ts`:

```typescript
export type ProviderName = 'openai' | 'anthropic' | ... | 'newprovider';
```

3. Add to `src/providers/index.ts`:

```typescript
import { NewProvider } from './newprovider.js';

export function createProvider(name: ProviderName, config: ProviderConfig): LLMProvider {
  switch (name) {
    // ...
    case 'newprovider':
      return new NewProvider(config);
    // ...
  }
}
```

4. Add models to `src/utils/prompts.ts`:

```typescript
export const PROVIDER_MODELS: Record<string, string[]> = {
  // ...
  newprovider: ['model-1', 'model-2'],
};
```

5. Update the setup wizard in `src/commands/setup.ts`

6. Add the SDK dependency to `package.json`

7. Update README.md with the new provider

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/services/severity.test.ts
```

### Writing Tests

- Place tests next to source files or in `tests/` directory
- Use descriptive test names
- Test edge cases and error conditions
- Mock external API calls

## Questions?

Feel free to open an issue for any questions about contributing!

