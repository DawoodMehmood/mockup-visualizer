// src/hooks/useDecals.ts
import { useEffect } from 'react'
import * as THREE from 'three'
import type { AssetRef, DecalRec } from '../components/ModelWithDecals'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'


export function useDecals(params: {
    decals: DecalRec[]
    decalsGroupRef: React.MutableRefObject<THREE.Group | null>
    setDecals: (fn: (prev: DecalRec[]) => DecalRec[]) => void
    setSelectedId: (id: string | null) => void
    makeCanvasForAsset: (asset: AssetRef, opts?: { text?: string; font?: string; color?: string; fontSize?: number }) => HTMLCanvasElement
    createDecalMesh: (
        hitObject: THREE.Object3D,
        point: THREE.Vector3,
        normal: THREE.Vector3,
        canvas: HTMLCanvasElement,
        width: number,
        rotationDeg: number,
        camera?: THREE.Camera
    ) => {
        mesh: THREE.Mesh<DecalGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
        mat: THREE.MeshBasicMaterial;
        tex: THREE.CanvasTexture;
        euler: THREE.Euler;
    }
}) {
    const { decals, decalsGroupRef, setDecals, setSelectedId, makeCanvasForAsset, createDecalMesh } = params

    useEffect(() => {
        const handler = (ev: any) => {
            const { id, action, data } = ev.detail || {}
            if (!id || !action) return
            const recIdx = decals.findIndex(d => d.id === id)
            if (recIdx === -1) return
            const rec = decals[recIdx]

            switch (action) {
                case 'delete': {
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)
                    setDecals(prev => prev.filter(p => p.id !== id))
                    setSelectedId(null)
                    window.dispatchEvent(new CustomEvent('decalRemoved', { detail: { id } }))
                    break
                }
                case 'updateText': {
                    if (rec.meta.type !== 'text') break
                    rec.text = data.text
                    const canvas = makeCanvasForAsset(rec.meta, { text: rec.text, font: rec.font, color: rec.color })
                    const newTex = new THREE.CanvasTexture(canvas)
                        ; (newTex as any).encoding = (THREE as any).sRGBEncoding
                        ; (newTex as any).needsUpdate = true
                        ; (rec.mesh.material as any).map = newTex
                    rec.canvas = canvas
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id, text: rec.text } }))
                    break
                }
                case 'updateFont': {
                    if (rec.meta.type !== 'text') break
                    rec.font = data.font
                    const c2 = makeCanvasForAsset(rec.meta, {
                        text: rec.text,
                        font: rec.font,
                        fontSize: rec.fontSize,   // important: pass current size
                        color: rec.color
                    })
                        ; (rec.mesh.material as any).map = new THREE.CanvasTexture(c2)
                        ; ((rec.mesh.material as any).map as any).needsUpdate = true
                    rec.canvas = c2
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id, font: rec.font } }))
                    break
                }
                case 'updateColor': {
                    rec.color = data.color
                    const c3 = makeCanvasForAsset(rec.meta, { text: rec.text, font: rec.font, color: rec.color })
                        ; (rec.mesh.material as any).map = new THREE.CanvasTexture(c3)
                        ; ((rec.mesh.material as any).map as any).needsUpdate = true
                    rec.canvas = c3
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id, color: rec.color } }))
                    break
                }
                case 'setSize': { // used for logos (size in world units)
                    const newSize = Number(data?.size ?? rec.sizeForDecal ?? 0.5)
                    // recreate decal geometry at saved hit point
                    const hitObj = rec.hitObject ?? rec.mesh // fallback
                    let pos = rec.position ?? rec.mesh.getWorldPosition(new THREE.Vector3())
                    let normal = rec.normal ?? new THREE.Vector3(0, 0, 1)

                    if (rec.localPosition && rec.hitObject) {
                        pos = rec.localPosition.clone().applyMatrix4(rec.hitObject.matrixWorld)
                    }
                    if (rec.localNormal && rec.hitObject) {
                        normal = rec.localNormal.clone().transformDirection(rec.hitObject.matrixWorld).normalize()
                    }

                    // keep same canvas texture (we may need to recreate canvas for text separately)
                    // remove old mesh safely
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)

                    // create new decal geometry with same canvas and rotation
                    const { mesh: newMesh } = createDecalMesh(hitObj as any, pos.clone(), normal.clone(), rec.canvas, newSize, rec.rotDeg ?? 0, undefined, rec.baseLocalRotation)
                    decalsGroupRef.current!.add(newMesh)

                    // update record
                    rec.mesh = newMesh
                    rec.sizeForDecal = newSize
                    setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id, size: newSize } }))
                    break
                }

                case 'setFontSize': { // used for text - newFontPx passed in data.fontSize
                    if (rec.meta.type !== 'text') break
                    const fontPx = Number(data?.fontSize ?? rec.fontSize ?? 48)
                    // recreate the canvas with new font size
                    const newCanvas = makeCanvasForAsset(rec.meta, {
                        text: rec.text ?? '',
                        font: rec.font,       // just the family
                        fontSize: fontPx,     // pass the size separately
                        color: rec.color
                    })
                    // remove old mesh
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)

                    const hitObj2 = rec.hitObject ?? rec.mesh
                    let pos2 = rec.position ?? rec.mesh.getWorldPosition(new THREE.Vector3())
                    let normal2 = rec.normal ?? new THREE.Vector3(0, 0, 1)

                    if (rec.localPosition && rec.hitObject) {
                        pos2 = rec.localPosition.clone().applyMatrix4(rec.hitObject.matrixWorld)
                    }
                    if (rec.localNormal && rec.hitObject) {
                        normal2 = rec.localNormal.clone().transformDirection(rec.hitObject.matrixWorld).normalize()
                    }

                    // create new mesh using same world sizeForDecal and rotation
                    const { mesh: newMesh2 } = createDecalMesh(hitObj2 as any, pos2.clone(), normal2.clone(), newCanvas, rec.sizeForDecal ?? 0.5, rec.rotDeg ?? 0, undefined, rec.baseLocalRotation)
                    decalsGroupRef.current!.add(newMesh2)

                    rec.mesh = newMesh2
                    rec.canvas = newCanvas
                    rec.fontSize = fontPx
                    setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id, fontSize: fontPx } }))
                    break
                }

                case 'setRotation': {
                    const rotationDeg = Number(data?.rotationDeg ?? 0)
                    // recreate geometry rotated in-plane around the normal
                    const hitObjR = rec.hitObject ?? rec.mesh
                    let posR = rec.position ?? rec.mesh.getWorldPosition(new THREE.Vector3())
                    let normalR = rec.normal ?? new THREE.Vector3(0, 0, 1)

                    if (rec.localPosition && rec.hitObject) {
                        posR = rec.localPosition.clone().applyMatrix4(rec.hitObject.matrixWorld)
                    }
                    if (rec.localNormal && rec.hitObject) {
                        normalR = rec.localNormal.clone().transformDirection(rec.hitObject.matrixWorld).normalize()
                    }

                    // remove old
                    rec.mesh.geometry.dispose()
                        ; (rec.mesh.material as any).map?.dispose?.()
                        ; (rec.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(rec.mesh)

                    // create new geometry with rotationDeg applied
                    const { mesh: newMeshR } = createDecalMesh(hitObjR as any, posR.clone(), normalR.clone(), rec.canvas, rec.sizeForDecal ?? 0.5, rotationDeg, undefined, rec.baseLocalRotation)
                    decalsGroupRef.current!.add(newMeshR)

                    rec.mesh = newMeshR
                    rec.rotDeg = rotationDeg
                    setDecals(prev => prev.map(p => p.id === rec.id ? rec : p))
                    window.dispatchEvent(new CustomEvent('decalUpdated', { detail: { id: rec.id, rotationDeg } }))
                    break
                }


                default:
                    break
            }
        }
        window.addEventListener('decalCommand', handler)
        return () => window.removeEventListener('decalCommand', handler)
    }, [decals])
}
