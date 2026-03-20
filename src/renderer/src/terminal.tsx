import React from 'react'
import ReactDOM from 'react-dom/client'
import Terminal from './components/Terminal'
import './index.css'

/**
 * 终端页面入口
 */
const root = ReactDOM.createRoot(document.getElementById('root')!)

root.render(
  <React.StrictMode>
    <Terminal />
  </React.StrictMode>
)

