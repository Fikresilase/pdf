'use client'

import { useState, useRef } from 'react'

interface FileWithStatus {
  file: File
  status: 'pending' | 'processing' | 'completed' | 'error'
  downloadUrl?: string
  error?: string
  progressMessage?: string
  fileId?: string
  progressDetails?: {
    totalPages: number
    processedPages: number
    currentChunk: number
    totalChunks: number
    status: string
    logs: string[]
  }
}

export default function Home() {
  const [files, setFiles] = useState<FileWithStatus[]>([])
  const [batchSize, setBatchSize] = useState(10)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const pdfFiles = Array.from(selectedFiles).filter(
      (file) => file.type === 'application/pdf'
    )

    if (pdfFiles.length === 0) {
      setError('Please select PDF files only')
      return
    }

    const newFiles: FileWithStatus[] = pdfFiles.map((file) => ({
      file,
      status: 'pending' as const,
    }))

    setFiles((prev) => [...prev, ...newFiles])
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('dragover')
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('dragover')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('dragover')
  }

  const processFiles = async () => {
    if (files.length === 0) {
      setError('Please select files first')
      return
    }

    setIsProcessing(true)
    setProgress(0)
    setError(null)
    setSuccess(null)

    const pendingFiles = files.filter((f) => f.status === 'pending')
    const totalFiles = pendingFiles.length
    let processedCount = 0

    // Process in batches
    for (let i = 0; i < pendingFiles.length; i += batchSize) {
      const batch = pendingFiles.slice(i, i + batchSize)

      // Update status to processing
      setFiles((prev) =>
        prev.map((f) =>
          batch.some((bf) => bf.file === f.file)
            ? { ...f, status: 'processing' }
            : f
        )
      )

      // Process each file in the batch
      const promises = batch.map(async (fileWithStatus) => {
        const fileId = `${Date.now()}_${Math.random().toString(36).substring(7)}`
        let progressInterval: NodeJS.Timeout | null = null
        
        try {
          setCurrentProcessingFile(fileWithStatus.file.name)
          console.log(`[UI] Starting processing: ${fileWithStatus.file.name}`)
          
          // Set initial fileId
          setFiles((prev) =>
            prev.map((f) =>
              f.file === fileWithStatus.file
                ? { ...f, status: 'processing', fileId, progressMessage: 'Initializing...' }
                : f
            )
          )

          // Start polling for progress - more frequent for real-time updates
          progressInterval = setInterval(async () => {
            try {
              const progressResponse = await fetch(`/api/progress?fileId=${fileId}`)
              if (progressResponse.ok) {
                const progress = await progressResponse.json()
                setFiles((prev) =>
                  prev.map((f) =>
                    f.file === fileWithStatus.file
                      ? {
                          ...f,
                          progressMessage: progress.status || f.progressMessage,
                          progressDetails: progress,
                        }
                      : f
                  )
                )
              }
            } catch (error) {
              // Silently fail - progress polling is not critical
            }
          }, 200) // Poll every 200ms for real-time updates
          
          const formData = new FormData()
          formData.append('file', fileWithStatus.file)
          formData.append('fileId', fileId) // Pass fileId to backend

          setFiles((prev) =>
            prev.map((f) =>
              f.file === fileWithStatus.file
                ? { ...f, status: 'processing', progressMessage: 'Converting PDF to images...' }
                : f
            )
          )

          const response = await fetch('/api/process-pdf', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Processing failed')
          }

          const blob = await response.blob()
          const downloadUrl = URL.createObjectURL(blob)

          processedCount++
          setProgress((processedCount / totalFiles) * 100)

          console.log(`[UI] Completed: ${fileWithStatus.file.name}`)

          setFiles((prev) =>
            prev.map((f) =>
              f.file === fileWithStatus.file
                ? { ...f, status: 'completed', downloadUrl, progressMessage: undefined, progressDetails: undefined }
                : f
            )
          )
        } catch (err) {
          processedCount++
          setProgress((processedCount / totalFiles) * 100)

          console.error(`[UI] Error processing ${fileWithStatus.file.name}:`, err)

          setFiles((prev) =>
            prev.map((f) =>
              f.file === fileWithStatus.file
                ? {
                    ...f,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Unknown error',
                    progressMessage: undefined,
                    progressDetails: undefined,
                  }
                : f
            )
          )
        } finally {
          if (progressInterval) {
            clearInterval(progressInterval)
          }
          if (currentProcessingFile === fileWithStatus.file.name) {
            setCurrentProcessingFile(null)
          }
        }
      })

      await Promise.all(promises)
    }

    setIsProcessing(false)
    setSuccess(`Processed ${processedCount} file(s) successfully`)
  }

  const clearFiles = () => {
    files.forEach((f) => {
      if (f.downloadUrl) {
        URL.revokeObjectURL(f.downloadUrl)
      }
    })
    setFiles([])
    setProgress(0)
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="container">
      <h1>📄 PDF OCR Converter</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Convert scanned PDFs to digital PDFs using AI-powered OCR
      </p>

      <div className="batch-selector">
        <label htmlFor="batch-size">Batch Size:</label>
        <select
          id="batch-size"
          value={batchSize}
          onChange={(e) => setBatchSize(Number(e.target.value))}
          disabled={isProcessing}
        >
          <option value={10}>10 files</option>
          <option value={20}>20 files</option>
          <option value={30}>30 files</option>
        </select>
      </div>

      <div
        className="upload-area"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          📁 Drop PDF files here or click to select
        </p>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          Selected: {files.length} file(s)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="file-input"
          accept="application/pdf"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.2rem' }}>Selected Files</h2>
            <button
              onClick={clearFiles}
              disabled={isProcessing}
              style={{
                background: '#dc3545',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.6 : 1,
              }}
            >
              Clear All
            </button>
          </div>
          {files.map((fileWithStatus, index) => (
            <div key={index} className="file-item">
              <div style={{ flex: 1, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span className="file-name">{fileWithStatus.file.name}</span>
                  <span className={`file-status status-${fileWithStatus.status}`}>
                    {fileWithStatus.status}
                  </span>
                </div>
                {fileWithStatus.progressMessage && (
                  <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem', fontWeight: '500' }}>
                    {fileWithStatus.progressMessage}
                  </div>
                )}
                {fileWithStatus.progressDetails && (
                  <div style={{ marginTop: '0.75rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #dee2e6' }}>
                    {/* Progress Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <strong style={{ color: '#495057' }}>Pages:</strong>{' '}
                          <span style={{ color: '#667eea', fontWeight: '600' }}>
                            {fileWithStatus.progressDetails.processedPages}/{fileWithStatus.progressDetails.totalPages}
                          </span>
                        </div>
                        <div>
                          <strong style={{ color: '#495057' }}>Chunk:</strong>{' '}
                          <span style={{ color: '#764ba2', fontWeight: '600' }}>
                            {fileWithStatus.progressDetails.currentChunk}/{fileWithStatus.progressDetails.totalChunks}
                          </span>
                        </div>
                        {fileWithStatus.progressDetails.totalPages > 0 && (
                          <div>
                            <strong style={{ color: '#495057' }}>Progress:</strong>{' '}
                            <span style={{ color: '#28a745', fontWeight: '600', fontSize: '0.9rem' }}>
                              {Math.round((fileWithStatus.progressDetails.processedPages / fileWithStatus.progressDetails.totalPages) * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {fileWithStatus.progressDetails.totalPages > 0 && (
                      <div style={{ width: '100%', height: '12px', background: '#e9ecef', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.75rem', position: 'relative' }}>
                        <div
                          style={{
                            width: `${(fileWithStatus.progressDetails.processedPages / fileWithStatus.progressDetails.totalPages) * 100}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                            transition: 'width 0.3s ease',
                            borderRadius: '6px',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            color: fileWithStatus.progressDetails.processedPages / fileWithStatus.progressDetails.totalPages > 0.5 ? '#fff' : '#495057',
                            pointerEvents: 'none',
                          }}
                        >
                          {fileWithStatus.progressDetails.processedPages}/{fileWithStatus.progressDetails.totalPages} pages
                        </div>
                      </div>
                    )}

                    {/* Current Status */}
                    {fileWithStatus.progressDetails.status && (
                      <div style={{ 
                        padding: '0.5rem 0.75rem', 
                        background: '#e7f3ff', 
                        borderRadius: '6px', 
                        marginBottom: '0.75rem',
                        borderLeft: '3px solid #667eea',
                        fontSize: '0.875rem',
                        color: '#084298',
                        fontWeight: '500'
                      }}>
                        {fileWithStatus.progressDetails.status}
                      </div>
                    )}

                    {/* Detailed Logs - Show ALL logs exactly as in console */}
                    {fileWithStatus.progressDetails.logs && fileWithStatus.progressDetails.logs.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          marginBottom: '0.5rem' 
                        }}>
                          <strong style={{ color: '#495057', fontSize: '0.875rem' }}>Processing Log:</strong>
                          <span style={{ color: '#6c757d', fontSize: '0.75rem' }}>
                            {fileWithStatus.progressDetails.logs.length} entries
                          </span>
                        </div>
                        <div style={{ 
                          maxHeight: '400px', 
                          overflowY: 'auto', 
                          fontFamily: 'Monaco, "Courier New", monospace', 
                          fontSize: '0.75rem', 
                          color: '#212529', 
                          background: '#fff', 
                          padding: '0.75rem', 
                          borderRadius: '6px', 
                          border: '1px solid #dee2e6',
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {fileWithStatus.progressDetails.logs.map((log: string, logIndex: number) => {
                            const isSuccess = log.includes('✓') || log.includes('successfully')
                            const isError = log.includes('✗') || log.includes('failed') || log.includes('error')
                            const isSending = log.includes('→') || log.includes('Sending')
                            const isChunk = log.includes('[Chunk') || log.includes('Processing chunk')
                            
                            let logColor = '#495057'
                            let logBg = 'transparent'
                            if (isSuccess) {
                              logColor = '#28a745'
                              logBg = '#d4edda'
                            } else if (isError) {
                              logColor = '#dc3545'
                              logBg = '#f8d7da'
                            } else if (isSending) {
                              logColor = '#0066cc'
                              logBg = '#cfe2ff'
                            } else if (isChunk) {
                              logColor = '#764ba2'
                              logBg = '#e2d9f3'
                            }
                            
                            return (
                              <div 
                                key={logIndex} 
                                style={{ 
                                  marginBottom: '0.2rem', 
                                  whiteSpace: 'pre-wrap',
                                  padding: '0.2rem 0.4rem',
                                  borderRadius: '3px',
                                  background: logBg,
                                  color: logColor,
                                  borderLeft: logBg !== 'transparent' ? `2px solid ${logColor}` : 'none',
                                  transition: 'all 0.2s ease',
                                  fontFamily: 'inherit'
                                }}
                              >
                                {log}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginLeft: '1rem' }}>
                {fileWithStatus.status === 'completed' &&
                  fileWithStatus.downloadUrl && (
                    <a
                      href={fileWithStatus.downloadUrl}
                      download={`converted_${fileWithStatus.file.name}`}
                      className="download-button"
                    >
                      Download
                    </a>
                  )}
                {fileWithStatus.status === 'error' && (
                  <span style={{ color: '#dc3545', fontSize: '0.875rem', maxWidth: '300px' }}>
                    {fileWithStatus.error}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <>
          <button
            className="process-button"
            onClick={processFiles}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Process Files'}
          </button>
          {isProcessing && currentProcessingFile && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#e7f3ff', borderRadius: '8px', fontSize: '0.9rem', color: '#0066cc' }}>
              <strong>Currently processing:</strong> {currentProcessingFile}
              <br />
              <small>Check browser console for detailed progress (pages being sent/received)</small>
            </div>
          )}
        </>
      )}

      {isProcessing && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
    </div>
  )
}

