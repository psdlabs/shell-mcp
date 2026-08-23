import { getShellType } from "./platform.js";
import type { SafetyConfig } from "./types.js";

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
}

/** Built-in regex patterns for obviously destructive commands. */
const DEFAULT_BLOCKLIST: string[] = [
  "rm\\s+-rf\\s+/(?!tmp)(?:\\b|$)",
  "rm\\s+-rf\\s+~",
  "rm\\s+-rf\\s+\\*",
  "rm\\s+-rf\\s+\\.$",
  "mkfs\\.",
  "dd\\s+.*of=/dev/",
  "> /dev/sd",
  ":\\(\\)\\{\\s*:\\|:&\\s*\\};:",
  "curl.*\\|\\s*(?:bash|sh)",
  "wget.*\\|\\s*(?:bash|sh)",
  "DROP\\s+DATABASE",
  "DROP\\s+TABLE(?!.*IF\\s+EXISTS.*CREATE)",
  "TRUNCATE\\s+TABLE",
  "DELETE\\s+FROM\\s+\\w+\\s*;?\\s*$",
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

const DYNAMIC_REASON =
  "Command blocked by safety guardrail: dynamic shell constructs cannot be safely inspected";
const DYNAMIC_COMMANDS = new Set(["eval", "source", "."]);
const STATE_INDIRECTION_COMMANDS = new Set(["alias"]);
const COMMAND_WRAPPERS = new Set(["command", "builtin", "exec"]);
const CONTROL_KEYWORDS = new Set([
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "select",
  "then",
  "until",
  "while",
]);
const SHELLS = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "dash",
  "fish",
  "ksh",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "zsh",
]);

type Quote = "'" | '"' | null;
type ShellType = ReturnType<typeof getShellType>;
type Unit = { raw: string; dynamic: boolean; unsupported: boolean };
type ClassifiedUnit = { raw: string; normalized: string; uninspectable: boolean };

function basename(value: string): string {
  return value.toLowerCase().split(/[\\/]/).pop() ?? value.toLowerCase();
}

function isPosixShell(shell?: string): boolean {
  if (!shell) return true;
  const type = getShellType(shell);
  if (type === "bash" || type === "zsh") return true;
  return ["ash", "dash", "ksh", "sh"].includes(basename(shell));
}

function isShellOption(value: string): boolean {
  return value === "--command" || /^-[^-]*c/i.test(value) || /^\/[ck]$/i.test(value);
}

function isAssignment(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(value);
}

function isRedirection(value: string): boolean {
  return /^(?:\d+)?(?:>>|<<|<>|>&|<&|&>>?|>|<)/.test(value);
}

function isStandaloneRedirection(value: string): boolean {
  return /^(?:\d+)?(?:>>|<<|<>|>&|<&|&>>?|>|<)$/.test(value);
}

