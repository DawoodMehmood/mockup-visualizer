import React, { useState } from 'react'
import Viewer from './components/Viewer'
import Toolbar from './components/Toolbar'

export default function App() {
  const [glbUrl, setGlbUrl] = useState(null)
  const [logos, setLogos] = useState([])
  const [texts, setTexts] = useState([])
  const [assetSelection, setAssetSelection] = useState(null)

  return (
    <div className="h-screen flex">
      <div className="w-96 bg-gray-900 text-white p-4 overflow-auto">
        <h1 className="text-2xl font-bold mb-3">Mockup Visualizer</h1>

        <Toolbar
          glbUrl={glbUrl}
          onLoadGLB={(url) => setGlbUrl(url)}
          onRemoveGLB={() => setGlbUrl(null)}
          logos={logos}
          onAddLogo={(f) => {
            setLogos((s) => [...s, f])
            setAssetSelection({ type: 'logo', index: logos.length })
          }}
          onRemoveLogo={(idx) => {
            setLogos((s) => s.filter((_, i) => i !== idx))
            setAssetSelection(null)
          }}
          texts={texts}
          onAddText={(t) => {
            setTexts((s) => [...s, t])
            setAssetSelection({ type: 'text', index: texts.length })
          }}
          onRemoveText={(idx) => {
            setTexts((s) => s.filter((_, i) => i !== idx))
            setAssetSelection(null)
          }}
          assetSelection={assetSelection}
          onSelectAsset={(sel) => setAssetSelection(sel)}
        />

        <div className="mt-6 text-sm text-gray-300">
          <strong>How to use</strong>
          <ol className="list-decimal list-inside mt-2 text-xs text-gray-400">
            <li>Upload a GLB (or drag) — model is centered and fitted.</li>
            <li>Upload logos or add text entries (multiple allowed).</li>
            <li>Select a logo/text from the side panel (it becomes active).</li>
            <li>Click the model to place a decal.</li>
            <li>Click a decal to select it — handles appear.</li>
            <li>Use buttons to rotate, scale, delete.</li>
            <li>Export PNG using Export button.</li>
          </ol>
        </div>
      </div>

      <div className="flex-1 relative">
        <Viewer
          glbUrl={glbUrl}
          logos={logos}
          texts={texts}
          assetSelection={assetSelection}
        />
      </div>
    </div>
  )
}