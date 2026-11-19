export interface UtilityCompany {
  id: string;
  name: string;
  category: 'Electricity' | 'Gas' | 'Internet / Landline';
  inputLabel: string;
  placeholder: string;
  getBillUrl: (ref: string) => string;
}

export const PAK_UTILITY_COMPANIES: UtilityCompany[] = [
  // Electricity (WAPDA DISCOs + K-Electric)
  {
    id: 'FESCO',
    name: 'FESCO (Faisalabad / Sargodha)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 01134620074301',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/fescobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'LESCO',
    name: 'LESCO (Lahore)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 12111111234567',
    getBillUrl: (ref) => `https://www.lesco.gov.pk:36269/Modules/CustomerBillN/CheckBill.asp?nBatchNo=${encodeURIComponent(ref.slice(0, 2))}&nSubDiv=${encodeURIComponent(ref.slice(2, 7))}&nRefNo=${encodeURIComponent(ref.slice(7, 14))}&strRU=U`,
  },
  {
    id: 'MEPCO',
    name: 'MEPCO (Multan)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 14151111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/mepcobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'GEPCO',
    name: 'GEPCO (Gujranwala)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 08121111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/gepcobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'IESCO',
    name: 'IESCO (Islamabad / Rawalpindi)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 04141111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/iescobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'PESCO',
    name: 'PESCO (Peshawar)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 26261111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/pescobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'HESCO',
    name: 'HESCO (Hyderabad)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 37371111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/hescobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'SEPCO',
    name: 'SEPCO (Sukkur)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 38381111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/sepcobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'QESCO',
    name: 'QESCO (Quetta)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 48481111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/qescobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'TESCO',
    name: 'TESCO (Tribal Areas)',
    category: 'Electricity',
    inputLabel: '14-Digit Reference Number',
    placeholder: 'e.g. 27271111234567',
    getBillUrl: (ref) => `https://bill.pitc.com.pk/tescobill/general?refno=${encodeURIComponent(ref)}`,
  },
  {
    id: 'KE',
    name: 'K-Electric (Karachi)',
    category: 'Electricity',
    inputLabel: '13-Digit Account Number',
    placeholder: 'e.g. 0400012345678',
    getBillUrl: () => `https://staging.ke.com.pk:24555/`,
  },

  // Gas
  {
    id: 'SNGPL',
    name: 'SNGPL (Sui Northern Gas)',
    category: 'Gas',
    inputLabel: '11-Digit Account ID',
    placeholder: 'e.g. 12345678901',
    getBillUrl: (ref) => `https://www.sngpl.com.pk/login.jsp?mdids=85&consumer=${encodeURIComponent(ref)}`,
  },
  {
    id: 'SSGC',
    name: 'SSGC (Sui Southern Gas)',
    category: 'Gas',
    inputLabel: '10-Digit Customer Number',
    placeholder: 'e.g. 1234567890',
    getBillUrl: () => `https://viewbill.ssgc.com.pk/web/`,
  },

  // Internet / Landline
  {
    id: 'PTCL',
    name: 'PTCL (Landline / Broadband)',
    category: 'Internet / Landline',
    inputLabel: '10-Digit Account ID',
    placeholder: 'e.g. 1234567890',
    getBillUrl: () => `https://dbill.ptcl.net.pk/PTCLSearchInvoice.aspx`,
  },
];
    
