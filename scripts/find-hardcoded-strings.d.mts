/** Types for the hard-coded string scanner, which is plain ESM so it can also be run directly. */

export type Finding = {
  /** 1-indexed line the text was found on. */
  line: number;
  /**
   * "text" for content between JSX tags, "expression" for a rendered literal,
   * "template" for a rendered template literal, "raw-value" for a stored value
   * printed as it is, otherwise the prop or key name.
   */
  kind: string;
  text: string;
};

export type FileFindings = {
  /** Repo-relative, forward slashes. */
  file: string;
  findings: Finding[];
};

export function findInSource(source: string): Finding[];

export function scan(patterns?: string[]): FileFindings[];
