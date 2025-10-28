import React, { useRef, useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Html } from '@react-three/drei'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'

export default function ModelWithDecals({ glbUrl, logos, texts, assetSelection }) {
    const groupRef = useRef(null)
    const { camera, gl, scene } = useThree()
    const [decals, setDecals] = useState([])
    const [selectedId, setSelectedId] = useState(null)
    const raycaster = useMemo(() => new THREE.Raycaster(), [])
    const logoImgsRef = useRef([])
    const textCacheRef = useRef(new Map())

    const gltf = useGLTF(glbUrl)

    // Load logo images
    useEffect(() => {
        logoImgsRef.current = logos.map((f) => {
            const img = new Image()
            img.src = URL.createObjectURL(f)
            img.crossOrigin = 'anonymous'
            return img
        })
    }, [logos])

    // Create texture canvas
    const makeTextureCanvas = (asset) => {
        const SIZE = 512
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, SIZE, SIZE)

        if (asset.type === 'text') {
            const t = texts[asset.index] || 'Text'
            ctx.fillStyle = 'white'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const fontSize = Math.max(32, Math.min(96, Math.floor(280 / Math.max(1, t.length))))
            ctx.font = `bold ${fontSize}px sans-serif`
            ctx.fillText(t, SIZE / 2, SIZE / 2)
        } else {
            const img = logoImgsRef.current[asset.index]
            if (img && img.complete && img.naturalWidth) {
                const scale = Math.min(SIZE / img.width, SIZE / img.height) * 0.9
                const w = img.width * scale
                const h = img.height * scale
                ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
            } else {
                ctx.fillStyle = '#ccc'
                ctx.fillRect(SIZE * 0.25, SIZE * 0.25, SIZE * 0.5, SIZE * 0.5)
            }
        }
        return canvas
    }

    // Place decal on click
    const onPointerDown = (e) => {
        e.stopPropagation()
        if (!groupRef.current || !assetSelection || !gltf?.scene) return

        const rect = gl.domElement.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

        const intersects = raycaster.intersectObjects(groupRef.current.children, true)
        if (!intersects.length) return

        const hit = intersects[0]
        const point = hit.point.clone()
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()

        const up = new THREE.Vector3(0, 0, 1)
        const quat = new THREE.Quaternion().setFromUnitVectors(up, normal)
        const euler = new THREE.Euler().setFromQuaternion(quat)

        const size = 0.5
        const canvas = makeTextureCanvas(assetSelection)
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace

        const decalGeo = new DecalGeometry(hit.object, point, euler, new THREE.Vector3(size, size, 0.1))
        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            alphaTest: 0.01,
        })

        const mesh = new THREE.Mesh(decalGeo, mat)
        mesh.userData.selectable = true
        mesh.renderOrder = 999
        groupRef.current.add(mesh)

        const id = THREE.MathUtils.generateUUID()
        setDecals((d) => [...d, { id, mesh, size, canvas, meta: assetSelection }])
        setSelectedId(id)
    }

    // Fit model
    useEffect(() => {
        if (!gltf?.scene || !groupRef.current) return

        groupRef.current.clear()
        const model = gltf.scene.clone()
        groupRef.current.add(model)

        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        model.position.sub(center)

        const maxDim = Math.max(size.x, size.y, size.z)
        const fov = camera.fov * (Math.PI / 180)
        const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.3
        camera.position.set(0, distance * 0.7, distance)
        camera.lookAt(0, 0, 0)
        camera.updateProjectionMatrix()
    }, [gltf, camera])

    // Click to select decal
    useEffect(() => {
        const handleClick = (e) => {
            if (!groupRef.current) return
            const rect = gl.domElement.getBoundingClientRect()
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

            const hits = raycaster.intersectObjects(groupRef.current.children, true)
            const hit = hits.find((h) => h.object.userData.selectable)
            if (!hit) {
                setSelectedId(null)
                return
            }

            const decal = decals.find((d) => d.mesh === hit.object)
            if (decal) {
                setSelectedId(decal.id)
                window.dispatchEvent(new CustomEvent('decalSelected', { detail: decal.id }))
            }
        }
        window.addEventListener('click', handleClick)
        return () => window.removeEventListener('click', handleClick)
    }, [decals, camera, gl, raycaster])

    // Export & Clear
    useEffect(() => {
        const handler = (e) => {
            if (e.type === 'exportPNG') {
                const prev = gl.getSize(new THREE.Vector2())
                const dpr = Math.min(window.devicePixelRatio, 2)
                const w = Math.floor(window.innerWidth * dpr)
                const h = Math.floor(window.innerHeight * dpr)
                gl.setSize(w, h)
                gl.render(scene, camera)
                const url = gl.domElement.toDataURL('image/png')
                gl.setSize(prev.x, prev.y)

                const a = document.createElement('a')
                a.href = url
                a.download = 'mockup.png'
                a.click()
                a.remove()
            } else if (e.type === 'clearDecals') {
                decals.forEach((d) => {
                    d.mesh.geometry.dispose()
                    d.mesh.material.map?.dispose()
                    d.mesh.material.dispose()
                    groupRef.current?.remove(d.mesh)
                })
                setDecals([])
                setSelectedId(null)
            }
        }
        window.addEventListener('exportPNG', handler)
        window.addEventListener('clearDecals', handler)
        return () => {
            window.removeEventListener('exportPNG', handler)
            window.removeEventListener('clearDecals', handler)
        }
    }, [decals, gl, scene, camera])

    // Manipulate selected
    const deleteSelected = () => {
        const rec = decals.find((d) => d.id === selectedId)
        if (!rec) return
        rec.mesh.geometry.dispose()
        rec.mesh.material.map?.dispose()
        rec.mesh.material.dispose()
        groupRef.current?.remove(rec.mesh)
        setDecals((d) => d.filter((x) => x.id !== selectedId))
        setSelectedId(null)
    }

    const rotateSelected = (deg) => {
        const rec = decals.find((d) => d.id === selectedId)
        if (rec) rec.mesh.rotateZ((deg * Math.PI) / 180)
    }

    const scaleSelected = (factor) => {
        const rec = decals.find((d) => d.id === selectedId)
        if (rec) rec.mesh.scale.multiplyScalar(factor)
    }

    // UI position
    const [uiPos, setUiPos] = useState(null)
    useFrame(() => {
        if (!selectedId) return setUiPos(null)
        const rec = decals.find((d) => d.id === selectedId)
        if (!rec) return setUiPos(null)
        const pos = new THREE.Vector3()
        rec.mesh.getWorldPosition(pos)
        setUiPos(pos)
    })

    return (
        <group ref={groupRef} onPointerDown={onPointerDown}>
            {gltf && <primitive object={gltf.scene} />}

            {decals.map((d) => (
                <primitive key={d.id} object={d.mesh} />
            ))}

            {selectedId && uiPos && (
                <Html position={uiPos} center>
                    <div
                        style={{
                            transform: 'translateY(-140%)',
                            pointerEvents: 'auto',
                        }}
                        className="bg-white/95 rounded shadow-lg p-1 flex gap-1"
                    >
                        <button
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded"
                            onClick={deleteSelected}
                        >
                            Delete
                        </button>
                        <button
                            className="text-xs bg-gray-700 text-white px-2 py-1 rounded"
                            onClick={() => rotateSelected(-15)}
                        >
                            Rotate Left
                        </button>
                        <button
                            className="text-xs bg-gray-700 text-white px-2 py-1 rounded"
                            onClick={() => rotateSelected(15)}
                        >
                            Rotate Right
                        </button>
                        <button
                            className="text-xs bg-gray-700 text-white px-2 py-1 rounded"
                            onClick={() => scaleSelected(1.1)}
                        >
                            +
                        </button>
                        <button
                            className="text-xs bg-gray-700 text-white px-2 py-1 rounded"
                            onClick={() => scaleSelected(0.9)}
                        >
                            −
                        </button>
                    </div>
                </Html>
            )}
        </group>
    )
}