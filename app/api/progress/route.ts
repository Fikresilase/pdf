import { NextRequest, NextResponse } from 'next/server'

// In-memory progress store (in production, use Redis or similar)
const progressStore = new Map<string, {
  totalPages: number
  processedPages: number
  currentChunk: number
  totalChunks: number
  status: string
  logs: string[]
}>()

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const fileId = searchParams.get('fileId')

  if (!fileId) {
    return NextResponse.json({ error: 'fileId required' }, { status: 400 })
  }

  const progress = progressStore.get(fileId)
  if (!progress) {
    return NextResponse.json({ error: 'Progress not found' }, { status: 404 })
  }

  return NextResponse.json(progress)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileId, update } = body
    
    if (!fileId || !update) {
      return NextResponse.json({ error: 'fileId and update required' }, { status: 400 })
    }

  const existing = progressStore.get(fileId) || {
    totalPages: 0,
    processedPages: 0,
    currentChunk: 0,
    totalChunks: 0,
    status: 'starting',
    logs: [],
  }

  const updated = {
    ...existing,
    ...update,
    logs: [...(existing.logs || []), update.log || ''].filter(Boolean).slice(-50), // Keep last 50 logs
  }

  progressStore.set(fileId, updated)

  // Clean up old progress after 1 hour
  setTimeout(() => {
    progressStore.delete(fileId)
  }, 3600000)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

