import * as THREE from 'three'

// Result type
export type MaterialGroup = {
    id: string
    name: string
    material: THREE.Material & { color?: THREE.Color | undefined }
    meshes: THREE.Mesh[]
    sampleColor?: string // hex color string like '#rrggbb'
}

/**
 * Collect unique materials used in a root object and group meshes by material.
 */
export function collectMaterials(root: THREE.Object3D): MaterialGroup[] {
    const map = new Map<THREE.Material, MaterialGroup>()
    root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh
            // choose first material if array
            const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material
            if (!mat) return
            if (!map.has(mat)) {
                const name = (mat as any).name || (mat as any).uuid || 'material'
                map.set(mat, {
                    id: (mat as any).uuid ?? THREE.MathUtils.generateUUID(),
                    name,
                    material: mat as any,
                    meshes: [],
                    sampleColor: undefined,
                })
            }
            map.get(mat)!.meshes.push(mesh)
        }
    })
    return Array.from(map.values())
}

/**
 * Sample a representative color for a material.
 * If material has color property (no texture), use that.
 * If it has a map (texture), draw the texture to small canvas and compute average color.
 */
export async function sampleMaterialColor(mat: THREE.Material & { color?: THREE.Color | undefined }): Promise<string> {
    // prefer plain color
    if ((mat as any).color && (mat as any).color.isColor) {
        return `#${(mat as any).color.getHexString()}`
    }

    const map = (mat as any).map as THREE.Texture | undefined
    if (!map || !map.image) {
        return '#888888'
    }

    // try to sample average color from texture image
    try {
        const img = map.image as HTMLImageElement | HTMLCanvasElement
        const w = Math.min(64, (img as any).width || 64)
        const h = Math.min(64, (img as any).height || 64)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img as any, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h).data
        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3]
            if (alpha < 8) continue
            r += data[i]; g += data[i + 1]; b += data[i + 2]; count++
        }
        if (count === 0) return '#888888'
        r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count)
        const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
        return hex
    } catch (e) {
        return '#888888'
    }
}
