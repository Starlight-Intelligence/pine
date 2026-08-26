import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt();
const defaultLinkOpen = markdown.renderer.rules.link_open;

markdown.renderer.rules.link_open = (
  tokens,
  index,
  options,
  environment,
  renderer,
) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options);
};

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
