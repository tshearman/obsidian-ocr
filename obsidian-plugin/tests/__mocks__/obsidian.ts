/** Manual mock for the 'obsidian' package (ships types only, no JS entry). */

export class Notice {
  constructor(_message: string) {}
}

export class TFile {
  path = "";
  name = "";
  basename = "";
  extension = "";
  parent: { path: string } | null = null;
}

export class Vault {}

export const normalizePath = (path: string): string =>
  path.replace(/\\/g, "/").replace(/\/+/g, "/");
