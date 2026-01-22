import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";
import { pathToFileURL } from "url"; // <--- ADDED: Essential for Windows paths

const execAsync = promisify(exec);

// Updated Prompt to be page-aware
const SYSTEM_PROMPT = `You are an OCR and document-structure extraction system.
Your task is to extract ALL visible text from the provided image.

STRICT REQUIREMENTS:
- This is a SINGLE page from a document. Extract text ONLY from this image.
- Perform OCR on scanned content; do not skip low-quality or faint text.
- Preserve the original reading order based on visual layout.
- Detect structure: Titles, Headings, Paragraphs, Lists, Tables.
- Do NOT merge unrelated sections.
- Do NOT summarize, paraphrase, or translate.
- Do NOT include content that is not visible in this specific image.
- Keep the text exactly as it appears.

OUTPUT FORMAT:
Return ONLY the markdown content. No explanations.`;

// Helper function to update progress
async function updateProgress(fileId: string, update: any) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/progress`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, update }),
      },
    );
  } catch (error) {
    // Silently fail - progress updates are not critical
  }
}

// Helper for numeric sorting of filenames (fixes 1, 10, 2 sorting issue)
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const providedFileId = formData.get("fileId") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Use provided fileId or generate a new one
    const fileId =
      providedFileId ||
      `${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured in .env file." },
        { status: 500 },
      );
    }
    const trimmedApiKey = apiKey.trim();

    // Create temp directories
    const tempDir = path.join(process.cwd(), "temp");
    const uploadsDir = path.join(tempDir, "uploads");
    const imagesDir = path.join(tempDir, "images");
    const outputsDir = path.join(tempDir, "outputs");

    [tempDir, uploadsDir, imagesDir, outputsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Save uploaded file
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const inputPdfPath = path.join(uploadsDir, `${fileId}.pdf`);
    fs.writeFileSync(inputPdfPath, fileBuffer);

    // CLEANUP: Remove any old images for this fileId to prevent pollution
    fs.readdirSync(imagesDir)
      .filter((f) => f.startsWith(fileId) && f.endsWith(".png"))
      .forEach((f) => {
        try {
          fs.unlinkSync(path.join(imagesDir, f));
        } catch (e) {}
      });

    // Convert PDF to images
    let images: string[] = [];
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pageCount = pdfDoc.getPageCount();

    console.log(`Converting PDF with ${pageCount} page(s) to images...`);

    // Method 1: Try pdf2pic
    let conversionSuccess = false;
    try {
      const { fromPath } = require("pdf2pic");
      const convert = fromPath(inputPdfPath, {
        density: 300,
        saveFilename: fileId,
        savePath: imagesDir,
        format: "png",
        width: 2000,
        height: 2000,
      });

      for (let i = 1; i <= pageCount; i++) {
        const result = await convert(i, { responseType: "base64" });
        if (result.base64) {
          const imagePath = path.join(imagesDir, `${fileId}.${i}.png`);
          fs.writeFileSync(imagePath, Buffer.from(result.base64, "base64"));
          images.push(imagePath);
        }
      }
      if (images.length === pageCount) {
        conversionSuccess = true;
        console.log(
          `Successfully converted ${images.length} pages using pdf2pic`,
        );
      }
    } catch (error) {
      console.error("pdf2pic conversion failed:", error);
    }

    // Method 2: Try ImageMagick (magick command)
    if (!conversionSuccess) {
      images = [];
      try {
        console.log("Trying ImageMagick (magick command)...");
        await execAsync(
          `magick -density 300 "${inputPdfPath}" "${path.join(imagesDir, fileId)}_%02d.png"`,
        );
        const imageFiles = fs
          .readdirSync(imagesDir)
          .filter((f) => f.startsWith(fileId) && f.endsWith(".png"))
          .sort(naturalSort) // <--- FIXED: Numeric sort
          .map((f) => path.join(imagesDir, f));

        if (imageFiles.length > 0) {
          images.push(...imageFiles);
          conversionSuccess = true;
          console.log(
            `Successfully converted ${images.length} pages using ImageMagick (magick)`,
          );
        }
      } catch (error) {
        console.error("ImageMagick (magick) failed:", error);
      }
    }

    // Method 3: Try ImageMagick (convert command)
    if (!conversionSuccess) {
      images = [];
      try {
        console.log("Trying ImageMagick (convert command)...");
        await execAsync(
          `convert -density 300 "${inputPdfPath}" "${path.join(imagesDir, fileId)}_%02d.png"`,
        );
        const imageFiles = fs
          .readdirSync(imagesDir)
          .filter((f) => f.startsWith(fileId) && f.endsWith(".png"))
          .sort(naturalSort) // <--- FIXED: Numeric sort
          .map((f) => path.join(imagesDir, f));

        if (imageFiles.length > 0) {
          images.push(...imageFiles);
          conversionSuccess = true;
          console.log(
            `Successfully converted ${images.length} pages using ImageMagick (convert)`,
          );
        }
      } catch (error) {
        console.error("ImageMagick (convert) failed:", error);
      }
    }

    // Method 4: Try GraphicsMagick
    if (!conversionSuccess) {
      images = [];
      try {
        console.log("Trying GraphicsMagick...");
        await execAsync(
          `gm convert -density 300 "${inputPdfPath}" "${path.join(imagesDir, fileId)}_%02d.png"`,
        );
        const imageFiles = fs
          .readdirSync(imagesDir)
          .filter((f) => f.startsWith(fileId) && f.endsWith(".png"))
          .sort(naturalSort) // <--- FIXED: Numeric sort
          .map((f) => path.join(imagesDir, f));

        if (imageFiles.length > 0) {
          images.push(...imageFiles);
          conversionSuccess = true;
          console.log(
            `Successfully converted ${images.length} pages using GraphicsMagick`,
          );
        }
      } catch (error) {
        console.error("GraphicsMagick failed:", error);
      }
    }

    // Method 5: Try using Puppeteer to render PDF pages
    // UPDATED: Now extracts single pages to temporary PDFs + uses pathToFileURL
    if (!conversionSuccess) {
      images = [];
      try {
        console.log("Trying Puppeteer PDF rendering...");
        const puppeteer = require("puppeteer");
        const browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();

        // Loop through pages
        for (let i = 0; i < pageCount; i++) {
          // 1. Create a temporary 1-page PDF using pdf-lib
          // This guarantees Puppeteer ONLY sees the page we want
          const singlePagePdf = await PDFDocument.create();
          const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
          singlePagePdf.addPage(copiedPage);
          const pdfBytes = await singlePagePdf.save();

          const tempSinglePagePath = path.join(
            uploadsDir,
            `${fileId}_temp_page_${i}.pdf`,
          );
          fs.writeFileSync(tempSinglePagePath, pdfBytes);

          // 2. Open the single-page PDF using pathToFileURL for Windows compatibility
          const fileUrl = pathToFileURL(tempSinglePagePath).toString(); // <--- FIXED

          await page.goto(fileUrl, {
            waitUntil: "networkidle0",
          });

          // 3. Wait for PDF rendering (Canvas/Viewer to initialize)
          // waitForTimeout is deprecated, using setTimeout promise
          await new Promise((r) => setTimeout(r, 300)); // <--- FIXED: Wait for render

          // 4. Screenshot
          const imagePath = path.join(imagesDir, `${fileId}.${i + 1}.png`);
          await page.screenshot({
            path: imagePath,
            fullPage: true,
            type: "png",
          });
          images.push(imagePath);

          // 5. Cleanup single page PDF
          try {
            fs.unlinkSync(tempSinglePagePath);
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        await browser.close();
        if (images.length === pageCount) {
          conversionSuccess = true;
          console.log(
            `Successfully converted ${images.length} pages using Puppeteer`,
          );
        }
      } catch (error) {
        console.error("Puppeteer conversion failed:", error);
      }
    }

    if (!conversionSuccess || images.length === 0) {
      console.error("All PDF conversion methods failed");
      return NextResponse.json(
        {
          error: "Failed to convert PDF to images.",
          details: `Attempted ${pageCount} pages, got ${images.length} images`,
        },
        { status: 500 },
      );
    }

    console.log(`Successfully extracted ${images.length} image(s) from PDF`);
    await updateProgress(fileId, {
      totalPages: images.length,
      processedPages: 0,
      currentChunk: 0,
      totalChunks: Math.ceil(images.length / 2),
      status: `Successfully extracted ${images.length} image(s) from PDF`,
      log: `Successfully extracted ${images.length} image(s) from PDF`,
    });

    // Initialize progress tracking
    const totalPages = images.length;
    const totalChunks = Math.ceil(totalPages / 2);
    await updateProgress(fileId, {
      totalPages,
      processedPages: 0,
      currentChunk: 0,
      totalChunks,
      status: 'Starting OCR processing...',
      log: `\n=== Starting OCR Processing ===\nTotal pages: ${totalPages}\nProcessing in chunks of 2 pages\n`,
    });

    // Process images with Gemini
    const genAI = new GoogleGenerativeAI(trimmedApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let fullMarkdown = "";
    const CHUNK_SIZE = 2;
    const MAX_RETRIES = 2;

    // Process images in chunks
    for (
      let chunkStart = 0;
      chunkStart < images.length;
      chunkStart += CHUNK_SIZE
    ) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, images.length);
      const chunk = images.slice(chunkStart, chunkEnd);
      const chunkNumber = Math.floor(chunkStart / CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(images.length / CHUNK_SIZE);

      console.log(
        `\n[Chunk ${chunkNumber}/${totalChunks}] Processing pages ${chunkStart + 1}-${chunkEnd}...`,
      );

      await updateProgress(fileId, {
        currentChunk: chunkNumber,
        status: `Processing chunk ${chunkNumber}/${totalChunks} (pages ${chunkStart + 1}-${chunkEnd})...`,
        log: `\n[Chunk ${chunkNumber}/${totalChunks}] Processing pages ${chunkStart + 1}-${chunkEnd}...`,
      });

      let chunkSuccess = false;
      let chunkMarkdown = "";
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
          console.log(`  Attempt ${attempt}/${MAX_RETRIES + 1} for chunk ${chunkNumber}...`);
          await updateProgress(fileId, {
            log: `  Attempt ${attempt}/${MAX_RETRIES + 1} for chunk ${chunkNumber}...`,
          });

          // Process all images in chunk in parallel
          const chunkPromises = chunk.map(async (imagePath, index) => {
            const pageNumber = chunkStart + index + 1;
            console.log(`    → Sending page ${pageNumber} to Gemini API...`);
            await updateProgress(fileId, {
              status: `Sending page ${pageNumber} to Gemini API...`,
              log: `    → Sending page ${pageNumber} to Gemini API...`,
            });

            const imageData = fs.readFileSync(imagePath);
            const base64Image = imageData.toString("base64");

            // Add page number context
            const pageContext = `\n\nCONTEXT: This is Page ${pageNumber} of the document.`;

            const result = await model.generateContent([
              SYSTEM_PROMPT + pageContext,
              {
                inlineData: {
                  data: base64Image,
                  mimeType: "image/png",
                },
              },
            ]);

            const response = await result.response;
            let text = response.text().trim();

            // Clean code blocks
            if (text.startsWith("```")) {
              const lines = text.split("\n");
              lines.shift();
              if (lines[lines.length - 1].trim() === "```") lines.pop();
              text = lines.join("\n");
            }

            console.log(`    ✓ Page ${pageNumber} processed successfully`);
            await updateProgress(fileId, {
              processedPages: chunkStart + index + 1,
              status: `Page ${pageNumber} processed successfully`,
              log: `    ✓ Page ${pageNumber} processed successfully`,
            });
            return { pageNumber, text };
          });

          const chunkResults = await Promise.all(chunkPromises);

          chunkMarkdown = chunkResults
            .sort((a, b) => a.pageNumber - b.pageNumber)
            .map((result) => result.text)
            .join("\n\n---\n\n");

          chunkSuccess = true;
          console.log(`  ✓ Chunk ${chunkNumber} completed successfully (pages ${chunkStart + 1}-${chunkEnd})`);
          const progressPercent = Math.round((chunkEnd / totalPages) * 100);
          console.log(`  Progress: ${chunkEnd}/${totalPages} pages (${progressPercent}%)`);
          
          await updateProgress(fileId, {
            processedPages: chunkEnd,
            status: `Chunk ${chunkNumber} completed (${chunkEnd}/${totalPages} pages - ${progressPercent}%)`,
            log: `  ✓ Chunk ${chunkNumber} completed successfully (pages ${chunkStart + 1}-${chunkEnd})\n  Progress: ${chunkEnd}/${totalPages} pages (${progressPercent}%)`,
          });
          
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`  ✗ Attempt ${attempt} failed for chunk ${chunkNumber}:`, lastError.message);
          await updateProgress(fileId, {
            log: `  ✗ Attempt ${attempt} failed for chunk ${chunkNumber}: ${lastError.message}`,
          });
          
          if (attempt <= MAX_RETRIES) {
            console.log(`  Retrying chunk ${chunkNumber}... (${MAX_RETRIES + 1 - attempt} retries left)`);
            await updateProgress(fileId, {
              log: `  Retrying chunk ${chunkNumber}... (${MAX_RETRIES + 1 - attempt} retries left)`,
            });
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!chunkSuccess) {
        console.error(`\n✗ Failed to process chunk ${chunkNumber} after ${MAX_RETRIES + 1} attempts`);
        await updateProgress(fileId, {
          log: `\n✗ Failed to process chunk ${chunkNumber} after ${MAX_RETRIES + 1} attempts`,
        });
        throw new Error(
          `Failed to process chunk ${chunkNumber}: ${lastError?.message}`,
        );
      }

      fullMarkdown += chunkMarkdown;
      if (chunkEnd < images.length) {
        fullMarkdown += "\n\n---\n\n";
      }
    }

    console.log(`\n=== OCR Processing Complete ===`);
    console.log(`Successfully processed all ${totalPages} pages\n`);
    await updateProgress(fileId, {
      processedPages: totalPages,
      status: 'OCR processing complete. Generating PDF...',
      log: `\n=== OCR Processing Complete ===\nSuccessfully processed all ${totalPages} pages\n`,
    });

    console.log(`\n=== OCR Processing Complete ===`);

    // Convert markdown to HTML
    const { marked } = require("marked");
    const htmlContent = marked(fullMarkdown, { breaks: true, gfm: true });

    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

    // Generate Output PDF
    console.log("Generating output PDF...");
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);

    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    const outputPdfPath = path.join(outputsDir, `${fileId}.pdf`);
    await page.pdf({
      path: outputPdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });
    await browser.close();
    console.log('PDF generation completed');
    await updateProgress(fileId, {
      status: 'PDF generation completed',
      log: 'PDF generation completed',
    });

    const pdfBuffer = fs.readFileSync(outputPdfPath);

    // Cleanup
    try {
      fs.unlinkSync(inputPdfPath);
      images.forEach((img) => fs.unlinkSync(img));
      fs.unlinkSync(outputPdfPath);
    } catch (e) {
      console.error("Cleanup warning:", e);
    }

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="converted_${file.name}"`,
      },
    });
  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
