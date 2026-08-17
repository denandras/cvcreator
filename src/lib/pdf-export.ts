"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface PdfExportOptions {
  /** Filename without extension */
  profileName?: string;
  /** Whether to include the photo (already controlled by caller via DOM) */
  includePhoto?: boolean;
}

/**
 * Export a DOM element (the CV preview container) to a print-ready A4 PDF.
 * Uses html2canvas to capture the rendered preview at 2x scale for quality,
 * then slices the canvas into A4 pages with jsPDF.
 *
 * Only enabled sections/entries appear in the export because the preview
 * already filters them. Design settings (fonts, colors, spacing, margins,
 * rounded corners) are baked into the DOM and thus captured faithfully.
 * Page breaks are respected — each A4 page gets its own canvas slice.
 */
export async function exportToPdf(
  element: HTMLElement,
  options: PdfExportOptions = {}
): Promise<void> {
  const filename = (options.profileName || "CV").replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";

  // Capture at 2x for print quality (300 DPI effective)
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: "a4",
    compress: true,
  });

  // A4 in px at 96 DPI
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Scale canvas to fit page width
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // If content fits on one page, just add it
  if (imgHeight <= pageHeight) {
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
  } else {
    // Multi-page: slice the canvas into page-height chunks
    // Calculate how many px of the canvas correspond to one A4 page height
    const pxPerPage = Math.round((pageHeight * canvas.width) / imgWidth);

    let yOffset = 0;
    let pageIndex = 0;

    while (yOffset < canvas.height) {
      // Create a sub-canvas for this page
      const sliceHeight = Math.min(pxPerPage, canvas.height - yOffset);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const ctx = pageCanvas.getContext("2d");
      if (!ctx) break;

      // Fill white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      // Draw the slice from the full canvas
      ctx.drawImage(
        canvas,
        0, yOffset,                          // source x, y
        canvas.width, sliceHeight,           // source w, h
        0, 0,                                // dest x, y
        pageCanvas.width, pageCanvas.height  // dest w, h
      );

      const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
      const sliceImgHeight = (sliceHeight * imgWidth) / canvas.width;

      if (pageIndex > 0) pdf.addPage();

      // Add image — if slice is shorter than a full page, still position at top
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, sliceImgHeight);

      yOffset += pxPerPage;
      pageIndex++;
    }
  }

  pdf.save(filename);
}