function isEscapedAt(command: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && command[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isRedirectionAmpersand(command: string, index: number): boolean {
  const previous = command[index - 1];
  const next = command[index + 1];
  return (
    ((previous === ">" || previous === "<") && !isEscapedAt(command, index - 1)) ||
    next === ">" ||
    next === "<"
  );
}

function normalizeUnit(source: string): string {
  let output = "";
  let quote: Quote = null;
  let escaped = false;
  let wordStarted = false;

  for (const char of source) {
    if (escaped) {
      if (char !== "\n") output += char;
      wordStarted = true;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      else output += char;
      wordStarted = true;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === "\\") escaped = true;
      else output += char;
      wordStarted = true;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      wordStarted = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      wordStarted = true;
    } else if (char === "#" && !wordStarted) {
      break;
    } else if (/\s/.test(char)) {
      if (output && !output.endsWith(" ")) output += " ";
      wordStarted = false;
    } else {
      output += char;
      wordStarted = true;
    }
  }

  return output.trim();
}

function scanPosix(command: string): { units: Unit[]; inspectable: boolean } {
  const units: Unit[] = [];
  let start = 0;
  let quote: Quote = null;
  let escaped = false;
  let backtick = false;
  let comment = false;
  let dynamic = false;
  let unsupported = false;
  const substitutions: { depth: number; restoreQuote: Quote }[] = [];

  const push = (unitEnd: number, nextStart = unitEnd + 1) => {
    const raw = command.slice(start, unitEnd).trim();
    if (raw) units.push({ raw, dynamic, unsupported });
    start = nextStart;
    dynamic = false;
    unsupported = false;
  };
  const enterSubstitution = () => {
    substitutions.push({ depth: 1, restoreQuote: quote });
    quote = null;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (comment) {
      if (char === "\n") {
        push(index);
        comment = false;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (backtick) {
      if (char === "`") backtick = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === "$") {
        dynamic = true;
        if (command[index + 1] === "(") {
          enterSubstitution();
          index += 1;
        }
      } else if (char === "`") {
        dynamic = true;
        backtick = true;
      }
      continue;
    }
    if (substitutions.length > 0) {
      const substitution = substitutions.at(-1)!;
      if (char === "'" || char === '"') quote = char;
      else if (char === "$") {
        dynamic = true;
        if (command[index + 1] === "(") {
          enterSubstitution();
          index += 1;
        }
      } else if (char === "`") {
        dynamic = true;
        backtick = true;
      } else if (char === "(") substitution.depth += 1;
      else if (char === ")") {
        substitution.depth -= 1;
        if (substitution.depth === 0) {
          substitutions.pop();
          quote = substitution.restoreQuote;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "$") {
      dynamic = true;
      if (command[index + 1] === "(") {
        enterSubstitution();
        index += 1;
      }
    } else if (char === "`") {
      dynamic = true;
      backtick = true;
    } else if (char === "#" && (index === start || /\s/.test(command[index - 1] ?? ""))) {
      comment = true;
    } else if (char === "(" || char === ")" || char === "{" || char === "}") {
      unsupported = true;
    } else if (char === "<" && command[index + 1] === "<") {
      unsupported = true;
    } else if (char === ";" || char === "\n") {
      push(index);
    } else if (char === "&" || char === "|") {
      if (char === "&" && isRedirectionAmpersand(command, index)) {
        continue;
      }
      const separatorLength =
        command[index + 1] === char || (char === "|" && command[index + 1] === "&")
          ? 2
          : 1;
      push(index, index + separatorLength);
      index += separatorLength - 1;
    }
  }

  const finalRaw = command.slice(start).trim();
  if (finalRaw) units.push({ raw: finalRaw, dynamic, unsupported });
  const inspectable = !quote && !escaped && !backtick && substitutions.length === 0;
  return { units: units.length ? units : [{ raw: command.trim(), dynamic, unsupported }], inspectable };
}

function findExecutable(tokens: string[]): { index: number; value: string } | undefined {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "!" || isAssignment(token)) {
      index += 1;
    } else if (isRedirection(token)) {
      index += isStandaloneRedirection(token) ? 2 : 1;
    } else {
      break;
    }
  }
  if (index >= tokens.length) return undefined;
  while (
    index < tokens.length - 1 &&
    COMMAND_WRAPPERS.has(tokens[index].toLowerCase())
  ) {
    index += 1;
  }
  return { index, value: tokens[index] };
}

function containsShellCommandExecution(tokens: string[]): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      SHELLS.has(basename(tokens[index])) &&
      tokens.slice(index + 1).some(isShellOption)
    ) {
      return true;
    }
  }
  return false;
}

