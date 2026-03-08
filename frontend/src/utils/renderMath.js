import katex from 'katex'

/**
 * Renders a string containing LaTeX delimiters into an HTML string
 * with properly rendered math.
 *
 * Supports:
 *   - Block math:  $$ ... $$ or \[ ... \]
 *   - Inline math: $ ... $  or \( ... \)
 *
 * Falls back gracefully — if KaTeX fails on a segment, the raw
 * LaTeX is returned wrapped in a <code> tag.
 */
export function renderMathInText(text) {
  if (!text || typeof text !== 'string') return text || ''

  const BLOCK_RE  = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g
  const INLINE_RE = /\$([^\n$]+?)\$|\\\((.+?)\\\)/g

  let html = text

  html = html.replace(BLOCK_RE, (_, g1, g2) => {
    const latex = (g1 || g2 || '').trim()
    try {
      return katex.renderToString(latex, { displayMode: true, throwOnError: false })
    } catch {
      return `<code>${latex}</code>`
    }
  })

  html = html.replace(INLINE_RE, (_, g1, g2) => {
    const latex = (g1 || g2 || '').trim()
    try {
      return katex.renderToString(latex, { displayMode: false, throwOnError: false })
    } catch {
      return `<code>${latex}</code>`
    }
  })

  return html
}

/**
 * Returns true if a string contains LaTeX delimiters.
 */
export function containsLatex(text) {
  if (!text) return false
  return /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\n$]+?\$|\\\(.+?\\\)/.test(text)
}
