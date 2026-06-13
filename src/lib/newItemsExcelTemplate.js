/** Sanitize taxonomy id for Excel defined names (letters, digits, underscore only). */
function sanitizeKey(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_]/g, '_');
}

function firstExamplePath(tree) {
  if (!tree?.length) return [];
  const path = [];
  let node = tree[0];
  while (node) {
    path.push(node.label);
    node = node.children?.[0];
  }
  return path;
}

function collectAllPaths(tree) {
  const paths = [];
  function walk(nodes, labels = []) {
    for (const node of nodes) {
      const next = [...labels, node.label];
      paths.push(next);
      walk(node.children || [], next);
    }
  }
  walk(tree);
  return paths;
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1A1A' } };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
}

function addListValidation(sheet, range, formula) {
  sheet.dataValidations.add(range, {
    type: 'list',
    allowBlank: true,
    formulae: [formula],
    showErrorMessage: true,
    errorTitle: 'Invalid value',
    error: 'Choose a value from the dropdown list.',
    showInputMessage: true,
  });
}

/**
 * Build hidden Lists sheet + defined names for cascading category dropdowns.
 */
function buildListsWorkbook(wb, lists, tree) {
  const mainCount = tree.length;
  if (!mainCount) return { mainCount: 0 };

  lists.getCell(1, 1).value = 'Main Category';
  lists.getCell(1, 2).value = 'Main Key';
  tree.forEach((main, i) => {
    lists.getCell(i + 2, 1).value = main.label;
    lists.getCell(i + 2, 2).value = sanitizeKey(main.id);
  });
  wb.definedNames.add(`Lists!$A$2:$A$${mainCount + 1}`, 'MainCategories');

  const sub1StartCol = 4;
  tree.forEach((main, mi) => {
    const col = sub1StartCol + mi;
    const key = sanitizeKey(main.id);
    lists.getCell(1, col).value = key;
    const subs = main.children || [];
    subs.forEach((s, si) => {
      lists.getCell(si + 2, col).value = s.label;
    });
    if (subs.length) {
      const letter = lists.getColumn(col).letter;
      wb.definedNames.add(`Lists!$${letter}$2:$${letter}$${subs.length + 1}`, `sub1_${key}`);
    }
  });

  const l2Nodes = [];
  let lookupRow = 2;
  const lookupLabelCol = sub1StartCol + tree.length + 1;
  const lookupKeyCol = lookupLabelCol + 1;
  lists.getCell(1, lookupLabelCol).value = 'Sub1 Label';
  lists.getCell(1, lookupKeyCol).value = 'Sub1 Key';
  for (const main of tree) {
    for (const l2 of main.children || []) {
      lists.getCell(lookupRow, lookupLabelCol).value = l2.label;
      lists.getCell(lookupRow, lookupKeyCol).value = sanitizeKey(l2.id);
      l2Nodes.push(l2);
      lookupRow += 1;
    }
  }
  const lookupEnd = Math.max(lookupRow - 1, 2);
  const sub1LabelLetter = lists.getColumn(lookupLabelCol).letter;
  const sub1KeyLetter = lists.getColumn(lookupKeyCol).letter;

  const sub2StartCol = lookupKeyCol + 2;
  l2Nodes.forEach((l2, li) => {
    const col = sub2StartCol + li;
    const key = sanitizeKey(l2.id);
    lists.getCell(1, col).value = key;
    const subs = l2.children || [];
    subs.forEach((s, si) => {
      lists.getCell(si + 2, col).value = s.label;
    });
    if (subs.length) {
      const letter = lists.getColumn(col).letter;
      wb.definedNames.add(`Lists!$${letter}$2:$${letter}$${subs.length + 1}`, `sub2_${key}`);
    }
  });

  const l3Nodes = [];
  lookupRow = 2;
  const lookup2LabelCol = sub2StartCol + l2Nodes.length + 1;
  const lookup2KeyCol = lookup2LabelCol + 1;
  lists.getCell(1, lookup2LabelCol).value = 'Sub2 Label';
  lists.getCell(1, lookup2KeyCol).value = 'Sub2 Key';
  for (const l2 of l2Nodes) {
    for (const l3 of l2.children || []) {
      lists.getCell(lookupRow, lookup2LabelCol).value = l3.label;
      lists.getCell(lookupRow, lookup2KeyCol).value = sanitizeKey(l3.id);
      l3Nodes.push(l3);
      lookupRow += 1;
    }
  }
  const lookup2End = Math.max(lookupRow - 1, 2);
  const sub2LabelLetter = lists.getColumn(lookup2LabelCol).letter;
  const sub2KeyLetter = lists.getColumn(lookup2KeyCol).letter;

  const sub3StartCol = lookup2KeyCol + 2;
  l3Nodes.forEach((l3, li) => {
    const col = sub3StartCol + li;
    const key = sanitizeKey(l3.id);
    lists.getCell(1, col).value = key;
    const subs = l3.children || [];
    subs.forEach((s, si) => {
      lists.getCell(si + 2, col).value = s.label;
    });
    if (subs.length) {
      const letter = lists.getColumn(col).letter;
      wb.definedNames.add(`Lists!$${letter}$2:$${letter}$${subs.length + 1}`, `sub3_${key}`);
    }
  });

  return {
    mainCount,
    sub1LabelLetter,
    sub1KeyLetter,
    lookupEnd,
    sub2LabelLetter,
    sub2KeyLetter,
    lookup2End,
  };
}