function classifyPosix(command: string): ClassifiedUnit[] {
  const scan = scanPosix(command);
  return scan.units.map((unit) => {
    const normalized = unit.dynamic ? unit.raw : normalizeUnit(unit.raw);
    let uninspectable = !scan.inspectable || unit.dynamic || unit.unsupported;
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const executable = findExecutable(tokens);

    if (executable) {
      const name = executable.value.toLowerCase();
      if (
        DYNAMIC_COMMANDS.has(name) ||
        STATE_INDIRECTION_COMMANDS.has(name) ||
        (name === "hash" && tokens.slice(executable.index + 1).includes("-p")) ||
        CONTROL_KEYWORDS.has(name) ||
        /[*?\[]/.test(executable.value)
      ) {
        uninspectable = true;
      }
    }
    if (containsShellCommandExecution(tokens)) uninspectable = true;
    return { raw: unit.raw, normalized, uninspectable };
  });
}

function unsupportedSyntax(command: string, shell: ShellType): boolean {
  let quote: Quote = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (shell === "cmd" && (char === "^" || char === "%" || char === "!")) return true;
    if (shell === "powershell" && char === "`" && quote !== "'") return true;
    if (char === "\\" && shell !== "cmd" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else if (shell === "powershell" && quote === '"' && char === "$") return true;
      continue;
    }
    if (shell !== "cmd" || char === '"') {
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
    }
    if (shell === "powershell" && char === "$") return true;
    if (shell === "unknown" && (char === "$" || char === "%" || char === "`")) return true;
    if (char === "\n") return true;
    if (
      (shell === "powershell" && ";|&".includes(char)) ||
      (shell === "cmd" && "|&<>".includes(char)) ||
      (shell === "unknown" && ";|&".includes(char))
    ) return true;
  }
  if (quote || escaped) return true;

  const tokens = command.trim().split(/\s+/).filter(Boolean);
  const first = tokens[0]?.replace(/^['"]|['"]$/g, "").toLowerCase();
  if (!first || DYNAMIC_COMMANDS.has(first)) return Boolean(first);
  return (
    SHELLS.has(basename(first)) &&
    tokens.slice(1).some((token) => isShellOption(token.replace(/^['"]|['"]$/g, "")))
  );
}

function classify(command: string, shell?: string): ClassifiedUnit[] {
  if (isPosixShell(shell)) return classifyPosix(command);
  const raw = command.trim();
  return [{
    raw,
    normalized: raw,
    uninspectable: unsupportedSyntax(command, getShellType(shell ?? "")),
  }];
}

function matches(pattern: RegExp, values: string[]): boolean {
  return values.some((value) => pattern.test(value));
}

export class SafetyGuard {
  private blockPatterns: RegExp[];
  private allowPatterns: RegExp[] | null;
  private allowlistStrings: string[] | null;
  private warnPatterns: RegExp[];
  private defaultDeny: boolean;
  private failClosed: boolean;

  constructor(config?: SafetyConfig) {
    const blocklist = [...DEFAULT_BLOCKLIST, ...(config?.blocklist ?? [])];
    this.blockPatterns = blocklist.map((pattern) => new RegExp(pattern, "i"));
    this.allowlistStrings = config?.allowlist ? [...config.allowlist] : null;
    this.allowPatterns = this.allowlistStrings
      ? this.allowlistStrings.map((pattern) => new RegExp(`^(?:${pattern})$`, "i"))
      : null;
    const warnings = [...DEFAULT_WARN_PATTERNS, ...(config?.warnPatterns ?? [])];
    this.warnPatterns = warnings.map((pattern) => new RegExp(pattern, "i"));
    this.defaultDeny = config?.defaultDeny ?? false;
    this.failClosed = config?.failClosed ?? true;
  }

  check(command: string, shell?: string): SafetyCheckResult {
    for (const pattern of this.blockPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `Command blocked by safety guardrail: matches destructive pattern "${pattern.source}"`,
        };
      }
    }

    const units = classify(command, shell);
    if (this.failClosed && units.some((unit) => unit.uninspectable)) {
      return { allowed: false, reason: DYNAMIC_REASON };
    }

    const warnings = new Set<string>();
    const collectWarnings = (values: string[]) => {
      for (const pattern of this.warnPatterns) {
        if (matches(pattern, values)) {
          warnings.add(
            `Potentially dangerous: matches "${pattern.source}". Proceeding with caution.`
          );
        }
      }
    };
    collectWarnings([command]);

    for (const unit of units) {
      const values = [unit.raw, unit.normalized];
      for (const pattern of this.blockPatterns) {
        if (matches(pattern, values)) {
          return {
            allowed: false,
            reason: `Command blocked by safety guardrail: matches destructive pattern "${pattern.source}"`,
          };
        }
      }
      if (this.allowPatterns && !this.allowPatterns.some((pattern) => pattern.test(unit.normalized))) {
        return {
          allowed: false,
          reason: "Command not in allowlist. Only explicitly allowed commands can run.",
        };
      }
      if (this.defaultDeny && !this.allowPatterns) {
        return {
          allowed: false,
          reason: "Default-deny mode enabled but no allowlist configured.",
        };
      }
      collectWarnings(values);
    }

    return {
      allowed: true,
      warning: warnings.size ? [...warnings].join("\n") : undefined,
    };
  }

  getConfig(): {
    blocklist: string[];
    allowlist: string[] | null;
    warnPatterns: string[];
    defaultDeny: boolean;
    failClosed: boolean;
  } {
    return {
      blocklist: this.blockPatterns.map((pattern) => pattern.source),
      allowlist: this.allowlistStrings ? [...this.allowlistStrings] : null,
      warnPatterns: this.warnPatterns.map((pattern) => pattern.source),
      defaultDeny: this.defaultDeny,
      failClosed: this.failClosed,
    };
  }
}
