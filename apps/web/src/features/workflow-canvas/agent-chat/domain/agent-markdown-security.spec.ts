import { describe, expect, test } from 'bun:test'

import { agentMarkdownAllowedElements, agentMarkdownSecurityProps, agentMarkdownUrlTransform } from './agent-markdown-security'

const node = { type: 'element' as const, tagName: 'a', properties: {}, children: [] }

describe('agent markdown security', () => {
  test('allows only explicit safe link protocols and anchors', () => {
    expect(agentMarkdownUrlTransform('https://example.com/path', 'href', node)).toBe('https://example.com/path')
    expect(agentMarkdownUrlTransform('http://example.com/path', 'href', node)).toBe('http://example.com/path')
    expect(agentMarkdownUrlTransform('mailto:team@example.com', 'href', node)).toBe('mailto:team@example.com')
    expect(agentMarkdownUrlTransform('tel:+15551234567', 'href', node)).toBe('tel:+15551234567')
    expect(agentMarkdownUrlTransform('#section', 'href', node)).toBe('#section')
  })

  test('rejects javascript, relative, protocol-relative, and image urls', () => {
    expect(agentMarkdownUrlTransform('javascript:alert(1)', 'href', node)).toBeUndefined()
    expect(agentMarkdownUrlTransform('/internal/path', 'href', node)).toBeUndefined()
    expect(agentMarkdownUrlTransform('//example.com/path', 'href', node)).toBeUndefined()
    expect(agentMarkdownUrlTransform('https://example.com/image.png', 'src', {
      ...node,
      tagName: 'img',
    })).toBeUndefined()
  })

  test('keeps a small markdown element allowlist and skips raw html', () => {
    expect(agentMarkdownAllowedElements).toContain('a')
    expect(agentMarkdownAllowedElements).toContain('code')
    expect(agentMarkdownAllowedElements).toContain('table')
    expect(agentMarkdownAllowedElements).not.toContain('img')
    expect(agentMarkdownSecurityProps.skipHtml).toBe(true)
    expect(agentMarkdownSecurityProps.disallowedElements).toEqual(['img'])
  })
})
