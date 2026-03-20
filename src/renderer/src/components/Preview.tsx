import React, { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { marked } from 'marked'
import './Preview.css'

interface PreviewProps {}

const Preview: React.FC<PreviewProps> = () => {
  const [code, setCode] = useState<string>('')
  const [language, setLanguage] = useState<string>('html')
  const [actualLanguage, setActualLanguage] = useState<string>('') // 实际的语言类型（用于 code 类型的语法高亮）
  const [mediaData, setMediaData] = useState<{ dataUrl: string; fileType: string; fileName: string } | null>(null)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)

  // 监听来自主进程的代码更新消息
  useEffect(() => {
    const handleCodeUpdate = (data: { code: string; language: string }) => {
      setCode(data.code)
      const receivedLanguage = data.language || 'html'
      
      // 保存实际的语言类型（用于 code 类型的语法高亮）
      setActualLanguage(receivedLanguage)
      
      // 将接收到的语言映射到预览器的语言类型
      // 如果接收到的语言不在 html, json, markdown, text, code 中，则归类为 code
      const previewLanguages = ['html', 'json', 'markdown', 'text', 'code']
      if (previewLanguages.includes(receivedLanguage.toLowerCase())) {
        setLanguage(receivedLanguage.toLowerCase())
      } else {
        // 其他语言（如 python, js, css, c#, shell, bash 等）统一归类为 code
        setLanguage('code')
      }
      
      // 清空媒体数据，确保切换到代码预览模式
      setMediaData(null)
    }

    // 监听媒体预览
    const handleMediaOpen = (data: { dataUrl: string; fileType: string; fileName: string }) => {
      setMediaData(data)
      // 清空代码内容
      setCode('')
      setLanguage('html')
    }

    // 通过 window.electronAPI 监听消息
    if (window.electronAPI?.preview) {
      window.electronAPI.preview.onCodeUpdate(handleCodeUpdate)
      window.electronAPI.preview.onMediaOpen(handleMediaOpen)
    }

    return () => {
      if (window.electronAPI?.preview) {
        window.electronAPI.preview.removeCodeUpdateListener()
      }
    }
  }, [])

  // 判断是否显示右侧预览（HTML、Markdown 和媒体文件需要）
  const showPreview = language === 'html' || language === 'markdown' || mediaData !== null

  // 更新预览（HTML、Markdown 和媒体文件需要）
  useEffect(() => {
    if (showPreview) {
      updatePreview()
    }
  }, [code, language, showPreview, mediaData])

  // 更新预览iframe内容
  const updatePreview = () => {
    if (!previewFrameRef.current) return

    const iframe = previewFrameRef.current
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document

    if (!iframeDoc) return

    // 如果是媒体文件，显示媒体预览
    if (mediaData) {
      const { dataUrl, fileType, fileName } = mediaData
      let htmlContent = ''

      if (fileType === 'image') {
        htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #1e1e1e;
      padding: 20px;
    }
    .image-container {
      max-width: 100%;
      max-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
  </style>
</head>
<body>
  <div class="image-container">
    <img src="${dataUrl}" alt="${fileName}" />
  </div>
</body>
</html>
        `
      } else if (fileType === 'video') {
        htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #1e1e1e;
      padding: 20px;
    }
    .video-container {
      width: 100%;
      max-width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    video {
      max-width: 100%;
      max-height: 100vh;
      outline: none;
    }
  </style>
</head>
<body>
  <div class="video-container">
    <video controls autoplay>
      <source src="${dataUrl}" />
      您的浏览器不支持视频播放
    </video>
  </div>
</body>
</html>
        `
      } else if (fileType === 'audio') {
        htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .audio-container {
      width: 100%;
      max-width: 600px;
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }
    .audio-title {
      font-size: 18px;
      font-weight: 600;
      color: #333;
      margin-bottom: 24px;
      text-align: center;
      word-break: break-all;
    }
    audio {
      width: 100%;
      outline: none;
    }
  </style>
</head>
<body>
  <div class="audio-container">
    <div class="audio-title">${fileName}</div>
    <audio controls autoplay>
      <source src="${dataUrl}" />
      您的浏览器不支持音频播放
    </audio>
  </div>
</body>
</html>
        `
      }

      iframeDoc.open()
      iframeDoc.write(htmlContent)
      iframeDoc.close()
      return
    }

    // 根据语言类型处理代码
    let htmlContent = ''
    if (language === 'html' || !language) {
      // 如果是HTML，直接使用
      htmlContent = code
    } else if (language === 'markdown') {
      // 如果是Markdown，渲染成HTML
      try {
        const renderedMarkdown = marked.parse(code, {
          breaks: true, // 支持换行
          gfm: true // 支持GitHub风格的Markdown
        })
        htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>预览</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      background: #fff;
      line-height: 1.6;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p {
      margin-bottom: 16px;
    }
    ul, ol {
      margin-bottom: 16px;
      padding-left: 2em;
    }
    li {
      margin-bottom: 0.25em;
    }
    code {
      padding: 0.2em 0.4em;
      margin: 0;
      font-size: 85%;
      background-color: rgba(27, 31, 35, 0.05);
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    }
    pre {
      padding: 16px;
      overflow: auto;
      font-size: 85%;
      line-height: 1.45;
      background-color: #f6f8fa;
      border-radius: 3px;
      margin-bottom: 16px;
    }
    pre code {
      display: inline;
      padding: 0;
      margin: 0;
      overflow: visible;
      line-height: inherit;
      word-wrap: normal;
      background-color: transparent;
      border: 0;
    }
    blockquote {
      padding: 0 1em;
      color: #6a737d;
      border-left: 0.25em solid #dfe2e5;
      margin-bottom: 16px;
    }
    table {
      border-spacing: 0;
      border-collapse: collapse;
      margin-bottom: 16px;
      width: 100%;
    }
    table th,
    table td {
      padding: 6px 13px;
      border: 1px solid #dfe2e5;
    }
    table th {
      font-weight: 600;
      background-color: #f6f8fa;
    }
    img {
      max-width: 100%;
      box-sizing: content-box;
      background-color: #fff;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: #e1e4e8;
      border: 0;
    }
  </style>
</head>
<body>
  ${renderedMarkdown}
</body>
</html>
        `
      } catch (error) {
        console.error('[预览] Markdown 渲染失败:', error)
        htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>预览</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      background: #f5f5f5;
      color: #d32f2f;
    }
  </style>
</head>
<body>
  <p>Markdown 渲染失败，请检查代码格式。</p>
  <pre><code>${escapeHtml(code)}</code></pre>
</body>
</html>
        `
      }
    } else {
      // 如果是其他语言，包装在HTML中
      htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>预览</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      background: #f5f5f5;
    }
    pre {
      background: #fff;
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    code {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <pre><code>${escapeHtml(code)}</code></pre>
</body>
</html>
      `
    }

    // 写入iframe内容
    iframeDoc.open()
    iframeDoc.write(htmlContent)
    iframeDoc.close()
  }

  // HTML转义函数
  const escapeHtml = (text: string): string => {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  // 处理代码输入变化
  const handleCodeChange = (value: string | undefined) => {
    setCode(value || '')
  }

  // 处理语言选择变化
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value)
  }

  // 将语言类型映射到 Monaco Editor 的语言模式
  const getMonacoLanguage = (lang: string): string => {
    // 如果是 code 类型，使用实际的语言类型进行语法高亮
    if (lang === 'code' && actualLanguage) {
      return mapLanguageToMonaco(actualLanguage)
    }
    
    const languageMap: Record<string, string> = {
      html: 'html',
      json: 'json',
      markdown: 'markdown',
      text: 'plaintext',
      code: 'plaintext' // 默认使用纯文本，如果有 actualLanguage 会覆盖
    }
    return languageMap[lang] || 'plaintext'
  }

  // 将各种语言映射到 Monaco Editor 支持的语言
  const mapLanguageToMonaco = (lang: string): string => {
    const langLower = lang.toLowerCase()
    const languageMap: Record<string, string> = {
      // 脚本语言
      javascript: 'javascript',
      js: 'javascript',
      typescript: 'typescript',
      ts: 'typescript',
      python: 'python',
      py: 'python',
      // 样式语言
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      less: 'less',
      // 标记语言
      html: 'html',
      xml: 'xml',
      markdown: 'markdown',
      md: 'markdown',
      // 数据格式
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      // 编程语言
      java: 'java',
      csharp: 'csharp',
      'c#': 'csharp',
      cpp: 'cpp',
      'c++': 'cpp',
      c: 'c',
      go: 'go',
      rust: 'rust',
      php: 'php',
      ruby: 'ruby',
      swift: 'swift',
      kotlin: 'kotlin',
      scala: 'scala',
      // Shell 脚本
      shell: 'shellscript',
      bash: 'shellscript',
      sh: 'shellscript',
      zsh: 'shellscript',
      powershell: 'powershell',
      ps1: 'powershell',
      // 数据库
      sql: 'sql',
      mysql: 'sql',
      postgresql: 'sql',
      // 其他
      dockerfile: 'dockerfile',
      makefile: 'makefile',
      ini: 'ini',
      toml: 'toml',
      plaintext: 'plaintext',
      text: 'plaintext'
    }
    return languageMap[langLower] || 'plaintext'
  }

  return (
    <div className="preview-container">
      <div className="preview-header">
        <h1>{mediaData ? '媒体预览器' : 'HTML 预览器'}</h1>
        {!mediaData && (
          <div className="preview-controls">
            <label>
              语言类型:
              <select value={language} onChange={handleLanguageChange}>
                <option value="html">HTML</option>
                <option value="json">JSON</option>
                <option value="markdown">Markdown</option>
                <option value="text">纯文本</option>
                <option value="code">代码</option>
              </select>
            </label>
          </div>
        )}
      </div>
      <div className={`preview-content ${showPreview ? '' : 'single-editor'}`}>
        {!mediaData && (
          <div className={`preview-editor ${showPreview ? '' : 'full-width'}`}>
            <div className="editor-header">代码编辑器</div>
            <div className="monaco-editor-wrapper">
              <Editor
                height="100%"
                language={getMonacoLanguage(language)}
                value={code}
                onChange={handleCodeChange}
                theme="vs"
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  formatOnPaste: true,
                  formatOnType: true,
                  suggestOnTriggerCharacters: true,
                  acceptSuggestionOnEnter: 'on',
                  quickSuggestions: true
                }}
              />
            </div>
          </div>
        )}
        {showPreview && (
          <div className={`preview-viewer ${mediaData ? 'full-width' : ''}`}>
            <div className="viewer-header">
              {mediaData ? `预览 - ${mediaData.fileName}` : '预览效果'}
            </div>
            <iframe
              ref={previewFrameRef}
              className="preview-frame"
              title="预览"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default Preview

