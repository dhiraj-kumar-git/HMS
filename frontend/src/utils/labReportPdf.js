import { jsPDF } from 'jspdf';

// Code 39 encoding pattern map
const CODE39_PATTERNS = {
  '0': 'N N N W W N W N N',
  '1': 'W N N W N N N N W',
  '2': 'N N W W N N N N W',
  '3': 'W N W W N N N N N',
  '4': 'N N N W W N N N W',
  '5': 'W N N W W N N N N',
  '6': 'N N W W W N N N N',
  '7': 'N N N W N N W N W',
  '8': 'W N N W N N W N N',
  '9': 'N N W W N N W N N',
  'A': 'W N N N N W N N W',
  'B': 'N N W N N W N N W',
  'C': 'W N W N N W N N N',
  'D': 'N N N N W W N N W',
  'E': 'W N N N W W N N N',
  'F': 'N N W N W W N N N',
  'G': 'N N N N N W W N W',
  'H': 'W N N N N W W N N',
  'I': 'N N W N N W W N N',
  'J': 'N N N N W W W N N',
  'K': 'W N N N N N N W W',
  'L': 'N N W N N N N W W',
  'M': 'W N W N N N N W N',
  'N': 'N N N N W N N W W',
  'O': 'W N N N W N N W N',
  'P': 'N N W N W N N W N',
  'Q': 'N N N N N N W W W',
  'R': 'W N N N N N W W N',
  'S': 'N N W N N N W W N',
  'T': 'N N N N W N W W N',
  'U': 'W W N N N N N N W',
  'V': 'N W W N N N N N W',
  'W': 'W W W N N N N N N',
  'X': 'N W N N W N N N W',
  'Y': 'W W N N W N N N N',
  'Z': 'N W W N W N N N N',
  '-': 'N W N N N N W N W',
  '.': 'W W N N N N W N N',
  ' ': 'N W W N N N W N N',
  '*': 'N N W N W N N W N',
  '$': 'N W N W N W N N N',
  '/': 'N W N W N N N W N',
  '+': 'N W N N N W N W N',
  '%': 'N N N W N W N W N'
};

const drawCode39Barcode = (doc, value, xStart, yStart, height = 7) => {
  if (!value) return;
  const cleanText = `*${String(value).toUpperCase()}*`;
  const narrowWidth = 0.25;
  const wideWidth = 0.65;
  let currX = xStart;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];
    const elements = pattern.split(' ');

    for (let j = 0; j < 9; j++) {
      const isBar = j % 2 === 0;
      const isWide = elements[j] === 'W';
      const w = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        doc.setFillColor(0, 0, 0);
        doc.rect(currX, yStart, w, height, 'F');
      }
      currX += w;
    }
    currX += narrowWidth; // Gap
  }
};

const formatToReportDateTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
};

const isOutOfRange = (valStr, refStr) => {
  if (!valStr || !refStr || refStr === 'N/A') return false;
  const val = parseFloat(valStr);
  if (isNaN(val)) return false;

  const rangeMatch = refStr.match(/^([0-9.]+)\s*-\s*([0-9.]+)$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    return val < min || val > max;
  }

  const lessMatch = refStr.match(/^<\s*([0-9.]+)$/);
  if (lessMatch) {
    const limit = parseFloat(lessMatch[1]);
    return val >= limit;
  }

  const greaterMatch = refStr.match(/^>\s*([0-9.]+)$/);
  if (greaterMatch) {
    const limit = parseFloat(greaterMatch[1]);
    return val <= limit;
  }

  return false;
};

