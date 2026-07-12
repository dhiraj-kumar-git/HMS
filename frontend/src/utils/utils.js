export const calculateAge = (dob) => {
  if (!dob) return 'N/A';
  if (!isNaN(dob) && !dob.toString().includes('-')) return dob;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return dob;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};



export const formatDateTimeIST = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

export const formatDateIST = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const formatDateIST_Short = (dateInput) => {
  const d = new Date(dateInput || new Date());
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(d);
  const partMap = {};
  parts.forEach(p => partMap[p.type] = p.value);
  return `${partMap.day}-${partMap.month.substring(0, 3)}-${partMap.year}`;
};

export const formatDateTime12H = (dateInput) => {
  const d = new Date(dateInput || new Date());
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const parts = formatter.formatToParts(d);
  const partMap = {};
  parts.forEach(p => partMap[p.type] = p.value);
  const day = partMap.day;
  const month = partMap.month.substring(0, 3);
  const year = partMap.year;
  const hour = String(parseInt(partMap.hour, 10));
  const minute = partMap.minute;
  const ampm = partMap.dayPeriod ? partMap.dayPeriod.toLowerCase() : '';
  return `${day}-${month}-${year}    ${hour}:${minute} ${ampm}`;
};

export const getPaymentNo = (patient, invoiceNo) => {
  const pDate = patient.payment_date ? new Date(patient.payment_date) : new Date();
  const yyyymmdd = pDate.getFullYear() + String(pDate.getMonth() + 1).padStart(2, '0') + String(pDate.getDate()).padStart(2, '0');
  let serial = '0001';
  if (invoiceNo) {
    const match = invoiceNo.match(/\d+$/);
    if (match) {
      serial = match[0].slice(-4).padStart(4, '0');
    }
  }
  return `${yyyymmdd}${serial}`;
};

export const getWeekdayIST = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  });
};

export const getDateISTString = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(date.getTime())) return '';
  // To get YYYY-MM-DD in IST, we can extract parts:
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
};

