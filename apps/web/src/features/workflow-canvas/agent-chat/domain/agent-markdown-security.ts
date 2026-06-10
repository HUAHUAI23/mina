import type { LinkSafetyConfig, StreamdownProps, UrlTransform } from 'streamdown'

const allowedLinkProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export const agentMarkdownAllowedElements = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const

export const agentMarkdownUrlTransform: UrlTransform = (url, key) => {
  const trimmed = url.trim()
  if (!trimmed) {
    return undefined
  }
  if (key === 'href' && trimmed.startsWith('#')) {
    return trimmed
  }
  if (key !== 'href') {
    return undefined
  }
  try {
    const parsed = new URL(trimmed)
    return allowedLinkProtocols.has(parsed.protocol) ? trimmed : undefined
  } catch {
    return undefined
  }
}

export const agentMarkdownLinkSafety: LinkSafetyConfig = {
  enabled: true,
  onLinkCheck: (url) => agentMarkdownUrlTransform(url, 'href', { type: 'element', tagName: 'a', properties: {}, children: [] }) !== undefined,
}

export const agentMarkdownSecurityProps = {
  allowedElements: agentMarkdownAllowedElements,
  disallowedElements: ['img'],
  linkSafety: agentMarkdownLinkSafety,
  skipHtml: true,
  unwrapDisallowed: true,
  urlTransform: agentMarkdownUrlTransform,
} satisfies Pick<
  StreamdownProps,
  'allowedElements' | 'disallowedElements' | 'linkSafety' | 'skipHtml' | 'unwrapDisallowed' | 'urlTransform'
>