export const generateLabReportPdf = (patientInfo, manualReports) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const latestTimestamp = manualReports[0]?.timestamp || new Date().toISOString();
  const rawTestNo = patientInfo.visitId || patientInfo.visit_id || 'N/A';
  const testNo = rawTestNo.split('-')[0].toUpperCase();
  const uhidNo = patientInfo.uhid || patientInfo.instituteId || patientInfo.institute_id || 'N/A';
  const patientName = patientInfo.patientName || patientInfo.name || 'N/A';
  const doctorName = patientInfo.doctorName || patientInfo.doctor_name || 'N/A';

  // Page layout metrics
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  const centerX = pageWidth / 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxY = pageHeight - 50; // leave space for footer

  let currentY = 12;

  // --- 1. HEADER DOUBLE BORDER BOX ---
  const headerBoxHeight = 33;
  doc.setLineWidth(0.6);
  doc.rect(margin, currentY, contentWidth, headerBoxHeight);
  doc.setLineWidth(0.2);
  doc.rect(margin + 0.5, currentY + 0.5, contentWidth - 1.0, headerBoxHeight - 1.0);

  // Centered Header Title Text
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.text("Birla Institute of Technology & Science", centerX, currentY + 6, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text("Pilani (Rajasthan) 333 031, India", centerX, currentY + 9.5, { align: 'center' });

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text("MEDICAL CENTRE", centerX, currentY + 13.5, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text("Vidya Vihar, Pilani, RAJASTHAN", centerX, currentY + 17, { align: 'center' });

  // Divider Line inside header box
  const dividerY = currentY + 19;
  doc.line(margin, dividerY, margin + contentWidth, dividerY);

  // Contact Details in Header (2 columns at bottom of box)
  doc.setFontSize(7.5);
  doc.setFont('Helvetica', 'bold');

  // Left side column
  doc.text("Contact No.:", margin + 2, currentY + 23);
  doc.text("E-Mail:", margin + 2, currentY + 26);
  doc.text("WebSite:", margin + 2, currentY + 29);

  // Right side column
  doc.text("Fax:", margin + 116, currentY + 23);
  doc.text("Date:", margin + 116, currentY + 26);

  doc.setFont('Helvetica', 'normal');
  doc.text("01596-515525", margin + 19, currentY + 23);
  doc.text("medc@pilani.bits-pilani.ac.in", margin + 19, currentY + 26);
  doc.text("www.bits-pilani.ac.in", margin + 19, currentY + 29);

  doc.text("01596-244183", margin + 126, currentY + 23);
  doc.text(formatToReportDateTime(latestTimestamp), margin + 126, currentY + 26);

  currentY += headerBoxHeight + 4;

  // --- 2. INVESTIGATION BAR ---
  doc.setLineWidth(0.4);
  doc.line(margin, currentY, margin + contentWidth, currentY);
  doc.line(margin, currentY + 6, margin + contentWidth, currentY + 6);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text("* INVESTIGATION *", centerX, currentY + 4.2, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(formatToReportDateTime(latestTimestamp), margin + contentWidth - 2, currentY + 4.2, { align: 'right' });

  currentY += 10;

  // --- 3. DEMOGRAPHICS GRID ---
  doc.setFontSize(8.5);
  doc.setFont('Helvetica', 'bold');

  const drawDemoField = (label, value, xLabel, xValue) => {
    doc.setFont('Helvetica', 'bold');
    doc.text(label, xLabel, currentY);
    doc.setFont('Helvetica', 'normal');
    doc.text(`: ${String(value).toUpperCase()}`, xValue, currentY);
  };

  const col2X = margin + 111;
  const col2ValX = col2X + 17;

  drawDemoField("Ref. Doctor", doctorName, margin, margin + 24);
  drawDemoField("Test Date", formatToReportDateTime(latestTimestamp), col2X, col2ValX);
  currentY += 5;

  drawDemoField("Ref. No.", patientInfo.instituteId || patientInfo.institute_id || 'N/A', margin, margin + 24);
  drawDemoField("Reg. Date", formatToReportDateTime(patientInfo.regDate || patientInfo.time || latestTimestamp), col2X, col2ValX);
  currentY += 5;

  drawDemoField("Name", patientName, margin, margin + 24);
  drawDemoField("UHID", uhidNo, col2X, col2ValX);
  currentY += 5;

  drawDemoField("PSRN No/ID No", patientInfo.instituteId || patientInfo.institute_id || 'N/A', margin, margin + 24);
  currentY += 5;

  drawDemoField("Age/Gender", `${patientInfo.age}Y / ${patientInfo.gender || 'N/A'}`, margin, margin + 24);
  currentY += 5;

  drawDemoField("Address", patientInfo.address || 'Pilani', margin, margin + 24);
  currentY += 4;

  doc.line(margin, currentY, margin + contentWidth, currentY);
  currentY += 4;

  // --- 4. TABLE HEADERS ---
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("Parameter", margin + 1, currentY);
  doc.text("Result", margin + (contentWidth * 0.375), currentY, { align: 'center' });
  doc.text("Unit", margin + (contentWidth * 0.525), currentY, { align: 'center' });
  doc.text("Reference Range", margin + contentWidth - 2, currentY, { align: 'right' });

  currentY += 3;
  doc.line(margin, currentY, margin + contentWidth, currentY);
  currentY += 6;

  // --- 5. BODY TEST ROWS ---
  const checkPageOverflow = (neededHeight) => {
    if (currentY + neededHeight > maxY) {
      doc.addPage();
      currentY = 20;
      // Re-draw table headers on new page
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text("Parameter", margin + 1, currentY);
      doc.text("Result", margin + (contentWidth * 0.375), currentY, { align: 'center' });
      doc.text("Unit", margin + (contentWidth * 0.525), currentY, { align: 'center' });
      doc.text("Reference Range", margin + contentWidth - 2, currentY, { align: 'right' });
      currentY += 3;
      doc.line(margin, currentY, margin + contentWidth, currentY);
      currentY += 6;
    }
  };

  manualReports.forEach((report) => {
    const entries = Object.entries(report.results || {});
    if (entries.length === 0) return;

    // Allocate height for sub-header + spacing
    checkPageOverflow(12);

    // Sub-header title (DENGUE, CBC, etc)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(String(report.test_name || 'Lab Test').toUpperCase(), centerX, currentY, { align: 'center' });

    const titleWidth = doc.getTextWidth(String(report.test_name || 'Lab Test').toUpperCase());
    doc.line(centerX - (titleWidth / 2), currentY + 1.5, centerX + (titleWidth / 2), currentY + 1.5);

    currentY += 8;

    doc.setFontSize(8.5);
    entries.forEach(([param, val]) => {
      checkPageOverflow(6);

      const value = typeof val === 'object' ? (val.value ?? '') : val;
      const ref = typeof val === 'object' ? (val.reference_range ?? 'N/A') : 'N/A';
      const units = typeof val === 'object' ? (val.units ?? 'N/A') : 'N/A';
      const isAbnormal = isOutOfRange(String(value), String(ref));

      doc.setFont('Helvetica', 'normal');
      doc.text(String(param).toUpperCase(), margin + 1, currentY);

      doc.setFont('Helvetica', 'bold');
      const valStr = isAbnormal ? `${String(value)} *` : String(value);
      doc.text(valStr, margin + (contentWidth * 0.375), currentY, { align: 'center' });

      doc.setFont('Helvetica', 'normal');
      doc.text(String(units), margin + (contentWidth * 0.525), currentY, { align: 'center' });
      doc.text(String(ref), margin + contentWidth - 2, currentY, { align: 'right' });

      currentY += 6;
    });

    if (report.remarks) {
      checkPageOverflow(8);
      doc.setFont('Helvetica', 'bold');
      doc.text("Remarks: ", margin + 1, currentY);
      doc.setFont('Helvetica', 'normal');
      doc.text(report.remarks, margin + 18, currentY);
      currentY += 6;
    }
  });

  // End of Report divider
  checkPageOverflow(10);
  currentY += 4;
  doc.setFontSize(8);
  doc.setFont('Helvetica', 'normal');
  doc.text("---------------------------x", centerX - 12, currentY, { align: 'right' });
  doc.setFont('Helvetica', 'bold');
  doc.text("End Of Report", centerX, currentY, { align: 'center' });
  doc.setFont('Helvetica', 'normal');
  doc.text("x---------------------------", centerX + 12, currentY, { align: 'left' });

  // --- 6. SIGNATURE BLOCK (At fixed position relative to page bottom) ---
  const sigY = pageHeight - 37;
  doc.setFontSize(8.5);
  doc.line(pageWidth - margin - 44, sigY, pageWidth - margin, sigY);
  doc.text("Signature", pageWidth - margin - 22, sigY + 4, { align: 'center' });

  // --- 7. FOOTER (At fixed bottom of page) ---
  const footerY = pageHeight - 29;
  doc.setLineWidth(0.4);
  doc.line(margin, footerY, margin + contentWidth, footerY);

  doc.setFontSize(7.5);
  doc.setFont('Helvetica', 'bold');
  doc.text("TEST No.", margin + 1, footerY + 5);
  drawCode39Barcode(doc, testNo, margin + 18, footerY + 2, 5);

  doc.setFont('Helvetica', 'bold');
  doc.text("UHID No.", margin + 96, footerY + 5);
  drawCode39Barcode(doc, uhidNo, margin + 112, footerY + 2, 5);

  doc.setFont('Helvetica', 'normal');
  doc.text("Page 1 of 1", margin + contentWidth - 12, footerY + 9);

  // Medico-legal disclaimers
  doc.setFontSize(7);
  const disclaimerText = "* Investigations have their limitations. Solitary, pathological/radiological and other investigations never confirm the final diagnosis of disease. They only help in diagnosing the disease in correlation to clinical symptoms and other related tests. Please interpret accordingly. In case of doubtful, abnormal, contradictory reports and not fitting to clinical diagnosis, the test can be performed without any charges on advise of referring doctor, on same day. *";
  const disclaimerLines = doc.splitTextToSize(disclaimerText, contentWidth);
  doc.text(disclaimerLines, margin + 1, footerY + 13);

  doc.setFont('Helvetica', 'bold');
  doc.text("* This is not valid for Medico-Legal purpose. *", centerX, footerY + 24, { align: 'center' });

  return doc;
};
