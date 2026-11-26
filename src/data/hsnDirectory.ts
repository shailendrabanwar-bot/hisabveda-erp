export interface HsnItem {
  code: string;
  name: string;
  category: string;
  gstRate: number; // 0, 3, 5, 12, 18, 28
  keywords: string[];
}

export const PAN_INDIA_HSN_DIRECTORY: HsnItem[] = [
  // --- Electronics & IT Hardware ---
  { code: '8471', name: 'Laptops, Desktop Computers, Printers & Peripherals', category: 'Electronics & IT', gstRate: 18, keywords: ['laptop', 'computer', 'desktop', 'printer', 'mouse', 'keyboard', 'monitor', 'cpu', 'ssd', 'ram', 'scanner', 'hard drive', 'motherboard', 'it'] },
  { code: '8517', name: 'Mobile Phones, Smartphones, Routers & Modems', category: 'Electronics & IT', gstRate: 18, keywords: ['mobile', 'phone', 'cellphone', 'smartphone', 'router', 'modem', 'charger', 'usb cable', 'sim', 'telephone', 'telecom', 'earphones', 'headphone'] },
  { code: '8528', name: 'Monitors, Smart TVs & Digital Projectors', category: 'Electronics & IT', gstRate: 18, keywords: ['tv', 'television', 'smart tv', 'monitor', 'display', 'projector', 'led tv', 'lcd'] },
  { code: '8518', name: 'Speakers, Amplifiers, Microphones & Soundbars', category: 'Electronics & IT', gstRate: 18, keywords: ['speaker', 'audio', 'soundbar', 'amplifier', 'mic', 'microphone', 'bluetooth speaker', 'home theatre'] },
  { code: '8525', name: 'CCTV Cameras, Surveillance Equipment & Digital Cameras', category: 'Electronics & IT', gstRate: 18, keywords: ['cctv', 'camera', 'surveillance', 'dvr', 'nvr', 'security camera', 'dji'] },

  // --- Electricals & Power ---
  { code: '8544', name: 'Insulated Copper & Aluminium Wires & Cables', category: 'Electricals & Power', gstRate: 18, keywords: ['wire', 'cable', 'copper wire', 'aluminium wire', 'wiring', 'cord', 'polycab', 'havells', 'finolex'] },
  { code: '8504', name: 'Electric Inverters, UPS, Transformers & Adaptors', category: 'Electricals & Power', gstRate: 18, keywords: ['ups', 'inverter', 'transformer', 'adaptor', 'power supply', 'stabilizer', 'battery charger'] },
  { code: '8507', name: 'Lead-Acid Storage Batteries for Inverters & Vehicles', category: 'Electricals & Power', gstRate: 28, keywords: ['battery', 'accumulator', 'lead acid', 'car battery', 'inverter battery', 'exide', 'luminous'] },
  { code: '8536', name: 'Electrical Switches, Plugs, Sockets, MCBs & Fuse', category: 'Electricals & Power', gstRate: 18, keywords: ['switch', 'mcb', 'socket', 'plug', 'circuit breaker', 'switchboard', 'fuse', 'anchor', 'modular switch'] },
  { code: '8539', name: 'LED Bulbs, Tube Lights, Panel Lights & Fixtures', category: 'Electricals & Power', gstRate: 18, keywords: ['light', 'bulb', 'led', 'tubelight', 'fixture', 'lamp', 'panel light', 'flood light', 'philips'] },

  // --- Textiles, Fabrics & Garments ---
  { code: '6109', name: 'Cotton T-Shirts, Shirts & Vests (<1000 Value 5%, Else 12%)', category: 'Textiles & Garments', gstRate: 5, keywords: ['tshirt', 't-shirt', 'shirt', 'cotton shirt', 'vest', 'top', 'polyester shirt'] },
  { code: '6203', name: 'Men Trousers, Suits, Jeans, Formal Pants & Shorts', category: 'Textiles & Garments', gstRate: 12, keywords: ['pant', 'trouser', 'jeans', 'suit', 'shorts', 'menswear', 'cargo', 'denim'] },
  { code: '6204', name: 'Women Dresses, Sarees, Kurties, Lehengas & Suits', category: 'Textiles & Garments', gstRate: 12, keywords: ['saree', 'dress', 'skirt', 'kurti', 'lehenga', 'ladies wear', 'suit', 'dupatta', 'salwar'] },
  { code: '5208', name: 'Woven Cotton Fabrics, Cloth Rolls & Unstitched Material', category: 'Textiles & Garments', gstRate: 5, keywords: ['fabric', 'cloth', 'cotton cloth', 'than', 'weaving', 'textile', 'unstitched'] },
  { code: '6302', name: 'Bed Sheets, Blankets, Curtains, Towels & Quilts', category: 'Textiles & Garments', gstRate: 12, keywords: ['towel', 'bedsheet', 'blanket', 'curtain', 'linen', 'pillow cover', 'quilt', 'gadda'] },
  { code: '6403', name: 'Footwear, Shoes, Sandals, Leather Boots & Slippers', category: 'Textiles & Garments', gstRate: 12, keywords: ['shoe', 'shoes', 'footwear', 'sandal', 'chappal', 'boot', 'sneakers', 'leather shoes'] },

  // --- FMCG, Groceries, Food & Agriculture ---
  { code: '1006', name: 'Rice, Basmati Rice, Paddy Grains & Poha', category: 'FMCG & Groceries', gstRate: 5, keywords: ['rice', 'basmati', 'chawal', 'paddy', 'grain', 'poha', 'murmura'] },
  { code: '1101', name: 'Wheat Flour (Atta), Maida, Suji & Besan', category: 'FMCG & Groceries', gstRate: 5, keywords: ['atta', 'wheat', 'flour', 'maida', 'suji', 'besan', 'gehun'] },
  { code: '0401', name: 'Fresh Milk, Curd (Dahi) & Lassi (Unbranded)', category: 'Dairy & Beverages', gstRate: 0, keywords: ['milk', 'doodh', 'cream', 'fresh milk', 'curd', 'dahi', 'lassi', 'dairy'] },
  { code: '0402', name: 'Desi Ghee, Butter, Paneer & Milk Powder', category: 'Dairy & Beverages', gstRate: 12, keywords: ['butter', 'ghee', 'milk powder', 'paneer', 'cheese', 'amul ghee', 'butter'] },
  { code: '0902', name: 'Tea Leaves, CTC Tea Packets & Green Tea', category: 'FMCG & Groceries', gstRate: 5, keywords: ['tea', 'chai', 'green tea', 'tea packet', 'tata tea', 'red label'] },
  { code: '0901', name: 'Coffee Powder & Roasted Coffee Beans', category: 'FMCG & Groceries', gstRate: 5, keywords: ['coffee', 'nescafe', 'espresso', 'bru'] },
  { code: '1701', name: 'Refined Sugar, Gur (Jaggery) & Mishri', category: 'FMCG & Groceries', gstRate: 5, keywords: ['sugar', 'cheeni', 'sugar powder', 'jaggery', 'gur', 'sugar cube'] },
  { code: '1512', name: 'Edible Cooking Oils (Mustard, Sunflower, Soyabean, Palm)', category: 'FMCG & Groceries', gstRate: 5, keywords: ['oil', 'mustard oil', 'cooking oil', 'refined oil', 'sunflower oil', 'fortune oil', 'mustard', 'soyabean oil', 'तेल'] },
  { code: '1905', name: 'Biscuits, Bakery Bread, Cakes, Wafers & Rusks', category: 'FMCG & Groceries', gstRate: 18, keywords: ['biscuit', 'bread', 'cake', 'cookie', 'toast', 'rusk', 'wafer', 'parle', 'britannia'] },
  { code: '2106', name: 'Namkeen, Potato Chips, Masala Spices & Snacks', category: 'FMCG & Groceries', gstRate: 12, keywords: ['namkeen', 'snacks', 'chips', 'spice', 'masala', 'haldiram', 'lays', 'turmeric', 'chilli powder'] },
  { code: '2202', name: 'Cold Drinks, Carbonated Beverages, Mineral Water & Juices', category: 'Dairy & Beverages', gstRate: 28, keywords: ['cold drink', 'pepsi', 'coca cola', 'sprite', 'mineral water', 'bisleri', 'juice', 'soda'] },

  // --- Construction, Tiles, Building Materials ---
  { code: '2523', name: 'Portland Cement, Slag Cement & White Cement', category: 'Construction Materials', gstRate: 28, keywords: ['cement', 'ultratech', 'acc', 'ambuja', 'concrete', 'birla cement', 'white cement'] },
  { code: '7210', name: 'TMT Bars, Steel Rods, Iron Sheets & Structural Steel', category: 'Steel & Metals', gstRate: 18, keywords: ['steel', 'iron', 'tmt', 'rod', 'sheet', 'saria', 'pipe', 'angle', 'tata tiscon', 'jindal steel'] },
  { code: '6802', name: 'Granite Slabs, Marble Tiles & Natural Stones', category: 'Tiles & Building Stones', gstRate: 18, keywords: ['granite', 'marble', 'tile', 'stone', 'flooring', 'slab', 'kota stone'] },
  { code: '6907', name: 'Ceramic Vitrified Flooring Tiles & Wall Tiles', category: 'Tiles & Building Stones', gstRate: 18, keywords: ['ceramic', 'vitrified', 'wall tile', 'floor tile', 'kajaria', 'somany'] },
  { code: '3209', name: 'Wall Paints, Enamels, Emulsions, Varnishes & Putty', category: 'Hardware & Chemicals', gstRate: 18, keywords: ['paint', 'emulsion', 'varnish', 'putty', 'asian paints', 'berger', 'primer', 'distemper', 'distemper paint'] },
  { code: '4412', name: 'Plywood, Blockboards, Veneers & Flush Doors', category: 'Wood & Furniture', gstRate: 18, keywords: ['plywood', 'ply', 'board', 'door', 'flush door', 'veneer', 'laminate', 'sunmica'] },

  // --- Hardware, Plumbing & Tools ---
  { code: '7318', name: 'Screws, Bolts, Nuts, Rivets, Fasteners & Washers', category: 'Hardware & Tools', gstRate: 18, keywords: ['screw', 'bolt', 'nut', 'fastener', 'hardware', 'nail', 'washer', 'anchor bolt'] },
  { code: '8481', name: 'Plumbing Taps, Faucets, Valves & Pipe Fittings', category: 'Hardware & Plumbing', gstRate: 18, keywords: ['tap', 'valve', 'faucet', 'plumbing', 'pipe fitting', 'shower', 'jaquar', 'cpvc', 'pvc pipe'] },
  { code: '8205', name: 'Hand Tools (Pliers, Hammers, Screwdrivers, Wrenches)', category: 'Hardware & Tools', gstRate: 18, keywords: ['tool', 'pliers', 'hammer', 'screwdriver', 'wrench', 'spanner', 'cutting pliers', 'taparia'] },
  { code: '8207', name: 'Drill Bits, Saw Blades, Cutting Wheels & Power Tool Accessories', category: 'Hardware & Tools', gstRate: 18, keywords: ['drill bit', 'saw blade', 'cutter wheel', 'grinding wheel', 'power tool', 'bosch'] },

  // --- Home Appliances & Machinery ---
  { code: '8415', name: 'Air Conditioners (Split & Window) & Industrial Chillers', category: 'Home Appliances', gstRate: 28, keywords: ['ac', 'air conditioner', 'split ac', 'window ac', 'chiller', 'voltas', 'daikin', 'blue star'] },
  { code: '8418', name: 'Refrigerators, Deep Freezers & Cold Cabinets', category: 'Home Appliances', gstRate: 18, keywords: ['fridge', 'refrigerator', 'freezer', 'deep fridge', 'lg fridge', 'samsung fridge'] },
  { code: '8450', name: 'Washing Machines & Dryers', category: 'Home Appliances', gstRate: 18, keywords: ['washing machine', 'dryer', 'laundry', 'fully automatic', 'semi automatic'] },
  { code: '8414', name: 'Ceiling Fans, Exhaust Fans, Water Pumps & Coolers', category: 'Home Appliances', gstRate: 18, keywords: ['fan', 'ceiling fan', 'pump', 'water pump', 'cooler', 'compressor', 'crompton', 'orient'] },

  // --- Automobiles, Two-Wheelers & Spare Parts ---
  { code: '8708', name: 'Automobile Spare Parts, Brakes, Clutch, Filters & Gears', category: 'Automobiles & Auto Parts', gstRate: 28, keywords: ['auto part', 'car part', 'brake', 'filter', 'gear', 'clutch', 'suspension', 'headlight', 'bumper'] },
  { code: '4011', name: 'Rubber Tyres & Tubes for Bikes, Cars, Trucks & Tractors', category: 'Automobiles & Auto Parts', gstRate: 28, keywords: ['tyre', 'tire', 'tube', 'rubber tyre', 'mrf tyre', 'apollo tyre', 'ceat'] },
  { code: '8711', name: 'Two Wheelers, Motorcycles, Scooters & Electric Scooters', category: 'Automobiles & Auto Parts', gstRate: 28, keywords: ['bike', 'motorcycle', 'scooter', 'two wheeler', 'ev scooter', 'activa', 'hero bike'] },

  // --- Pharmaceuticals & Medical ---
  { code: '3004', name: 'Medicines, Tablets, Syrups, Capsules & Injections', category: 'Pharmaceuticals & Medical', gstRate: 12, keywords: ['medicine', 'tablet', 'capsule', 'syrup', 'pharma', 'injection', 'drug', 'paracetamol', 'antibiotic'] },
  { code: '9018', name: 'Medical Instruments, Syringes, BP Monitors & Surgical Items', category: 'Pharmaceuticals & Medical', gstRate: 12, keywords: ['medical', 'surgical', 'syringe', 'thermometer', 'bp monitor', 'stethoscope', 'mask', 'gloves'] },
  { code: '3808', name: 'Disinfectants, Sanitizers, Phenyl & Mosquito Repellents', category: 'Chemicals & Cleaning', gstRate: 18, keywords: ['sanitizer', 'disinfectant', 'phenyl', 'mosquito repellent', 'pesticide', 'lizol', 'dettol'] },

  // --- Stationery, Books & Paper ---
  { code: '4802', name: 'A4 Printing Paper, Copier Paper & Reams', category: 'Stationery & Paper', gstRate: 12, keywords: ['paper', 'a4 paper', 'copier paper', 'printing paper', 'ream', 'jk copier'] },
  { code: '4820', name: 'Notebooks, Registers, Diaries, Files & Accounting Registers', category: 'Stationery & Paper', gstRate: 12, keywords: ['notebook', 'register', 'diary', 'file', 'folder', 'account book', 'bill book'] },
  { code: '9608', name: 'Ballpoint Pens, Gel Pens, Markers, Pencils & Highlighters', category: 'Stationery & Paper', gstRate: 12, keywords: ['pen', 'marker', 'ballpen', 'gel pen', 'pencil', 'highlighter', 'reynolds', 'cello'] },

  // --- Jewelry, Furniture & Misc Goods ---
  { code: '7113', name: 'Gold, Silver & Diamond Jewellery (GST 3%)', category: 'Jewellery & Precious', gstRate: 3, keywords: ['gold', 'silver', 'jewelry', 'jewellery', 'diamond', 'ring', 'chain', 'necklace', 'payal'] },
  { code: '9403', name: 'Wooden, Steel & Plastic Furniture (Chairs, Tables, Almirahs, Beds)', category: 'Wood & Furniture', gstRate: 18, keywords: ['furniture', 'table', 'chair', 'desk', 'almirah', 'bed', 'sofa', 'office chair', 'godrej almirah'] },
  { code: '9503', name: 'Toys, Tricycles, Board Games & Educational Toys', category: 'Toys & Misc Goods', gstRate: 12, keywords: ['toy', 'doll', 'game', 'tricycle', 'car toy', 'board game'] },

  // --- Services (SAC Codes - 99 Series) ---
  { code: '998314', name: 'Information Technology, Software Development & Web Services', category: 'IT & Digital Services', gstRate: 18, keywords: ['software', 'website', 'it service', 'development', 'app development', 'coding', 'hosting', 'cloud service'] },
  { code: '998313', name: 'Accounting, Bookkeeping, Auditing & GST Tax Consultancy', category: 'Professional Services', gstRate: 18, keywords: ['accounting', 'audit', 'taxation', 'gst filing', 'ca service', 'bookkeeping', 'tax return'] },
  { code: '998211', name: 'Legal Advisory & Court Representation Services', category: 'Professional Services', gstRate: 18, keywords: ['legal', 'lawyer', 'consultancy', 'court', 'advocate', 'legal notice'] },
  { code: '998311', name: 'Management Consultancy & Business Strategy Advisory', category: 'Professional Services', gstRate: 18, keywords: ['consulting', 'management', 'advisory', 'business consultant', 'strategy'] },
  { code: '998611', name: 'Freight Transportation, Goods Carrying & Cargo Logistics', category: 'Transport & Logistics', gstRate: 5, keywords: ['freight', 'transport', 'cargo', 'logistics', 'cartage', 'shipping', 'truck hire'] },
  { code: '997212', name: 'Renting & Leasing of Commercial Properties / Offices / Godowns', category: 'Real Estate & Rentals', gstRate: 18, keywords: ['rent', 'rental', 'lease', 'office rent', 'godown rent', 'commercial rent'] },
  { code: '996331', name: 'Catering, Restaurant & Food Catering Services', category: 'Hospitality & Food Services', gstRate: 5, keywords: ['catering', 'restaurant', 'food service', 'canteen', 'buffet'] },
  { code: '995411', name: 'Civil Construction & Building Contractor Services', category: 'Construction Works', gstRate: 18, keywords: ['civil work', 'construction service', 'building work', 'contractor', 'renovation'] },
  { code: '998719', name: 'Repair & AMC Servicing of Machinery, Electronics & Goods', category: 'Repair & Maintenance', gstRate: 18, keywords: ['repair', 'maintenance', 'servicing', 'amc', 'ac repair', 'machine service'] }
];

