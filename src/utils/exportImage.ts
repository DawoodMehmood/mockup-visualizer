export function downloadDataUrl(dataUrl: string, filename = 'mockup.png') {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
}
