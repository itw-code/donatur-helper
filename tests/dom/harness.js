import { parseHtml } from './mini-dom.js';

export function render(renderView, viewModel) {
  const html = renderView(viewModel);
  return { html, document: parseHtml(html) };
}