function applyProductValidations(products, meta) {
  const { mainCount, sub1LabelLetter, sub1KeyLetter, lookupEnd, sub2LabelLetter, sub2KeyLetter, lookup2End } = meta;
  if (!mainCount) return;

  const rowCap = 500;

  addListValidation(products, `C2:C${rowCap}`, 'MainCategories');

  addListValidation(
    products,
    `D2:D${rowCap}`,
    `IF(C2="","",INDIRECT("sub1_"&INDEX(Lists!$B$2:$B$${mainCount + 1},MATCH(C2,Lists!$A$2:$A$${mainCount + 1},0))))`,
  );

  addListValidation(
    products,
    `E2:E${rowCap}`,
    `IF(D2="","",INDIRECT("sub2_"&INDEX(Lists!$${sub1KeyLetter}$2:$${sub1KeyLetter}$${lookupEnd},MATCH(D2,Lists!$${sub1LabelLetter}$2:$${sub1LabelLetter}$${lookupEnd},0))))`,
  );

  addListValidation(
    products,
    `F2:F${rowCap}`,
    `IF(E2="","",INDIRECT("sub3_"&INDEX(Lists!$${sub2KeyLetter}$2:$${sub2KeyLetter}$${lookup2End},MATCH(E2,Lists!$${sub2LabelLetter}$2:$${sub2LabelLetter}$${lookup2End},0))))`,
  );
}

function buildInstructionsSheet(sheet) {
  sheet.getColumn(1).width = 100;
  const lines = [
    ['New Items — Excel import template'],
    [''],
    ['How to use'],
    ['1. Fill in rows on the "Products" sheet (delete the example row when done).'],
    ['2. SKU — required, unique product code (also used as barcode).'],
    ['3. Description — product title shown on the website.'],
    ['4. Main Category — required; pick from the dropdown.'],
    ['5. Sub Category 1–3 — optional; dropdowns update based on the parent category.'],
    ['6. Save the file, then use Import Excel in the New Items panel.'],
    [''],
    ['Image upload (Stage B)'],
    ['After import, upload a folder of images named SKU.jpg, SKU-1.jpg, SKU-2.jpg, SKU-3.jpg.'],
    [''],
    ['Category reference'],
    ['See the "Category Paths" sheet for all valid category combinations.'],
  ];
  lines.forEach((line, i) => {
    const row = sheet.getRow(i + 1);
    row.getCell(1).value = line[0];
    if (i === 0) row.font = { bold: true, size: 14 };
    if (line[0]?.startsWith('How to') || line[0]?.startsWith('Image') || line[0]?.startsWith('Category')) {
      row.font = { bold: true };
    }
  });
}

function buildCategoryPathsSheet(sheet, tree) {
  sheet.columns = [
    { header: 'Main Category', key: 'main', width: 28 },
    { header: 'Sub Category 1', key: 'sub1', width: 28 },
    { header: 'Sub Category 2', key: 'sub2', width: 28 },
    { header: 'Sub Category 3', key: 'sub3', width: 28 },
  ];
  styleHeaderRow(sheet.getRow(1));
  for (const path of collectAllPaths(tree)) {
    sheet.addRow({
      main: path[0] || '',
      sub1: path[1] || '',
      sub2: path[2] || '',
      sub3: path[3] || '',
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Generate and download the New Items Excel template with category dropdowns.
 * @param {Array} taxonomyTree — category tree from admin taxonomy state
 */
export async function downloadNewItemsExcelTemplate(taxonomyTree) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Proto Portal Admin';
  wb.created = new Date();

  const products = wb.addWorksheet('Products', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const instructions = wb.addWorksheet('Instructions');
  const categoryPaths = wb.addWorksheet('Category Paths');
  const lists = wb.addWorksheet('Lists');
  lists.state = 'veryHidden';

  products.columns = [
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Description', key: 'description', width: 42 },
    { header: 'Main Category', key: 'main', width: 30 },
    { header: 'Sub Category 1', key: 'sub1', width: 30 },
    { header: 'Sub Category 2', key: 'sub2', width: 30 },
    { header: 'Sub Category 3', key: 'sub3', width: 28 },
  ];
  styleHeaderRow(products.getRow(1));

  const example = firstExamplePath(taxonomyTree);
  products.addRow({
    sku: 'EXAMPLE-SKU',
    description: 'Example product — replace or delete this row',
    main: example[0] || '',
    sub1: example[1] || '',
    sub2: example[2] || '',
    sub3: example[3] || '',
  });
  products.getRow(2).font = { italic: true, color: { argb: 'FF6B7280' } };

  const listsMeta = buildListsWorkbook(wb, lists, taxonomyTree || []);
  applyProductValidations(products, listsMeta);
  buildInstructionsSheet(instructions);
  buildCategoryPathsSheet(categoryPaths, taxonomyTree || []);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'new-items-import-template.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
