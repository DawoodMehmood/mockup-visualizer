// src/components/DecalList.tsx
import React, { useEffect, useState } from 'react'
import { FiTrash } from 'react-icons/fi'

type DecalItem = {
    id: string
    thumb?: string
    meta: { type: 'logo' | 'text'; assetIndex?: number }
    text?: string
    font?: string
    color?: string
    // logo size in world-units (width)
    size?: number
    // text font size in px
    fontSize?: number
    rotationDeg?: number
}

const FONT_OPTIONS = ['sans-serif', 'serif', 'monospace', 'cursive', 'Helvetica', 'Arial']

export default function DecalList({ activeTab, clearAllDecals }: { activeTab: string, clearAllDecals: Boolean }) {
    const [decals, setDecals] = useState<DecalItem[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)

    useEffect(() => {
        const placed = (e: any) => {
            const d = e.detail
            // initialize with sensible defaults (size/fontSize/rotation)
            const init: DecalItem = {
                size: d.size ?? 0.5,
                fontSize: d.fontSize ?? 48,
                rotationDeg: d.rotationDeg ?? 0,
                ...d,
            }
            setDecals((s) => [init, ...s])
            setSelectedId(d.id)
        }
        const removed = (e: any) => {
            const id = e.detail?.id
            setDecals((s) => s.filter((x) => x.id !== id))
            if (selectedId === id) setSelectedId(null)
        }
        const updated = (e: any) => {
            const payload = e.detail
            setDecals((s) => s.map((d) => (d.id === payload.id ? { ...d, ...payload } : d)))
        }
        window.addEventListener('decalPlaced', placed)
        window.addEventListener('decalRemoved', removed)
        window.addEventListener('decalUpdated', updated)
        return () => {
            window.removeEventListener('decalPlaced', placed)
            window.removeEventListener('decalRemoved', removed)
            window.removeEventListener('decalUpdated', updated)
        }
    }, [selectedId])

    useEffect(() => {
        if (clearAllDecals) {
            setDecals([])
            setSelectedId(null)
        }
    }, [clearAllDecals])


    const select = (id: string) => {
        setSelectedId(id)
        window.dispatchEvent(new CustomEvent('selectDecalById', { detail: { id } }))
    }

    const doCommand = (id: string, action: string, data?: any) => {
        window.dispatchEvent(new CustomEvent('decalCommand', { detail: { id, action, data } }))
    }

    // only show this panel when in Texts or Logos tab
    if (activeTab !== 'Texts' && activeTab !== 'Logos') return null

    // filter decals for selected tab: 'Texts' -> 'text', 'Logos' -> 'logo'
    const wantedType = activeTab === 'Texts' ? 'text' : 'logo'
    const filteredDecals = decals.filter((d) => d.meta.type === wantedType)

    return (
        <div className="mt-4">
            {filteredDecals.length === 0 && <div>Nothing placed yet</div>}
            <div className="space-y-2 max-h-screen overflow-auto">
                {filteredDecals.map((d) => (
                    <div key={d.id} className="p-2 rounded flex gap-2 items-start bg-gray-50">
                        {d.meta.type !== 'text' ? (
                            <img src={d.thumb ?? ''} alt="" className="w-12 h-12 object-contain bg-white/5 rounded" />
                        ) : (
                            <div className="px-2 border">T</div>
                        )}

                        <div className="flex-1">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-medium">{d.meta.type === 'text' ? `Text` : 'Logo'}</div>
                                <div className="flex gap-2">
                                    <button className="px-2 py-1 rounded bg-gray-200 text-xs" onClick={() => select(d.id)}>Select</button>
                                    <button className="px-2 py-1 rounded text-xs" onClick={() => doCommand(d.id, 'delete')}><FiTrash size={16} color="red" /></button>
                                </div>
                            </div>

                            {/* Text editing */}
                            {d.meta.type === 'text' && (
                                <div className="mt-2 space-y-1">
                                    <input
                                        className="w-full text-black p-1 text-xs rounded"
                                        value={d.text ?? ''}
                                        onChange={(e) => {
                                            const text = e.target.value
                                            setDecals((s) => s.map(item => item.id === d.id ? { ...item, text } : item))
                                            doCommand(d.id, 'updateText', { text })
                                        }}
                                    />
                                    <div className="flex items-center gap-2">
                                        <select
                                            className="text-xs p-1 rounded text-black"
                                            value={d.font ?? FONT_OPTIONS[0]}
                                            onChange={(e) => {
                                                const font = e.target.value
                                                setDecals((s) => s.map(item => item.id === d.id ? { ...item, font } : item))
                                                doCommand(d.id, 'updateFont', { font })
                                            }}
                                        >
                                            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                        <input
                                            className="w-10 h-8 p-0 border rounded"
                                            type="color"
                                            value={d.color ?? '#000000'}
                                            onChange={(e) => {
                                                const color = e.target.value
                                                setDecals((s) => s.map(item => item.id === d.id ? { ...item, color } : item))
                                                doCommand(d.id, 'updateColor', { color })
                                            }}
                                        />
                                    </div>

                                    {/* Font size control (px) */}
                                    <div className="mt-2">
                                        <div className="text-xs text-gray-600">Font size (px)</div>
                                        <input
                                            type="range"
                                            min={8}
                                            max={200}
                                            step={1}
                                            value={d.fontSize ?? 48}
                                            onChange={(e) => {
                                                const fontSize = Number(e.target.value)
                                                setDecals((s) => s.map(item => item.id === d.id ? { ...item, fontSize } : item))
                                                doCommand(d.id, 'setFontSize', { fontSize })
                                            }}
                                        />
                                        <div className="text-xs text-gray-500">{(d.fontSize ?? 48).toFixed(0)} px</div>
                                    </div>
                                </div>
                            )}

                            {/* Logo editing (color + size) */}
                            {d.meta.type === 'logo' && (
                                <div className="mt-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="text-xs text-gray-500">Color:</div>
                                        <input
                                            type="color"
                                            className="w-10 h-8 p-0 border rounded"
                                            value={d.color ?? '#ffffff'}
                                            onChange={(e) => {
                                                const color = e.target.value
                                                setDecals((s) => s.map(item => item.id === d.id ? { ...item, color } : item))
                                                doCommand(d.id, 'updateColor', { color })
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <div className="text-xs text-gray-600">Size (world units)</div>
                                        <input
                                            type="range"
                                            min={0.01}
                                            max={2}
                                            step={0.01}
                                            value={d.size ?? 0.5}
                                            onChange={(e) => {
                                                const size = Number(e.target.value)
                                                setDecals((s) => s.map(item => item.id === d.id ? { ...item, size } : item))
                                                doCommand(d.id, 'setSize', { size })
                                            }}
                                        />
                                        <div className="text-xs text-gray-500">{(d.size ?? 0.5).toFixed(2)} u</div>
                                    </div>
                                </div>
                            )}

                            {/* Rotation control (common for both) */}
                            <div className="mt-3">
                                <div className="text-xs text-gray-600">Rotation (deg)</div>
                                <input
                                    type="range"
                                    min={-180}
                                    max={180}
                                    step={1}
                                    value={d.rotationDeg ?? 0}
                                    onChange={(e) => {
                                        const rotationDeg = Number(e.target.value)
                                        setDecals((s) => s.map(item => item.id === d.id ? { ...item, rotationDeg } : item))
                                        doCommand(d.id, 'setRotation', { rotationDeg })
                                    }}
                                />
                                <div className="text-xs text-gray-500">{(d.rotationDeg ?? 0).toFixed(0)}°</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
