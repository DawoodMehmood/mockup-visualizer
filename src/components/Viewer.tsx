import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Html } from '@react-three/drei'
import ModelWithDecals from './ModelWithDecals'

export default function Viewer({ glbUrl, logos, texts, assetSelection }) {
    return (
        <Canvas shadows camera={{ position: [0, 1.5, 3], fov: 50 }}>
            <ambientLight intensity={0.6} />
            <directionalLight intensity={0.8} position={[5, 10, 7]} />
            <Suspense fallback={<Html center>Loading model…</Html>}>
                {glbUrl && (
                    <ModelWithDecals
                        glbUrl={glbUrl}
                        logos={logos}
                        texts={texts}
                        assetSelection={assetSelection}
                    />
                )}
                <Environment preset="studio" />
            </Suspense>

            <OrbitControls
                enablePan={false}
                enableZoom={true}
                enableRotate={true}

                // ---- horizontal (azimuth) ----
                // full 360° rotation
                minAzimuthAngle={-Infinity}
                maxAzimuthAngle={Infinity}

                // ---- vertical (polar) ----
                // only a few degrees up/down from the horizon
                minPolarAngle={Math.PI / 2 - (15 * Math.PI / 180)} // 15° below horizon
                maxPolarAngle={Math.PI / 2 + (15 * Math.PI / 180)} // 15° above horizon

                enableDamping
                dampingFactor={0.1}
            />
        </Canvas>
    )
}