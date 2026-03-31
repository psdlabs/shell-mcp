import type { SafetyConfig } from "./types.js";

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
}

/**
 * Built-in patterns for obviously destructive commands.
 * Users can extend via config. These are regex patterns (case-insensitive).
 */
const DEFAULT_BLOCKLIST: string[] = [
  // Recursive delete of root/home
  "rm\\s+-rf\\s+/(?!tmp)\\b",
  "rm\\s+-rf\\s+~",
  "rm\\s+-rf\\s+\\*",
  "rm\\s+-rf\\s+\\.$",
  // Disk/filesystem destruction
  "mkfs\\.",
  "dd\\s+.*of=/dev/",
  "> /dev/sd",
  // Fork bomb
  ":\\(\\)\\{\\s*:\\|:&\\s*\\};:",
  // Pipe-to-shell from network
  "curl.*\\|\\s*(?:bash|sh)",
  "wget.*\\|\\s*(?:bash|sh)",
  // Database mass destruction (no WHERE clause)
  "DROP\\s+DATABASE",
  "DROP\\s+TABLE(?!.*IF\\s+EXISTS.*CREATE)",
  "TRUNCATE\\s+TABLE",
  "DELETE\\s+FROM\\s+\\w+\\s*;?\\s*$",
  // Windows destructive
  "format\\s+[a-zA-Z]:",
  "del\\s+/[sS]\\s+/[qQ]",
  "rd\\s+/[sS]\\s+/[qQ]",
];

const DEFAULT_WARN_PATTERNS: string[] = [
  "sudo\\s+",
  "rm\\s+-rf",
  "rm\\s+-r\\s+",
  "DROP\\s+",
  "TRUNCATE\\s+",
  "git\\s+push\\s+.*--force",
  "git\\s+reset\\s+--hard",
  "shutdown",
  "reboot",
  "kill\\s+-9",
  "pkill\\s+",
  "killall\\s+",
  "chmod\\s+-R\\s+777",
  "> /dev/null\\s+2>&1.*&$",
];

export class SafetyGuard {
  private blockPatterns: RegExp[];
  private allowPatterns: RegExp[] | null;
  private warnPatterns: RegExp[];
  private defaultDeny: boolean;

  constructor(config?: SafetyConfig) {
    const blockStrings = [...DEFAULT_BLOCKLIST, ...(config?.blocklist ?? [])];
    this.blockPatterns = blockStrings.map((p) => new RegExp(p, "i"));

    this.allowPatterns = config?.allowlist
      ? config.allowlist.map((p) => new RegExp(p, "i"))
      : null;

    const warnStrings = [
      ...DEFAULT_WARN_PATTERNS,
      ...(config?.warnPatterns ?? []),
    ];
    this.warnPatterns = warnStrings.map((p) => new RegExp(p, "i"));

    this.defaultDeny = config?.defaultDeny ?? false;
  }

  check(command: string): SafetyCheckResult {
    // Blocklist always wins
    for (const pattern of this.blockPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `Command blocked by safety guardrail: matches destructive pattern "${pattern.source}"`,
        };
      }
    }

    // Allowlist check (if configured, only allowed patterns pass)
    if (this.allowPatterns) {
      const allowed = this.allowPatterns.some((p) => p.test(command));
      if (!allowed) {
        return {
          allowed: false,
          reason:
            "Command not in allowlist. Only explicitly allowed commands can run.",
        };
      }
    }

    // Default deny without allowlist
    if (this.defaultDeny && !this.allowPatterns) {
      return {
        allowed: false,
        reason: "Default-deny mode enabled but no allowlist configured.",
      };
    }

    // Warn patterns (allowed but flagged)
    for (const pattern of this.warnPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: true,
          warning: `Potentially dangerous: matches "${pattern.source}". Proceeding with caution.`,
        };
      }
    }

    return { allowed: true };
  }

  /** Get current config for inspection (read-only). */
  getConfig(): {
    blocklist: string[];
    allowlist: string[] | null;
    warnPatterns: string[];
    defaultDeny: boolean;
  } {
    return {
      blocklist: this.blockPatterns.map((p) => p.source),
      allowlist: this.allowPatterns?.map((p) => p.source) ?? null,
      warnPatterns: this.warnPatterns.map((p) => p.source),
      defaultDeny: this.defaultDeny,
    };
  }
}
