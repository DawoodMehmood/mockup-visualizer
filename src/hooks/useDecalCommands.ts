// src/hooks/useDecalCommands.ts
import { useEffect } from 'react'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { DecalRec } from '../components/ModelWithDecals'

export function useDecalCommands(params: {
    gl: any
    scene: THREE.Scene
    camera: THREE.Camera
    decals: DecalRec[]
    decalsGroupRef: React.MutableRefObject<THREE.Group | null>
    setDecals: (fn: (prev: DecalRec[]) => DecalRec[]) => void
    bgColor: string
}) {
    const { gl, scene, camera, decals, decalsGroupRef, setDecals, bgColor } = params

    useEffect(() => {
        const handler = (e: any) => {
            if (e.type === 'exportPNG') {
                if (!gl || !scene || !camera) return
                const prevSize = gl.getSize(new THREE.Vector2())
                const prevPixelRatio = gl.getPixelRatio()
                const prevBackground = scene.background ? scene.background.clone() : null

                try {
                    const dpr = Math.min(window.devicePixelRatio || 1, 2)
                    const isPersp = (camera as any).isPerspectiveCamera
                    const aspect = isPersp ? (camera as THREE.PerspectiveCamera).aspect : (prevSize.x && prevSize.y ? prevSize.x / prevSize.y : window.innerWidth / window.innerHeight)
                    const h = Math.floor(window.innerHeight * dpr)
                    const w = Math.floor(h * aspect)
                    gl.setPixelRatio(dpr)
                    gl.setSize(w, h, false)
                    scene.background = null
                    gl.render(scene, camera)
                    const url = gl.domElement.toDataURL('image/png')
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'mockup.png'
                    a.click()
                    a.remove()
                } finally {
                    gl.setSize(prevSize.x, prevSize.y, false)
                    gl.setPixelRatio(prevPixelRatio)
                    if (prevBackground) scene.background = prevBackground
                    else scene.background = new THREE.Color(bgColor)
                }
            } else if (e.type === 'exportGLB') {
                const exporter = new GLTFExporter()
                const exportScene = scene.clone(true)

                exporter.parse(
                    exportScene,
                    (result) => {
                        let blob: Blob
                        if (result instanceof ArrayBuffer) blob = new Blob([result], { type: 'application/octet-stream' })
                        else {
                            const output = JSON.stringify(result, null, 2)
                            blob = new Blob([output], { type: 'application/json' })
                        }
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = 'mockup.glb'
                        a.click()
                        URL.revokeObjectURL(url)
                    },
                    { binary: true } as any
                )
            } else if (e.type === 'clearDecals') {
                decals.forEach(d => {
                    d.mesh.geometry.dispose()
                        ; (d.mesh.material as any).map?.dispose?.()
                        ; (d.mesh.material as any).dispose?.()
                    decalsGroupRef.current?.remove(d.mesh)
                })
                setDecals(() => [])
                window.dispatchEvent(new CustomEvent('decalRemoved', { detail: { id: null } }))
            }
        }
        window.addEventListener('exportPNG', handler)
        window.addEventListener('exportGLB', handler)
        window.addEventListener('clearDecals', handler)
        return () => {
            window.removeEventListener('exportPNG', handler)
            window.removeEventListener('exportGLB', handler)
            window.removeEventListener('clearDecals', handler)
        }
    }, [gl, scene, camera, decals, decalsGroupRef, setDecals, bgColor])
}