export const toTitleCase = (str) => {
  if (!str) return '';
  return str.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

export const numberToWords = (num) => {
  const a = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (num < 20) return a[num];
  if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
  if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  return a[Math.floor(num / 1000)] + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
};

export const amountToWords = (amount) => {
  if (amount === 0) return 'Zero Rupees';
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let rupeeStr = rupees > 0 ? `${numberToWords(rupees)} Rupees` : '';
  let paiseStr = paise > 0 ? `${numberToWords(paise)} Paise` : '';

  if (rupeeStr && paiseStr) {
    return `${rupeeStr} and ${paiseStr}`;
  } else if (rupeeStr) {
    return rupeeStr;
  } else {
    return paiseStr;
  }
};

export const generateTextReceipt = (patient, bill) => {
  const isFaculty = ['Faculty', 'Staff', 'Dependant'].includes(patient.patient_type || '');
  const isFacultyStaffOrDependent = isFaculty;
  const relationCodeMap = {
    "Daughter": "D",
    "Son": "S",
    "Spouse": "Spouse",
    "Wife": "W",
    "Husband": "H",
    "Mother": "M",
    "Father": "F",
    "Self": "Self"
  };

  const relation = patient.relation || 'Self';
  const relAbbrev = relationCodeMap[relation] || relation;
  const relationSuffix = isFaculty ? ` (${relAbbrev})` : '';

  const todayStr = new Date(patient.payment_date || new Date()).toLocaleDateString('en-GB').replace(/\//g, '-');
  const invoiceNo = patient.invoice_no || 'INV-DRAFT';
  const city = 'Pilani';
  const doctorName = patient.doctor_name || patient.doctor_assigned || 'Dr. Assigned';

  const medItems = bill.items.filter(item => item.type === 'medicine');
  const labItems = bill.items.filter(item => item.type === 'lab_test');

  const getSubBillDetails = (items) => {
    const total_unrounded = items.reduce((sum, item) => sum + item.item_total, 0);
    const total_rounded = Math.round(total_unrounded);
    const round_off = total_rounded - total_unrounded;

    let reimbursed = 0;
    let self_paid = 0;
    if (isFaculty) {
      reimbursed = parseFloat((total_unrounded * 0.90).toFixed(2));
      self_paid = parseFloat((total_rounded - reimbursed).toFixed(2));
    } else {
      reimbursed = 0;
      self_paid = total_rounded;
    }
    return {
      items,
      unrounded_total: total_unrounded,
      round_off,
      total_amount: total_rounded,
      reimbursed_amount: reimbursed,
      self_paid_amount: self_paid
    };
  };

  const formatSingleReceiptText = (subBill, categoryTitle, invoiceNoForSubBill) => {
    if (categoryTitle === "LAB TESTS") {
      let lines = [];
      const border = "-".repeat(92);
      lines.push(border);
      lines.push("                          Birla Institute of Technology & Science");
      lines.push("                                      MEDICAL CENTRE");
      lines.push("                               Vidya Vihar, Pilani, RAJASTHAN");
      lines.push(border);
      lines.push(`Contact No. : 01596-515525 /                                     Fax: 01596-244183`);

      const pDate = patient.payment_date ? new Date(patient.payment_date) : new Date();
      const formattedDateShort = formatDateIST_Short(pDate);
      const formattedDateTime12HStr = formatDateTime12H(pDate);

      lines.push(`E-Mail      : medc@pilani.bits-pilani.ac.in                      Date: ${formattedDateShort}`);
      lines.push(`WebSite     : www.bits-pilani.ac.in`);
      lines.push(border);
      lines.push("                                     * PAYMENT RECEIPT *");
      lines.push(border);

      lines.push(`Invoice No.  : ${invoiceNoForSubBill.padEnd(35)} Date/Time  : ${formattedDateTime12HStr}`);

      const formattedGender = (patient.gender || '').toUpperCase() === 'M' ? 'MALE' : ((patient.gender || '').toUpperCase() === 'F' ? 'FEMALE' : (patient.gender || '').toUpperCase());
      const ageGenderStr = `${calculateAge(patient.age || patient.date_of_birth)}Yr / ${formattedGender}`;
      lines.push(`UHID         : ${(patient.uhid_no || patient.institute_id || '').padEnd(35)} Age/Gender : ${ageGenderStr}`);

      lines.push(`Patient      : ${(patient.patient_name || patient.name || '').toUpperCase().padEnd(35)} PSRN No/ID : ${patient.institute_id || ''}`);

      const paymentNoVal = getPaymentNo(patient, invoiceNoForSubBill);
      lines.push(`Payment No.  : ${paymentNoVal}`);

      const docNameVal = (patient.doctor_name || patient.doctor_assigned || 'DR. ASSIGNED').toUpperCase();
      lines.push(`Ref. Doctor  : ${docNameVal}`);

      lines.push(border);
      lines.push("S.No. Service                      Gross Amt  Disc(%)     Disc  Remb(%)  Remb Amt     Amount");
      lines.push(border);

      let totalDisc = 0;
      let totalRemb = 0;
      let totalFinal = 0;

      subBill.items.forEach((item, i) => {
        const gross = item.gross || 0;
        const discPerc = 50.00;
        const discAmt = gross * 0.50;
        const rembPerc = isFaculty ? 90.00 : 0.00;
        const rembAmt = isFaculty ? (gross - discAmt) * 0.90 : 0.00;
        const finalAmt = gross - discAmt - rembAmt;

        totalDisc += discAmt;
        totalRemb += rembAmt;
        totalFinal += finalAmt;

        const sno = String(i + 1).padEnd(6);
        const serviceName = item.name.toUpperCase().substring(0, 28).padEnd(29);
        const grossStr = gross.toFixed(2).padStart(10);
        const discPercStr = discPerc.toFixed(2).padStart(9);
        const discAmtStr = discAmt.toFixed(2).padStart(9);
        const rembPercStr = rembPerc.toFixed(2).padStart(9);
        const rembAmtStr = rembAmt.toFixed(2).padStart(10);
        const finalAmtStr = finalAmt.toFixed(2).padStart(10);

        lines.push(`${sno}${serviceName}${grossStr}${discPercStr}${discAmtStr}${rembPercStr}${rembAmtStr}${finalAmtStr}`);
      });

      lines.push(border);
      const totalLabel = "Total :".padEnd(29);
      const totalGrossStr = "0".padStart(10);
      const totalDiscStr = totalDisc.toFixed(2).padStart(9);
      const totalRembStr = totalRemb.toFixed(2).padStart(10);
      const totalFinalStr = totalFinal.toFixed(2).padStart(10);
      lines.push(`      ${totalLabel}${totalGrossStr}         ${totalDiscStr}         ${totalRembStr}${totalFinalStr}`);
      lines.push(border);

      lines.push(`Payment Detail (s)`);
      lines.push(`Paymode      : ${patient.payment_mode || 'Cash'}`);
      lines.push("");
      lines.push(`                                                                   Amount: Rs${totalFinal.toFixed(1).padStart(12)}`);
      lines.push(`                                                                   Discount: ${"0.00".padStart(13)}`);
      lines.push(`                                                                   -------------------------`);
      lines.push(`                                                                   Net Amount: Rs${totalFinal.toFixed(1).padStart(10)}`);
      lines.push(border);

      const words = amountToWords(totalFinal).toUpperCase() + " ONLY";
      lines.push(words);
      lines.push(border);
      lines.push(`Created By : ${patient.created_by || 'counter1'}`);
      lines.push("");
      lines.push("                                                                          Signature");
      lines.push("");
      lines.push("                                * PLEASE KEEP YOUR HOSPITAL CLEAN *");
      lines.push("");
      return lines.join("\n");
    }

    let lines = [];
    lines.push("----------------------------------------------------------------");
    lines.push(`D. L. # 4161-4162       SALE BILL (${categoryTitle})       GST # 08AACAB7763Q1Z2`);
    lines.push("----------------------------------------------------------------");
    lines.push("              BITS Consumers Cooperative Stores Ltd.");
    lines.push("                     Pilani - 333031 (Rajasthan)");
    lines.push("----------------------------------------------------------------");
    lines.push(`Bill # : ${invoiceNoForSubBill.padEnd(25)} Date : ${todayStr}`);
    lines.push(`Name   : ${(patient.patient_name || patient.name || '').toUpperCase()}${relationSuffix}`);
    lines.push(`City   : ${city.padEnd(27)} Dr.  : ${doctorName.toUpperCase()}`);
    if (isFacultyStaffOrDependent) {
      lines.push(`Cr     : ${patient.sponsor_name || patient.patient_name || patient.name || ''} - ${patient.sponsor_psrn || patient.primary_psrn_id || patient.institute_id || ''}`);
    }
    lines.push("----------------------------------------------------------------");
    lines.push("SNo  Item                      Rate/Qty   Dis%   Amt    CGST/SGST  Total");
    lines.push("----------------------------------------------------------------");

    subBill.items.forEach((item, i) => {
      const sno = String(i + 1).padEnd(5);
      const name = item.name.substring(0, 24).padEnd(25);

      let rateQty = "";
      if (item.type === 'medicine') {
        rateQty = `${(item.rate || 0).toFixed(2)} (${item.quantity})`;
      } else {
        rateQty = `${(item.gross || 0).toFixed(2)} (1)`;
      }
      rateQty = rateQty.padEnd(11);

      const dis = `${item.discount || 0}%`.padEnd(7);
      const amt = (item.amount || 0).toFixed(2).padEnd(7);
      const gst = `${(item.cgst || 0).toFixed(2)}/${(item.sgst || 0).toFixed(2)}`.padEnd(11);
      const total = (item.item_total || 0).toFixed(2);

      lines.push(`${sno}${name}${rateQty}${dis}${amt}${gst}${total}`);
      if (item.type === 'medicine') {
        lines.push(`     (B: ${item.batch || '611104EC2'}, E: ${item.expiry || '02/31'})`);
      }
    });

    lines.push("----------------------------------------------------------------");
    lines.push(`Round Off: ${(subBill.round_off || 0).toFixed(2).padStart(52)}`);
    lines.push(`Bill Total: Rs. ${(subBill.total_amount || 0).toFixed(2).padStart(49)}`);
    lines.push("----------------------------------------------------------------");
    lines.push(`Total: Rs. ${numberToWords(subBill.total_amount || 0)} Only.`);
    lines.push("----------------------------------------------------------------");
    if (isFaculty) {
      lines.push(`REIMBURSED: Rs. ${(subBill.reimbursed_amount || 0).toFixed(2)} (90%)`);
      lines.push(`SELF PAID (SALARY DEDUCTION): Rs. ${(subBill.self_paid_amount || 0).toFixed(2)} (10%)`);
    } else {
      lines.push(`REIMBURSED: Rs. 0.00 (0%)`);
      lines.push(`SELF PAID (UPI/CASH/CARD): Rs. ${(subBill.self_paid_amount || 0).toFixed(2)} (100%)`);
    }
    lines.push("----------------------------------------------------------------");
    return lines.join("\n");
  };

  let invMed = invoiceNo;
  let invLab = invoiceNo;
  if (invoiceNo.includes(',')) {
    const parts = invoiceNo.split(',');
    invMed = parts[0].trim();
    invLab = parts[1].trim();
  }

  if (medItems.length > 0 && labItems.length > 0) {
    const medBill = getSubBillDetails(medItems);
    const labBill = getSubBillDetails(labItems);
    return [
      formatSingleReceiptText(medBill, "MEDICINES", invMed),
      "\n\n================================================================\n\n",
      formatSingleReceiptText(labBill, "LAB TESTS", invLab)
    ].join("");
  } else {
    return formatSingleReceiptText(bill, medItems.length > 0 ? "MEDICINES" : "LAB TESTS", invoiceNo);
  }
};

export const generateHtmlReceipt = (patient, bill, _logoUrl) => {
  const isFaculty = ['Faculty', 'Staff', 'Dependant'].includes(patient.patient_type || '');
  const relationCodeMap = {
    "Daughter": "D",
    "Son": "S",
    "Spouse": "Spouse",
    "Wife": "W",
    "Husband": "H",
    "Mother": "M",
    "Father": "F",
    "Self": "Self"
  };

  const relation = patient.relation || 'Self';
  const relAbbrev = relationCodeMap[relation] || relation;
  const relationSuffix = isFaculty ? ` (${relAbbrev})` : '';

  const todayStr = new Date(patient.payment_date || new Date()).toLocaleDateString('en-GB').replace(/\//g, '-');
  const invoiceNo = patient.invoice_no || 'INV-DRAFT';
  const city = 'Pilani';
  const doctorName = patient.doctor_name || patient.doctor_assigned || 'Dr. Assigned';

  const medItems = bill.items.filter(item => item.type === 'medicine');
  const labItems = bill.items.filter(item => item.type === 'lab_test');

  const getSubBillDetails = (items) => {
    const total_unrounded = items.reduce((sum, item) => sum + item.item_total, 0);
    const total_rounded = Math.round(total_unrounded);
    const round_off = total_rounded - total_unrounded;

    let reimbursed = 0;
    let self_paid = 0;
    if (isFaculty) {
      reimbursed = parseFloat((total_unrounded * 0.90).toFixed(2));
      self_paid = parseFloat((total_rounded - reimbursed).toFixed(2));
    } else {
      reimbursed = 0;
      self_paid = total_rounded;
    }
    return {
      items,
      unrounded_total: total_unrounded,
      round_off,
      total_amount: total_rounded,
      reimbursed_amount: reimbursed,
      self_paid_amount: self_paid
    };
  };

  const formattedGenderStr = (gender) => {
    const g = (gender || '').toUpperCase();
    if (g === 'M') return 'MALE';
    if (g === 'F') return 'FEMALE';
    return g;
  };

  const formatSingleReceiptHtml = (subBill, categoryTitle, invoiceNoForSubBill) => {
    if (categoryTitle === "LAB TESTS") {
      let totalDisc = 0;
      let totalRemb = 0;
      let totalFinal = 0;

      subBill.items.forEach((item) => {
        const gross = item.gross || 0;
        const discAmt = gross * 0.50;
        const rembAmt = isFaculty ? (gross - discAmt) * 0.90 : 0.00;
        const finalAmt = gross - discAmt - rembAmt;

        totalDisc += discAmt;
        totalRemb += rembAmt;
        totalFinal += finalAmt;
      });

      const pDate = patient.payment_date ? new Date(patient.payment_date) : new Date();
      const formattedDateShort = formatDateIST_Short(pDate);
      const formattedDateTime12HStr = formatDateTime12H(pDate);
      const paymentNoVal = getPaymentNo(patient, invoiceNoForSubBill);
      const docNameVal = (patient.doctor_name || patient.doctor_assigned || 'DR. ASSIGNED').toUpperCase();

      let itemsHtml = '';
      subBill.items.forEach((item, i) => {
        const gross = item.gross || 0;
        const discPerc = 50.00;
        const discAmt = gross * 0.50;
        const rembPerc = isFaculty ? 90.00 : 0.00;
        const rembAmt = isFaculty ? (gross - discAmt) * 0.90 : 0.00;
        const finalAmt = gross - discAmt - rembAmt;

        itemsHtml += `
          <tr style="font-family: monospace; font-size: 9px;">
            <td style="padding: 4px 2px; text-align: left; border-bottom: 1px solid #eee; font-size: 9px;">${i + 1}</td>
            <td style="padding: 4px 2px; text-align: left; text-transform: uppercase; border-bottom: 1px solid #eee; font-weight: bold; font-size: 9px;">${item.name}</td>
            <td style="padding: 4px 2px; text-align: right; border-bottom: 1px solid #eee; font-size: 9px;">${gross.toFixed(2)}</td>
            <td style="padding: 4px 2px; text-align: right; border-bottom: 1px solid #eee; font-size: 9px;">${discPerc.toFixed(2)}</td>
            <td style="padding: 4px 2px; text-align: right; border-bottom: 1px solid #eee; font-size: 9px;">${discAmt.toFixed(2)}</td>
            <td style="padding: 4px 2px; text-align: right; border-bottom: 1px solid #eee; font-size: 9px;">${rembPerc.toFixed(2)}</td>
            <td style="padding: 4px 2px; text-align: right; border-bottom: 1px solid #eee; font-size: 9px;">${rembAmt.toFixed(2)}</td>
            <td style="padding: 4px 2px; text-align: right; border-bottom: 1px solid #eee; font-weight: bold; font-size: 9px;">${finalAmt.toFixed(2)}</td>
          </tr>
        `;
      });

      return `
        <div style="font-family: monospace, Arial, sans-serif; max-width: 600px; margin: 10px auto; padding: 20px; border: 2px double #000; background-color: #fff; color: #000; font-size: 11px; line-height: 1.4; box-sizing: border-box;">
          <div style="text-align: center; margin-bottom: 10px;">
            <div style="text-align: center;">
              <div style="font-weight: bold; font-size: 14px; font-family: monospace, Arial, sans-serif;">Birla Institute of Technology & Science</div>
              <div style="font-weight: bold; font-size: 11px; font-family: monospace, Arial, sans-serif; letter-spacing: 1px; margin-top: 2px;">MEDICAL CENTRE</div>
              <div style="font-size: 9px; font-family: monospace, Arial, sans-serif; margin-top: 1px;">Vidya Vihar, Pilani, RAJASTHAN</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 9px; font-family: monospace, Arial, sans-serif; border-top: 1px dashed gray; padding-top: 4px; margin-top: 5px;">
            <tr>
              <td style="text-align: left; width: 50%; font-family: monospace, Arial, sans-serif;">Contact No.: 01596-515525 / Fax: 01596-244183</td>
              <td style="text-align: right; width: 50%; font-family: monospace, Arial, sans-serif;">Date: ${formattedDateShort}</td>
            </tr>
          </table>
          <table style="width: 100%; border-collapse: collapse; font-size: 9px; font-family: monospace, Arial, sans-serif; border-bottom: 1px dashed gray; padding-bottom: 4px; margin-bottom: 10px;">
            <tr>
              <td style="text-align: left; width: 50%; font-family: monospace, Arial, sans-serif;">E-Mail : medc@pilani.bits-pilani.ac.in</td>
              <td style="text-align: right; width: 50%; font-family: monospace, Arial, sans-serif;">WebSite : www.bits-pilani.ac.in</td>
            </tr>
          </table>

          <div style="text-align: center; font-weight: bold; font-size: 12px; margin: 10px 0;">* PAYMENT RECEIPT *</div>

          <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; border-top: 1px solid black; border-bottom: 1px solid black; padding: 5px 0;">
            <tr>
              <td style="width: 20%; padding: 2px 0;"><strong>Invoice No.</strong></td>
              <td style="width: 30%; padding: 2px 0;">: ${invoiceNoForSubBill}</td>
              <td style="width: 20%; padding: 2px 0;"><strong>Date/Time</strong></td>
              <td style="width: 30%; padding: 2px 0;">: ${formattedDateTime12HStr}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0;"><strong>UHID</strong></td>
              <td style="padding: 2px 0;">: ${patient.uhid_no || patient.institute_id || ''}</td>
              <td style="padding: 2px 0;"><strong>Age/Gender</strong></td>
              <td style="padding: 2px 0;">: ${calculateAge(patient.age || patient.date_of_birth)}Yr / ${formattedGenderStr(patient.gender)}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0;"><strong>Patient</strong></td>
              <td style="padding: 2px 0;">: ${(patient.patient_name || patient.name || '').toUpperCase()}</td>
              <td style="padding: 2px 0;"><strong>PSRN/ID No</strong></td>
              <td style="padding: 2px 0;">: ${patient.institute_id || ''}</td>
            </tr>
            <tr>
              <td style="padding: 2px 0;"><strong>Payment No.</strong></td>
              <td style="padding: 2px 0;">: ${paymentNoVal}</td>
              <td style="padding: 2px 0;"><strong>Ref. Doctor</strong></td>
              <td style="padding: 2px 0;">: ${docNameVal}</td>
            </tr>
          </table>

          <table style="width: 100%; border-collapse: collapse; font-size: 9px; margin-top: 5px;">
            <thead>
              <tr style="border-top: 1px solid black; border-bottom: 1px solid black; font-weight: bold;">
                <th style="padding: 4px 2px; text-align: left; font-size: 8px; width: 5%;">S.No.</th>
                <th style="padding: 4px 2px; text-align: left; font-size: 8px; width: 25%;">Service</th>
                <th style="padding: 4px 2px; text-align: right; font-size: 8px; width: 12%;">Gross</th>
                <th style="padding: 4px 2px; text-align: right; font-size: 8px; width: 11%;">Disc%</th>
                <th style="padding: 4px 2px; text-align: right; font-size: 8px; width: 11%;">Disc</th>
                <th style="padding: 4px 2px; text-align: right; font-size: 8px; width: 12%;">Remb%</th>
                <th style="padding: 4px 2px; text-align: right; font-size: 8px; width: 12%;">Remb</th>
                <th style="padding: 4px 2px; text-align: right; font-size: 8px; width: 12%;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr style="border-top: 1px solid black; border-bottom: 1px solid black; font-weight: bold; font-size: 9px;">
                <td colspan="2" style="padding: 4px 2px;">Total :</td>
                <td style="padding: 4px 2px; text-align: right;">0</td>
                <td></td>
                <td style="padding: 4px 2px; text-align: right;">${totalDisc.toFixed(2)}</td>
                <td></td>
                <td style="padding: 4px 2px; text-align: right;">${totalRemb.toFixed(2)}</td>
                <td style="padding: 4px 2px; text-align: right;">${totalFinal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <table style="width: 100%; font-size: 9px; margin-top: 10px; border-collapse: collapse;">
            <tr>
              <td style="width: 60%; vertical-align: top; text-align: left;">
                <strong>Payment Detail (s)</strong><br/>
                Paymode &nbsp; &nbsp; &nbsp; &nbsp; : ${patient.payment_mode || 'Cash'}
              </td>
              <td style="width: 40%; vertical-align: top; text-align: right;">
                <table style="width: 100%; border-collapse: collapse; float: right;">
                  <tr style="font-weight: bold;">
                    <td style="text-align: right; padding: 2px 0;">Amount: Rs</td>
                    <td style="text-align: right; width: 45%; padding: 2px 0;">${totalFinal.toFixed(1)}</td>
                  </tr>
                  <tr>
                    <td style="text-align: right; padding: 2px 0;">Discount:</td>
                    <td style="text-align: right; padding: 2px 0;">0.00</td>
                  </tr>
                  <tr style="font-weight: bold; border-top: 1px solid #000; border-bottom: 2px double #000;">
                    <td style="text-align: right; padding: 2px 0;">Net Amount: Rs</td>
                    <td style="text-align: right; padding: 2px 0;">${totalFinal.toFixed(1)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <div style="font-weight: bold; text-transform: uppercase; margin-top: 15px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; font-size: 9px; text-align: left;">
            ${amountToWords(totalFinal).toUpperCase()} ONLY
          </div>

          <div style="font-size: 9px; margin-top: 5px; text-align: left;">
            Created By : ${patient.created_by || 'counter1'}
          </div>

          <div style="text-align: right; margin-top: 15px; font-size: 9px;">
            <span style="border-top: 1px dashed #000; padding-top: 4px; display: inline-block; width: 100px; text-align: center;">Authorised Signature</span>
          </div>

          <div style="text-align: center; margin-top: 20px; font-weight: bold; font-size: 9px; letter-spacing: 0.5px;">
            * PLEASE KEEP YOUR HOSPITAL CLEAN *
          </div>

          <div style="text-align: right; font-size: 9px; margin-top: 5px;">
            Page 1 of 1
          </div>
        </div>
      `;
    } else {
      let itemsHtml = '';
      subBill.items.forEach((item, i) => {
        let nameAndBatchHtml = `<div style="font-weight: bold;">${toTitleCase(item.name)}</div>`;
        if (item.type === 'medicine') {
          nameAndBatchHtml += `<div style="font-size: 9px; color: #555;">B - ${item.batch || '611104EC2'}, E - ${item.expiry || '02/31'}</div>`;
        }

        let rateQtyHtml = '';
        if (item.type === 'medicine') {
          rateQtyHtml = `<div>${(item.rate || 0).toFixed(2)}</div><div style="font-size: 9px; color: #555;">(${item.quantity || 1})</div>`;
        } else {
          rateQtyHtml = `<div>${(item.gross || 0).toFixed(2)}</div><div style="font-size: 9px; color: #555;">(1)</div>`;
        }

        let gstHtml = `<div>${(item.cgst || 0).toFixed(2)}</div><div>${(item.sgst || 0).toFixed(2)}</div>`;

        itemsHtml += `
          <tr style="font-family: monospace; font-size: 11px;">
            <td style="padding: 4px 2px; text-align: center; border-bottom: 1px dashed #ccc;">${i + 1}</td>
            <td style="padding: 4px 2px; text-align: left; border-bottom: 1px dashed #ccc;">${nameAndBatchHtml}</td>
            <td style="padding: 4px 2px; text-align: center; border-bottom: 1px dashed #ccc;">${rateQtyHtml}</td>
            <td style="padding: 4px 2px; text-align: center; border-bottom: 1px dashed #ccc;">${item.discount || 0}%</td>
            <td style="padding: 4px 2px; text-align: center; border-bottom: 1px dashed #ccc;">${(item.amount || 0).toFixed(2)}</td>
            <td style="padding: 4px 2px; text-align: center; border-bottom: 1px dashed #ccc;">${gstHtml}</td>
            <td style="padding: 4px 2px; text-align: right; font-weight: bold; border-bottom: 1px dashed #ccc;">${(item.item_total || 0).toFixed(2)}</td>
          </tr>
        `;
      });

      const isFacultyStaffOrDependent = ['Faculty', 'Staff', 'Dependant'].includes(patient.patient_type || '');
      let sponsorLineHtml = '';
      if (isFacultyStaffOrDependent) {
        sponsorLineHtml = `<tr style="font-size: 11px;"><td colspan="2"><strong>Cr :</strong> ${patient.sponsor_name || patient.patient_name || patient.name || ''} - ${patient.sponsor_psrn || patient.primary_psrn_id || patient.institute_id || ''}</td></tr>`;
      }

      return `
        <div style="font-family: monospace, Arial, sans-serif; max-width: 600px; margin: 10px auto; padding: 20px; border: 2px double #000; background-color: #fff; color: #000; font-size: 11px; line-height: 1.4; box-sizing: border-box;">
          <table style="width: 100%; border-collapse: collapse; font-size: 9px; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 5px;">
            <tr>
              <td style="width: 30%; text-align: left;">D. L. # 4161-4162</td>
              <td style="width: 40%; text-align: center; font-weight: bold; text-decoration: underline; font-size: 11px;">SALE BILL</td>
              <td style="width: 30%; text-align: right;">GST # 08AACAB7763Q1Z2</td>
            </tr>
          </table>

          <div style="text-align: center; margin-bottom: 5px;">
            <div style="font-weight: bold; font-size: 13px;">BITS Consumers Cooperative Stores Ltd.</div>
            <div style="font-size: 11px;">Pilani - 333031 (Rajasthan)</div>
          </div>
          <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>

          <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 5px;">
            <tr>
              <td style="width: 50%;"><strong>Bill # :</strong> ${invoiceNoForSubBill}</td>
              <td style="text-align: right; width: 50%;"><strong>Date :</strong> ${todayStr}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Name :</strong> ${toTitleCase(patient.patient_name || patient.name || '')}${relationSuffix}, City : ${city}</td>
            </tr>
            ${sponsorLineHtml}
            <tr>
              <td colspan="2"><strong>Dr. :</strong> ${toTitleCase(doctorName).toUpperCase()}</td>
            </tr>
          </table>

          <!-- Items Table -->
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 5px;">
            <thead>
              <tr style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-weight: bold;">
                <th style="width: 8%; padding: 4px 2px;">SNo</th>
                <th style="text-align: left; width: 42%; padding: 4px 2px;">Item</th>
                <th style="width: 15%; padding: 4px 2px;">Rate<br/>Qty.</th>
                <th style="width: 8%; padding: 4px 2px;">Dis</th>
                <th style="width: 10%; padding: 4px 2px;">Amt.</th>
                <th style="width: 10%; padding: 4px 2px;">CGST<br/>SGST</th>
                <th style="text-align: right; width: 7%; padding: 4px 2px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-weight: bold;">
                <td></td>
                <td style="text-align: left;">Total</td>
                <td></td>
                <td></td>
                <td style="text-align: center;">${(subBill.items || []).reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}</td>
                <td style="text-align: center;">
                  <div>${(subBill.items || []).reduce((sum, item) => sum + (item.cgst || 0), 0).toFixed(2)}</div>
                  <div>${(subBill.items || []).reduce((sum, item) => sum + (item.sgst || 0), 0).toFixed(2)}</div>
                </td>
                <td style="text-align: right;">${(subBill.unrounded_total || subBill.total_amount || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <table style="width: 100%; font-size: 11px; margin-top: 5px; border-collapse: collapse;">
            <tr>
              <td>Round Off :</td>
              <td style="text-align: right; font-weight: bold;">${(subBill.round_off || 0).toFixed(2)}</td>
            </tr>
            <tr style="font-size: 12px; font-weight: bold;">
              <td>Bill Total :</td>
              <td style="text-align: right; border-bottom: 2px double #000; padding: 2px 0;">Rs. ${(subBill.total_amount || 0).toFixed(2)}</td>
            </tr>
          </table>

          <div style="margin: 6px 0; font-weight: bold; text-transform: uppercase;">
            Total : Rs. ${numberToWords(subBill.total_amount || 0)} Only.
          </div>

          <div style="border: 1px solid #000; padding: 5px; margin: 6px 0; font-size: 10px; font-weight: bold;">
            ${isFaculty ? `
              REIMBURSED: Rs. ${(subBill.reimbursed_amount || 0).toFixed(2)} (90%)<br/>
              SELF PAID (SALARY DEDUCTION): Rs. ${(subBill.self_paid_amount || 0).toFixed(2)} (10%)
            ` : `
              REIMBURSED: Rs. 0.00 (0%)<br/>
              SELF PAID (UPI/CASH/CARD): Rs. ${(subBill.self_paid_amount || 0).toFixed(2)} (100%)
            `}
          </div>

          <div style="font-size: 9px; text-align: right; margin-top: 10px; border-top: 1px dashed #000; padding-top: 4px;">
            ${todayStr} - contact@bitscoop.in (${new Date().toLocaleTimeString('en-GB')})
          </div>

          <table style="width: 100%; margin-top: 20px; font-size: 10px; border-collapse: collapse;">
            <tr>
              <td style="text-align: left; width: 50%;"></td>
              <td style="text-align: right; width: 50%;">Authorised Signature</td>
            </tr>
          </table>
        </div>
      `;
    }
  };

  let invMed = invoiceNo;
  let invLab = invoiceNo;
  if (invoiceNo.includes(',')) {
    const parts = invoiceNo.split(',');
    invMed = parts[0].trim();
    invLab = parts[1].trim();
  }

  let content = '';

  if (medItems.length > 0 && labItems.length > 0) {
    const medBill = getSubBillDetails(medItems);
    const labBill = getSubBillDetails(labItems);
    content = `
      ${formatSingleReceiptHtml(medBill, "MEDICINES", invMed)}
      <div style="text-align: center; margin: 20px 0; color: #888;">--------------------------------------------------</div>
      ${formatSingleReceiptHtml(labBill, "LAB TESTS", invLab)}
    `;
  } else {
    content = formatSingleReceiptHtml(getSubBillDetails(bill.items), medItems.length > 0 ? "MEDICINES" : "LAB TESTS", invoiceNo);
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Sale Bill Receipt</title>
      </head>
      <body style="background-color: #f7f9fa; padding: 20px; margin: 0; font-family: monospace, Arial, sans-serif;">
        <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e1e8ed;">
          <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333333; margin-bottom: 20px;">
            Dear ${toTitleCase(patient.patient_name || patient.name || '')},<br/><br/>
            Please find below the sale bill receipt for your recent visit to the BITS Pilani Medical Centre.
          </div>
          
          ${content}
          
          <div style="font-family: Arial, sans-serif; font-size: 13px; color: #666666; margin-top: 25px; border-top: 1px solid #e1e8ed; padding-top: 15px;">
            Best regards,<br/>
            <strong>Medical Centre Team</strong><br/>
            BITS Pilani
          </div>
        </div>
      </body>
    </html>
  `;
};
