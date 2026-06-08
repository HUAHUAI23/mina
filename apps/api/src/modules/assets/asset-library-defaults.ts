import type { AssetSystemTagKey } from '@mina/contracts/modules/assets'

export const defaultAssetSystemTags: Array<{
  color: string
  key: AssetSystemTagKey
  name: string
  slug: string
  sortOrder: number
}> = [
  { color: 'zinc', key: 'other', name: '其他', slug: 'other', sortOrder: 0 },
  { color: 'violet', key: 'person', name: '人物', slug: 'person', sortOrder: 1 },
  { color: 'emerald', key: 'scene', name: '场景', slug: 'scene', sortOrder: 2 },
  { color: 'amber', key: 'object', name: '物品', slug: 'object', sortOrder: 3 },
  { color: 'rose', key: 'style', name: '风格', slug: 'style', sortOrder: 4 },
  { color: 'sky', key: 'sound_effect', name: '音效', slug: 'sound-effect', sortOrder: 5 },
]
