import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PDF OCR Converter',
  description: 'Convert scanned PDFs to digital PDFs using OCR',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

