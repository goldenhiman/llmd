import Conf from 'conf';
import type { ToolInfo } from '../types.js';

interface ToolsConfig {
  availableTools: ToolInfo[];
  scanDate?: number;
}

const DEFAULT_TOOLS_CONFIG: ToolsConfig = {
  availableTools: [],
  scanDate: undefined
};

class ToolsConfigManager {
  private config: Conf<ToolsConfig>;

  constructor() {
    this.config = new Conf<ToolsConfig>({
      projectName: 'llmd-tools',
      defaults: DEFAULT_TOOLS_CONFIG,
      schema: {
        availableTools: {
          type: 'array'
        },
        scanDate: {
          type: 'number'
        }
      }
    });
  }

  get path(): string {
    return this.config.path;
  }

  getAvailableTools(): ToolInfo[] {
    return this.config.get('availableTools') || [];
  }

  setAvailableTools(tools: ToolInfo[]): void {
    this.config.set('availableTools', tools);
    this.config.set('scanDate', Date.now());
  }

  getScanDate(): number | undefined {
    return this.config.get('scanDate');
  }

  hasScannedTools(): boolean {
    return (this.getAvailableTools()).length > 0;
  }

  reset(): void {
    this.config.clear();
  }
}

export const toolsConfigManager = new ToolsConfigManager();