// Standard GST UOM / UQC standard list
export const STANDARD_UNITS = [
  'PCS', 'NOS', 'KG', 'BOX', 'MTR', 'LTR', 'SET', 'PKT', 
  'DZN', 'BGS', 'QTL', 'TON', 'SQF', 'SQM', 'GMS', 'CAN', 
  'BTL', 'PAIR', 'ROLL', 'BUNDLE', 'DRUM', 'COIL', 'SERVICE'
];

/**
 * Searches Pan-India HSN directory by keyword, code, product name, or category.
 */
export function searchHsnDirectory(query: string, categoryFilter?: string): HsnItem[] {
  let list = PAN_INDIA_HSN_DIRECTORY;

  if (categoryFilter && categoryFilter !== 'ALL') {
    list = list.filter(item => item.category === categoryFilter);
  }

  if (!query || query.trim().length === 0) return list.slice(0, 25);

  const clean = query.toLowerCase().trim();
  return list.filter(item => 
    item.code.includes(clean) ||
    item.name.toLowerCase().includes(clean) ||
    item.category.toLowerCase().includes(clean) ||
    item.keywords.some(k => k.toLowerCase().includes(clean))
  );
}

/**
 * Smart Auto-fetcher: Auto-detects HSN Code and GST Rate from product title.
 */
