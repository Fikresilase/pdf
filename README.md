# PDF OCR Converter

A Next.js application that converts scanned PDFs to digital PDFs using Google's Gemini AI (Gemini 1.5 Flash) for OCR and text extraction.

## Features

- 📄 Convert scanned PDFs to digital, searchable PDFs
- 🔄 Batch processing support (10, 20, or 30 files at a time)
- 🤖 AI-powered OCR using Gemini 1.5 Flash
- 📝 Preserves document structure (headings, tables, lists, etc.)
- 💾 Individual download for each converted file

## Prerequisites

1. **Node.js** (v18 or higher)
2. **ImageMagick** (for PDF to image conversion)
   - Windows: Download from [ImageMagick website](https://imagemagick.org/script/download.php)
   - macOS: `brew install imagemagick`
   - Linux: `sudo apt-get install imagemagick`

3. **Gemini API Key**
   - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Select Batch Size**: Choose how many files to process at once (10, 20, or 30)

2. **Upload PDFs**: 
   - Click the upload area or drag and drop PDF files
   - You can select multiple files at once

3. **Process Files**: Click the "Process Files" button to start conversion

4. **Download**: Once processing is complete, click "Download" next to each file to get the converted PDF

## How It Works

1. **PDF to Images**: Each page of the scanned PDF is converted to a high-resolution image (300 DPI)

2. **OCR Processing**: Images are sent to Gemini 1.5 Flash API with a detailed system prompt for OCR extraction

3. **Markdown Generation**: Gemini returns the extracted text in markdown format, preserving document structure

4. **PDF Generation**: The markdown is converted to HTML and then to PDF using Puppeteer

5. **Download**: Each converted PDF is available for individual download

## System Prompt

The application uses a comprehensive system prompt that instructs Gemini to:
- Extract ALL visible text (headings, body text, numbers, symbols)
- Preserve original reading order and layout
- Detect document structure (titles, subtitles, paragraphs, lists, tables)
- Maintain column order and line breaks
- NOT summarize, paraphrase, or translate
- Return clean, structured markdown

## Troubleshooting

### ImageMagick not found
If you get an error about ImageMagick, make sure it's installed and available in your system PATH.

### Gemini API errors
- Verify your API key is correct in the `.env` file
- Check that you have sufficient API quota
- Ensure the model name is correct (currently using `gemini-1.5-flash`)

### PDF conversion issues
- Ensure the input PDFs are scanned images (not already digital text)
- Large PDFs may take longer to process
- Check browser console for detailed error messages

## Project Structure

```
cursurpdf/
├── app/
│   ├── api/
│   │   └── process-pdf/
│   │       └── route.ts      # API endpoint for PDF processing
│   ├── globals.css            # Global styles
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Main UI component
├── temp/                      # Temporary files (auto-created)
│   ├── uploads/               # Uploaded PDFs
│   ├── images/                # Converted images
│   └── outputs/               # Generated PDFs
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT

