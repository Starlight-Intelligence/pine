import { bundledLanguages } from "shiki/langs";

const fileNames: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gemfile: "ruby",
  ".gitignore": "ignore",
  ".gitattributes": "ignore",
  ".env": "dotenv",
};
const extensions: Record<string, string> = {
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  yml: "yaml",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shellscript",
  zsh: "shellscript",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  kt: "kotlin",
  txt: "text",
};

export function fileLanguage(relativePath: string): string {
  const name = relativePath.split("/").at(-1)?.toLowerCase() ?? "";
  if (name.startsWith(".env.")) return "dotenv";
  const extension = name.split(".").at(-1) ?? "";
  const language = fileNames[name] ?? extensions[extension] ?? extension;
  return language in bundledLanguages ? language : "text";
}
