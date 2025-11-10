import React, { useRef, useState } from 'react'
import { FiZoomIn, FiZoomOut, FiRotateCcw, FiRotateCw } from 'react-icons/fi'

export default function Toolbar({
    glbUrl,
    onLoadGLB,
    onRemoveGLB,
    logos,
    onAddLogo,
    onRemoveLogo,
    texts,
    onAddText,
    onRemoveText,
    assetSelection,
    onSelectAsset,
}) {
    const glbRef = useRef(null)
    const logoRef = useRef(null)
    const [newText, setNewText] = useState('')

    return (
        <div>
            <div className="mb-4">
                <label className="block mb-2">Upload GLB</label>
                <div className="flex">
                    <input
                        ref={glbRef}
                        type="file"
                        accept=".glb,.gltf"
                        onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            const url = URL.createObjectURL(f)
                            onLoadGLB(url)
                        }}
                        className="text-black"
                    />
                    {glbUrl && (
                        <button
                            className="ml-2 bg-red-600 px-3 rounded"
                            onClick={onRemoveGLB}
                        >
                            🗑
                        </button>
                    )}
                </div>
            </div>

            <div className="mb-4">
                <label className="block mb-2">Upload Logos (PNG/JPG)</label>
                <input
                    ref={logoRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        onAddLogo(f)
                        if (logoRef.current) logoRef.current.value = ''
                    }}
                    className="text-black"
                />

                <div className="mt-2 space-y-2">
                    {logos.map((f, i) => (
                        <div
                            key={i}
                            className={`flex items-center justify-between p-2 rounded ${assetSelection?.type === 'logo' && assetSelection.index === i
                                ? 'bg-blue-800'
                                : 'bg-gray-800'
                                }`}
                        >
                            <div className="flex items-center space-x-2">
                                <img
                                    src={URL.createObjectURL(f)}
                                    alt={f.name}
                                    className="w-10 h-10 object-contain bg-white/5 rounded"
                                />
                                <div className="text-xs">{f.name}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    className="text-xs px-2 py-1 bg-green-600 rounded"
                                    onClick={() => onSelectAsset({ type: 'logo', index: i })}
                                >
                                    Select
                                </button>
                                <button
                                    className="text-xs px-2 py-1 bg-red-600 rounded"
                                    onClick={() => onRemoveLogo(i)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mb-4">
                <label className="block mb-2">Add Text</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        placeholder="Enter text"
                        className="p-2 text-black flex-1"
                    />
                    <button
                        className="bg-blue-600 px-3 rounded"
                        onClick={() => {
                            if (!newText.trim()) return
                            onAddText(newText.trim())
                            setNewText('')
                        }}
                    >
                        Add
                    </button>
                </div>

                <div className="mt-2 space-y-2">
                    {texts.map((t, i) => (
                        <div
                            key={i}
                            className={`flex items-center justify-between p-2 rounded ${assetSelection?.type === 'text' && assetSelection.index === i
                                ? 'bg-blue-800'
                                : 'bg-gray-800'
                                }`}
                        >
                            <div className="text-sm">{t}</div>
                            <div className="flex items-center gap-2">
                                <button
                                    className="text-xs px-2 py-1 bg-green-600 rounded"
                                    onClick={() => onSelectAsset({ type: 'text', index: i })}
                                >
                                    Select
                                </button>
                                <button
                                    className="text-xs px-2 py-1 bg-red-600 rounded"
                                    onClick={() => onRemoveText(i)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-6">
                <button
                    className="bg-indigo-600 px-3 py-2 rounded mr-2"
                    onClick={() => window.dispatchEvent(new CustomEvent('exportPNG'))}
                >
                    Export PNG
                </button>
                <button
                    className="bg-gray-700 px-3 py-2 rounded"
                    onClick={() => window.dispatchEvent(new CustomEvent('clearDecals'))}
                >
                    Clear Decals
                </button>
            </div>

            <div className="mt-4">
                <h4 className="text-xs text-gray-300 mb-2">Model Controls</h4>

                <div className="flex gap-2">
                    <button
                        title="Zoom In"
                        className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700"
                        onClick={() => window.dispatchEvent(new CustomEvent('modelCommand', { detail: { action: 'zoom', delta: 1.12 } }))}
                    >
                        <img src='/zoom-in.svg' width={25} />

                    </button>

                    <button
                        title="Zoom Out"
                        className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700"
                        onClick={() => window.dispatchEvent(new CustomEvent('modelCommand', { detail: { action: 'zoom', delta: 1 / 1.12 } }))}
                    >
                        <img src='/zoom-out.svg' width={25} />

                    </button>

                    <button
                        title="Rotate Clockwise"
                        className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700"
                        onClick={() => window.dispatchEvent(new CustomEvent('modelCommand', { detail: { action: 'rotate', axis: 'y', deg: -15 } }))}
                    >
                        <img src='/left.svg' width={25} />

                    </button>

                    <button
                        title="Rotate Anti-clockwise"
                        className="flex items-center gap-1 px-3 py-2 bg-gray-800 rounded hover:bg-gray-700"
                        onClick={() => window.dispatchEvent(new CustomEvent('modelCommand', { detail: { action: 'rotate', axis: 'y', deg: 15 } }))}
                    >
                        <img src='/right.svg' width={25} />
                    </button>
                </div>
            </div>
        </div>
    )
}