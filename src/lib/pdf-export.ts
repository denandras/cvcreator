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
 * If the container has multiple A4 page children (auto-pagination mode),
 * each page is captured individually for clean page breaks.
 * Otherwise, the full canvas is sliced into A4-height chunks.
 */
export async function exportToPdf(
  element: HTMLElement,
  options: PdfExportOptions = {}
): Promise<void> {
  const filename = (options.profileName || "CV").replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: "a4",
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Check if the container has multiple A4 page children (auto-pagination mode)
  // Pages may be nested inside a wrapper div
  const allElements = element.querySelectorAll(".bg-white.shadow-lg");
  const pageChildren = Array.from(allElements).filter((el) => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    return rect.width > 100; // filter out measurement container
  });

  if (pageChildren.length > 1) {
    // Auto-pagination mode: capture each page individually for clean breaks
    for (let i = 0; i < pageChildren.length; i++) {
      const pageEl = pageChildren[i] as HTMLElement;
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
    }
    pdf.save(filename);
    return;
  }

  // Fallback: single canvas approach with slicing
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  // Scale canvas to fit page width
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight <= pageHeight) {
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
  } else {
    // Multi-page: slice the canvas into page-height chunks
    const pxPerPage = Math.round((pageHeight * canvas.width) / imgWidth);

    let yOffset = 0;
    let pageIndex = 0;

    while (yOffset < canvas.height) {
      const sliceHeight = Math.min(pxPerPage, canvas.height - yOffset);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const ctx = pageCanvas.getContext("2d");
      if (!ctx) break;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0, yOffset,
        canvas.width, sliceHeight,
        0, 0,
        pageCanvas.width, pageCanvas.height
      );

      const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
      const sliceImgHeight = (sliceHeight * imgWidth) / canvas.width;

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, sliceImgHeight);

      yOffset += pxPerPage;
      pageIndex++;
    }
  }

  pdf.save(filename);
}