export function autoFetchHsnByName(itemName: string): HsnItem | null {
  if (!itemName || itemName.trim().length < 2) return null;

  const cleanName = itemName.toLowerCase().trim();
  // Extract words (length >= 2)
  const words = cleanName.split(/[^a-zA-Z0-9]+/).filter(w => w.length >= 2);
  if (words.length === 0) return null;

  let bestMatch: HsnItem | null = null;
  let maxScore = 0;

  for (const item of PAN_INDIA_HSN_DIRECTORY) {
    let score = 0;

    for (const kw of item.keywords) {
      const cleanKw = kw.toLowerCase().trim();

      // Exact match with full title
      if (cleanName === cleanKw) {
        score += 100;
      }

      for (const word of words) {
        // Exact word match with keyword
        if (word === cleanKw) {
          score += 50 + cleanKw.length * 5;
        } 
        // Prefix/suffix match for words >= 3 chars
        else if (word.length >= 3 && cleanKw.length >= 3) {
          if (cleanKw.startsWith(word) || word.startsWith(cleanKw)) {
            score += 15 + Math.min(word.length, cleanKw.length);
          }
        }
      }
    }

    // Must pass minimum score threshold of 15 to prevent false matches
    if (score > maxScore && score >= 15) {
      maxScore = score;
      bestMatch = item;
    }
  }

  return bestMatch;
}

// Local Storage helpers for custom user-added units
const CUSTOM_UNITS_KEY = 'SNA_CUSTOM_UNITS_STORE';

export function getCustomUnits(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_UNITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveCustomUnit(unitName: string): string[] {
  try {
    const clean = unitName.trim().toUpperCase();
    if (!clean) return getCustomUnits();
    const existing = getCustomUnits();
    if (!existing.includes(clean)) {
      const updated = [...existing, clean];
      localStorage.setItem(CUSTOM_UNITS_KEY, JSON.stringify(updated));
      return updated;
    }
    return existing;
  } catch (e) {
    return [];
  }
}
