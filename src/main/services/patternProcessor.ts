/**
 * 当 caseSensitive 为 false 时，如果模式包含下划线分隔的单词，
 * 自动生成包含驼峰命名的变体模式，以匹配不同的命名风格
 */
export function processPattern(pattern: string, caseSensitive?: boolean): string {
  if (caseSensitive !== false || !pattern.includes('_')) {
    return pattern
  }

  // 如果原模式已经包含 |，说明是多个模式的组合，需要分别处理
  if (pattern.includes('|')) {
    const patterns = pattern.split('|').map(p => p.trim())
    const allVariants = new Set<string>()

    patterns.forEach(p => {
      // 保持原模式（-i 标志会处理大小写）
      allVariants.add(p)

      // 如果包含下划线，生成驼峰变体
      if (p.includes('_')) {
        const camelCase = convertToCamelCase(p)
        if (camelCase !== p) {
          allVariants.add(camelCase)
        }
      }
    })

    return Array.from(allVariants).join('|')
  }

  // 单个模式，生成驼峰变体（如果需要）
  const camelCase = convertToCamelCase(pattern)
  if (camelCase !== pattern) {
    return `${pattern}|${camelCase}`
  }

  return pattern
}

/**
 * 将下划线命名转换为驼峰命名
 * 例如：node_type -> nodeType
 */
function convertToCamelCase(text: string): string {
  return text.replace(/_([a-z])/gi, (_, letter) => letter.toUpperCase()).replace(/_/g, '')
}
