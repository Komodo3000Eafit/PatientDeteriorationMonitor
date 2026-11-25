// Saves CSV text as a file through a temporary object URL and a hidden download link (US-10).
// Separate module so tests can replace it: jsdom does not download files.

export function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  try {
    a.href = url
    a.download = filename
    a.hidden = true
    document.body.appendChild(a)
    a.click()
  } finally {
    a.remove()
    URL.revokeObjectURL(url)
  }
}
