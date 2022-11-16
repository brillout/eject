export { isScriptFile }

// Copy-pasted & adapated from vite-plugin-ssr

const scriptFileExtensions = '(js|cjs|mjs|ts|cts|mts|jsx|cjsx|mjsx|tsx|ctsx|mtsx|vue|svelte|marko|md|mdx)'

function isScriptFile(file: string) {
  const extensionList = parseGlob(scriptFileExtensions)
  return extensionList.some((ext) => file.endsWith('.' + ext))
}
function parseGlob(pattern: string) {
  return pattern.slice(1, -1).split('|')
}
