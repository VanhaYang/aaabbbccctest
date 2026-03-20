const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/**
 * 从 Squirrel.Windows 构建产物生成 latest.yml
 */
function generateLatestYml() {
  const releaseDir = path.join(__dirname, '..', 'release', 'squirrel-windows')
  const outputFile = path.join(__dirname, '..', 'release', 'latest.yml')

  // 读取 package.json 获取版本号
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
  )
  const version = packageJson.version
  const productName = packageJson.productName || 'Electron Screenshot'

  // 查找 Setup.exe 文件
  const setupExe = path.join(releaseDir, `${productName}-${version}-Setup.exe`)
  if (!fs.existsSync(setupExe)) {
    console.error(`错误: 找不到安装程序文件: ${setupExe}`)
    process.exit(1)
  }

  // 计算文件大小和 SHA512
  const fileBuffer = fs.readFileSync(setupExe)
  const fileSize = fileBuffer.length
  const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('base64')

  // 获取文件名
  const fileName = path.basename(setupExe)

  // 生成 latest.yml 内容
  const ymlContent = `version: ${version}
files:
  - url: ${fileName}
    sha512: ${sha512}
    size: ${fileSize}
path: ${fileName}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`

  // 写入文件
  fs.writeFileSync(outputFile, ymlContent, 'utf-8')
  console.log(`✅ 已生成 latest.yml: ${outputFile}`)
  console.log(`   版本: ${version}`)
  console.log(`   文件: ${fileName}`)
  console.log(`   大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)
}

generateLatestYml()

