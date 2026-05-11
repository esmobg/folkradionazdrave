import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");

const html = await readFile(indexPath, "utf8");

const stylesheetPattern = /<link\s+rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/g;
let cssHrefCount = 0;

const updatedHtml = await replaceAsync(html, stylesheetPattern, async (match, href) => {
  const assetPath = path.join(distDir, href.replace(/^\//, ""));
  const css = await readFile(assetPath, "utf8");
  cssHrefCount += 1;
  return `<style data-inline-styles="${href}">${escapeStyleTag(css)}</style>`;
});

if (cssHrefCount > 0 && updatedHtml !== html) {
  await writeFile(indexPath, updatedHtml);
}

async function replaceAsync(input, pattern, replacer) {
  const matches = [...input.matchAll(pattern)];

  if (matches.length === 0) {
    return input;
  }

  const replacements = await Promise.all(matches.map((match) => replacer(...match)));
  let replacementIndex = 0;

  return input.replace(pattern, () => replacements[replacementIndex++]);
}

function escapeStyleTag(css) {
  return css.replaceAll("</style", "<\\/style");
}
