// src/App.tsx
import { useState, useEffect } from 'react'
import Viewer from './components/Viewer'
import MaterialSwatches from './components/MaterialSwatches'
import DecalList from './components/DecalList'
import * as THREE from 'three'
import { FiDownload, FiSun, FiTrash, FiUpload } from 'react-icons/fi' // used in floating toggle

// Note: we reuse Toolbar's GLB/logo/text helpers inline here rather than importing Toolbar.
// This keeps panel contents colocated for the tabs.

export default function App() {
  const [logos, setLogos] = useState<File[]>([])
  const [texts, setTexts] = useState<string[]>([])
  const [assetSelection, setAssetSelection] = useState<{ type: 'logo' | 'text'; index: number } | null>(null)
  const [modelRoot, setModelRoot] = useState<THREE.Object3D | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const [glbUrl, setGlbUrl] = useState<string | null>(null)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [clearAllDecals, setClearAllDecals] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<'Model' | 'Colors' | 'Texts' | 'Logos'>('Model')
  const [canvasBgWhite, setCanvasBgWhite] = useState(false)

  useEffect(() => {
    const modelHandler = (e: any) => {
      const model = e?.detail?.model ?? null
      setModelRoot(model)
    }
    window.addEventListener('modelReady', modelHandler)

    // clear asset selection event from ModelWithDecals
    const clearSel = () => setAssetSelection(null)
    window.addEventListener('clearAssetSelection', clearSel)

    return () => {
      window.removeEventListener('modelReady', modelHandler)
      window.removeEventListener('clearAssetSelection', clearSel)
    }
  }, [])

  // Helpers for model delete/reset
  const deleteModelAndResetAll = () => {
    // confirmation handled by caller
    // clear model and everything: decals, logos, texts, asset selection
    if (glbUrl) URL.revokeObjectURL(glbUrl)
    setGlbUrl(null)
    setLogos([])
    setTexts([])
    setAssetSelection(null)
    setModelRoot(null)
    setModelLoaded(false)
    setInputKey((prev) => prev + 1)
    setClearAllDecals(true)

    // ask ModelWithDecals to clear decals
    window.dispatchEvent(new CustomEvent('clearDecals'))
    // notify modelReady null
    window.dispatchEvent(new CustomEvent('modelReady', { detail: { model: null } }))
  }

  // model command helpers used by left floating buttons
  const doModelZoom = (delta: number) => window.dispatchEvent(new CustomEvent('modelCommand', { detail: { action: 'zoom', delta } }))
  const doModelRotate = (deg: number) => window.dispatchEvent(new CustomEvent('modelCommand', { detail: { action: 'rotate', axis: 'y', deg } }))

  // Tab content components
  const ModelTab = (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Upload GLB
      </label>

      <div className='flex justify-center mt-8'>
        {!modelLoaded ? (
          <label className="relative inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded cursor-pointer hover:bg-indigo-700 transition">
            <FiUpload className="mr-2 text-lg" />
            <span>Choose GLB File</span>
            <input
              key={inputKey}
              type="file"
              accept=".glb,.gltf"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const url = URL.createObjectURL(f)
                setGlbUrl(url)
                setModelLoaded(true)
                setActiveTab('Model')
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        ) : (
          <button
            className="bg-red-600 text-white px-4 py-2 rounded cursor-pointer inline-flex items-center"
            onClick={() => {
              const ok = window.confirm(
                'Delete model and reset everything? This cannot be undone.'
              )
              if (!ok) return
              deleteModelAndResetAll()
              setActiveTab('Model')
            }}
          >
            <FiTrash className="mr-2 text-lg" />
            <span>Delete Model</span>
          </button>
        )}
      </div>
    </div>
  )

  const ColorsTab = (
    <div>
      <MaterialSwatches modelRoot={modelRoot} />
    </div>
  )

  const TextsTab = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Add Text</label>
        <AddTextControl
          onAdd={(t) => {
            setTexts((s) => [...s, t])
            // select newly added as active asset so user can place
            setAssetSelection({ type: 'text', index: texts.length })
            // switch active tab maybe
          }}
        />
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Texts</h4>
        <div className="space-y-2">
          {texts.length === 0 && <div className="text-sm text-gray-600">No texts added</div>}
          {texts.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-2 bg-gray-100 p-2 rounded">
              <div className="flex items-center gap-2">
                <div className="text-sm">{t}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                  onClick={() => setAssetSelection({ type: 'text', index: i })}
                >
                  Select
                </button>
                <button
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                  onClick={() => {
                    if (!window.confirm('Delete this text?')) return
                    setTexts((s) => s.filter((_, idx) => idx !== i))
                    // also clear selection if it was selected
                    if (assetSelection?.type === 'text' && assetSelection.index === i) setAssetSelection(null)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )


  const LogosTab = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Upload Logo</label>
        <div className='flex justify-center'>
          <label className="relative inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded cursor-pointer hover:bg-indigo-700 transition">
            <FiUpload className="mr-2 text-lg" />
            <span>Choose File</span>
            <input
              key={inputKey}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setLogos((s) => [...s, f])
                setAssetSelection({ type: 'logo', index: logos.length })
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Logos</h4>
        <div className="space-y-2">
          {logos.length === 0 && <div className="text-sm text-gray-600">No logos uploaded</div>}
          {logos.map((f, i) => (
            <div key={i} className={`flex items-center justify-between gap-2 bg-gray-100 p-2 rounded ${i === assetSelection?.index ? 'outline-blue-600 outline-2' : ''}`}>
              <div className="flex items-center gap-2">
                <img src={URL.createObjectURL(f)} alt={f.name} className="w-12 h-12 object-contain bg-white/5 rounded" />
                <div className="text-sm">{f.name}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                  onClick={() => setAssetSelection({ type: 'logo', index: i })}
                >
                  Select
                </button>
                <button
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                  onClick={() => {
                    if (!window.confirm('Delete this logo?')) return
                    // remove logo from assets
                    setLogos((s) => s.filter((_, idx) => idx !== i))
                    // if that logo was selected, clear selection
                    if (assetSelection?.type === 'logo' && assetSelection.index === i) setAssetSelection(null)
                    // tell ModelWithDecals to remove any decals that reference this logo index
                    window.dispatchEvent(new CustomEvent('removeLogoAsset', { detail: { index: i } }))
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex">
      {/* Left floating controls (vertical) */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-40">
        <div className="flex flex-col gap-2 items-center">

          <button
            title="Toggle Background"
            onClick={() => setCanvasBgWhite((s) => !s)}
            className="p-2.5 rounded bg-white/10 hover:bg-white/20 mt-2"
          >
            <FiSun color='black' strokeWidth={3} size={20} />
          </button>

          <button
            title="Zoom In"
            disabled={!modelLoaded}
            onClick={() => doModelZoom(1.12)}
            className={`p-2 rounded bg-white/10 ${!modelLoaded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
          >
            <img src='/zoom-in.svg' width={25} color={canvasBgWhite ? '#111' : '#fff'} />

          </button>

          <button
            title="Zoom Out"
            disabled={!modelLoaded}
            onClick={() => doModelZoom(1 / 1.12)}
            className={`p-2 rounded bg-white/10 ${!modelLoaded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
          >
            <img src='/zoom-out.svg' width={25} />

          </button>

          <button
            title="Rotate Clockwise"
            disabled={!modelLoaded}
            onClick={() => doModelRotate(-15)}
            className={`p-2 rounded bg-white/10 ${!modelLoaded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
          >
            <img src='/left.svg' width={25} />

          </button>

          <button
            title="Rotate Anti-clockwise"
            disabled={!modelLoaded}
            onClick={() => doModelRotate(15)}
            className={`p-2 rounded bg-white/10 ${!modelLoaded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
          >
            <img src='/right.svg' width={25} />

          </button>


        </div>
      </div>

      {/* Main viewer area */}
      <div className="flex-1 relative">
        <Viewer glbUrl={glbUrl} logos={logos} texts={texts} assetSelection={assetSelection} bgColor={canvasBgWhite ? '#f5f5f5' : '#0f172a'} />
      </div>

      {/* Right panel */}
      <aside className="w-100 bg-white text-black p-4 overflow-auto">
        <h1 className="text-2xl font-bold mb-5">Mockup Visualizer</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(['Model', 'Colors', 'Texts', 'Logos'] as const).map((t) => {
            const disabled = t !== 'Model' && !modelLoaded
            return (
              <button
                key={t}
                onClick={() => !disabled && setActiveTab(t)}
                className={`flex-1 text-sm py-2 rounded-full cursor-pointer ${activeTab === t ? 'bg-black text-white' : 'bg-gray-100 text-black border border-gray-500'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {t}
              </button>
            )
          })}
        </div>

        {/* Tab content area */}
        <div className="min-h-[60vh]">
          {activeTab === 'Model' && ModelTab}
          {activeTab === 'Colors' && ColorsTab}
          {activeTab === 'Texts' && TextsTab}
          {activeTab === 'Logos' && LogosTab}
          <div className={`${activeTab === 'Texts' || activeTab === 'Logos' ? 'block' : 'hidden'} mt-4`}>
            <DecalList activeTab={activeTab} clearAllDecals={clearAllDecals} />
          </div>
        </div>


        {/* Bottom buttons */}
        <div className="mt-8 flex flex-col items-center justify-center gap-2">
          <div className='flex items-center justify-center gap-2'>
            <button
              className="bg-indigo-600 text-white px-4 py-2 rounded cursor-pointer inline-flex items-center"
              onClick={() => window.dispatchEvent(new CustomEvent('exportPNG'))}
              disabled={!modelLoaded}
            >
              <FiDownload className="mr-2 text-lg" />
              <span>Export PNG</span>
            </button>

            <button
              className="bg-indigo-600 text-white px-4 py-2 rounded cursor-pointer inline-flex items-center"
              onClick={() => window.dispatchEvent(new CustomEvent('exportGLB'))}
              disabled={!modelLoaded}
            >
              <FiDownload className="mr-2 text-lg" />
              <span>Export GLB</span>
            </button>
          </div>

          <button
            className="bg-red-600 text-white px-4 py-2 rounded cursor-pointer inline-flex items-center"
            onClick={() => {
              if (!window.confirm('Reset everything?')) return

              // Reset: clear decals and reset model transform
              window.dispatchEvent(new CustomEvent('clearDecals'))
              window.dispatchEvent(new CustomEvent('modelCommand', { detail: { action: 'resetTransform' } }))
            }}
            disabled={!modelLoaded}
          >
            <FiTrash className="mr-2 text-lg" />
            <span>Reset</span>
          </button>
        </div>
      </aside>
    </div>
  )
}

// Small helper component for adding text
function AddTextControl({ onAdd }: { onAdd: (t: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div className="flex gap-2">
      <input className="flex-1 p-2 border rounded text-black" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Enter text" />
      <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={() => { if (!val.trim()) return; onAdd(val.trim()); setVal('') }}>Add</button>
    </div>
  )
}
