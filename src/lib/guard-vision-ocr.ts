/**
 * Camada C — OCR via Google Cloud Vision (REST). Requer GOOGLE_VISION_API_KEY.
 */
export async function visionOcrFromBase64Png(base64: string): Promise<string> {
  const key = process.env.GOOGLE_VISION_API_KEY?.trim()
  if (!key) return ''

  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64 },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['pt', 'en'] },
        },
      ],
    }),
  })

  if (!res.ok) {
    return ''
  }

  const data = (await res.json()) as {
    responses?: Array<{ fullTextAnnotation?: { text?: string }; textAnnotations?: Array<{ description?: string }> }>
  }
  const text =
    data.responses?.[0]?.fullTextAnnotation?.text ||
    data.responses?.[0]?.textAnnotations?.[0]?.description ||
    ''
  return String(text).trim()
}
