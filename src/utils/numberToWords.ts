// Helper utility to convert numeric currency values into formal Indian Rupee words

export function numberToIndianWords(num: number): string {
  if (isNaN(num) || num < 0) return 'Zero Rupees Only';
  if (num === 0) return 'Zero Rupees Only';

  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const double = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanThousand = (n: number): string => {
    let str = '';
    if (n >= 100) {
      str += single[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 10 && n <= 19) {
      str += double[n - 10] + ' ';
    } else {
      if (n >= 20) {
        str += tens[Math.floor(n / 10)] + ' ';
        n %= 10;
      }
      if (n > 0) {
        str += single[n] + ' ';
      }
    }
    return str;
  };

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let result = '';

  if (rupees === 0) {
    result = 'Zero';
  } else {
    let temp = rupees;
    const crore = Math.floor(temp / 10000000);
    temp %= 10000000;

    const lakh = Math.floor(temp / 100000);
    temp %= 100000;

    const thousand = Math.floor(temp / 1000);
    temp %= 1000;

    const remainder = temp;

    if (crore > 0) {
      result += convertLessThanThousand(crore) + 'Crore ';
    }
    if (lakh > 0) {
      result += convertLessThanThousand(lakh) + 'Lakh ';
    }
    if (thousand > 0) {
      result += convertLessThanThousand(thousand) + 'Thousand ';
    }
    if (remainder > 0) {
      result += convertLessThanThousand(remainder);
    }
  }

  result = result.trim() + ' Rupees';

  if (paise > 0) {
    result += ' and ' + convertLessThanThousand(paise).trim() + ' Paise';
  }

  return result + ' Only';
}
