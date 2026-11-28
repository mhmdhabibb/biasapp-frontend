import { downloadFile, http, uploadFile } from '@/services/api'

const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)$/i

export const MAX_SURVEY_FILE_BYTES = 15 * 1024 * 1024 // 15MB

export function isImageFile(file: File): boolean {
  if (file.type && file.type.toLowerCase().startsWith('image/')) {
    return true
  }
  return IMAGE_EXT_REGEX.test(file.name || '')
}

export function formatFileSize(bytes?: number | null): string {
  const n = Number(bytes || 0)
  if (!n || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function compressSurveyImage(file: File, maxDim = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Gagal membaca file gambar ${file.name}`))
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = () => reject(new Error(`File ${file.name} bukan gambar yang valid`))
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width))
          width = maxDim
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height))
          height = maxDim
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context tidak tersedia'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function normalizeSurveyPhotos(survey: any): string[] {
  if (!survey) return []
  const out: string[] = []
  if (Array.isArray(survey.photo_locations)) {
    for (const p of survey.photo_locations) {
      if (typeof p === 'string' && p.trim() && p !== 'has_photo') {
        out.push(p)
      }
    }
  }
  if (out.length === 0 && typeof survey.photo_location === 'string') {
    const single = survey.photo_location.trim()
    if (single && single !== 'has_photo') {
      out.push(single)
    }
  }
  return out
}

export async function uploadSurveyAttachments(surveyId: string, files: File[]) {
  if (!files.length) return []
  const fd = new FormData()
  for (const f of files) {
    fd.append('files', f)
  }
  const res: any = await uploadFile(`/surveys/${surveyId}/attachments`, fd)
  return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
}

export function downloadSurveyAttachment(surveyId: string, att: { id: string; file_name: string }) {
  return downloadFile(`/surveys/${surveyId}/attachments/${att.id}/download`, att.file_name || 'lampiran-survey')
}

export async function fetchSurveyAttachmentBlobUrl(
  surveyId: string,
  att: { id: string; mime_type?: string },
): Promise<{ url: string; mimeType: string }> {
  const response = await http.get(`/surveys/${surveyId}/attachments/${att.id}/download`, {
    responseType: 'blob',
  })
  const mimeType =
    att.mime_type || response.headers?.['content-type'] || 'application/octet-stream'
  const blob = new Blob([response.data], { type: mimeType })
  return { url: URL.createObjectURL(blob), mimeType }
}
