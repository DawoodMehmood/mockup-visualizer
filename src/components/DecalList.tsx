// src/components/DecalList.tsx
import React, { useEffect, useState } from 'react'
import { FiDelete, FiTrash } from 'react-icons/fi'

type DecalItem = {
    id: string
    thumb?: string // dataURL from canvas
    meta: { type: 'logo' | 'text'; assetIndex?: number }
    text?: string
    font?: string
    color?: string
}

const FONT_OPTIONS = ['sans-serif', 'serif', 'monospace', 'cursive', 'Helvetica', 'Arial']

export default function DecalList() {
    const [decals, setDecals] = useState<DecalItem[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)

    useEffect(() => {
        const placed = (e: any) => {
            const d = e.detail
            // d should include id, thumb, meta, text, font, color
            setDecals((s) => [d, ...s])
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

    const select = (id: string) => {
        setSelectedId(id)
        window.dispatchEvent(new CustomEvent('selectDecalById', { detail: { id } }))
    }

    const doCommand = (id: string, action: string, data?: any) => {
        window.dispatchEvent(new CustomEvent('decalCommand', { detail: { id, action, data } }))
    }

    return (
        <div className="mt-4">
            {decals.length === 0 && <div>Nothing placed yet</div>}
            <div className="space-y-2 max-h-screen overflow-auto">
                {decals.map((d) => (
                    <div key={d.id} className={`p-2 rounded flex gap-2 items-start`}>
                        {d.meta.type != 'text' ?
                            <img src={d.thumb ?? ''} alt="" className="w-12 h-12 object-contain bg-white/5 rounded" /> :
                            <div className='px-2 border'>T</div>
                        }
                        <div className="flex-1">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-medium">{d.meta.type === 'text' ? `Text` : 'Logo'}</div>
                                <div className="flex gap-2">
                                    {/* <button className="px-2 py-1 rounded bg-gray-700 text-xs" onClick={() => select(d.id)}>Select</button> */}
                                    <button className="px-2 py-1 rounded text-xs" onClick={() => doCommand(d.id, 'delete')}><FiTrash strokeWidth={2} size={15} color='red' /></button>
                                </div>
                            </div>

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
                                            value={d.color ?? '#ffffff'}
                                            onChange={(e) => {
                                                const color = e.target.value
                                                setDecals((s) => s.map(item => item.id === d.id ? { ...item, color } : item))
                                                doCommand(d.id, 'updateColor', { color })
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {d.meta.type === 'logo' && (
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="text-xs text-gray-300">Color:</div>
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
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
