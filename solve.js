// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly csv-reader 1.0.0's answer {columns, rows, errors} for every
// {text, header} input, but reads the text with slice/indexOf scans instead of
// one character at a time:
//
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside a quoted field counted), row its
//     record's index in rows (null for the header), in the order met, a field's
//     quote_junk when the field ends and a record's short_row or long_row when
//     the record ends.
//
// Speed: a physical line that holds no quote and no stray CR is one slice plus
// one native split(',') — the common case by far. Only lines that hold a quote
// (or a stray CR) go through the field-by-field reader, which itself finds
// each field's end with indexOf instead of stepping character by character.
// No state is kept from one run() call to the next.

/** Field ended at a comma (0), at a line break (1), or at the end of the text (2). */

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = n > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and how many characters were kept.
  let fVal = '';
  let fEnd = 2;
  let fAdd = 0;

  // Reads unquoted characters onto `v0` up to the next comma or line break: a CR
  // not followed by LF is dropped (stray_cr). Sets fVal, fEnd and fAdd.
  function readUnquoted(v0) {
    let v = v0;
    let added = 0;
    let p = pos;
    for (;;) {
      let e = n;
      let kind = 2;
      const iC = text.indexOf(',', p);
      if (iC !== -1) {
        e = iC;
        kind = 0;
      }
      const iN = text.indexOf('\n', p);
      if (iN !== -1 && iN < e) {
        e = iN;
        kind = 1;
      }
      const iR = text.indexOf('\r', p);
      if (iR !== -1 && iR < e) {
        e = iR;
        kind = 3;
      }
      if (kind === 3) {
        if (e + 1 < n && text.charCodeAt(e + 1) === 10) {
          v += text.slice(p, e);
          added += e - p;
          pos = e + 2;
          line += 1;
          fVal = v;
          fEnd = 1;
          fAdd = added;
          return;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        v += text.slice(p, e);
        added += e - p;
        p = e + 1;
        continue;
      }
      v += text.slice(p, e);
      added += e - p;
      if (kind === 0) pos = e + 1;
      else if (kind === 1) {
        pos = e + 1;
        line += 1;
      } else pos = n;
      fVal = v;
      fEnd = kind;
      fAdd = added;
      return;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fVal, fEnd and fAdd.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1;
    let segStart = p;
    let parts = null;
    let close = -1;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) break;
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q));
        parts.push('"');
        p = q + 2;
        segStart = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after it
      // is read again as an unquoted field.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    let v;
    if (parts === null) {
      v = text.slice(segStart, close);
    } else {
      parts.push(text.slice(segStart, close));
      v = parts.join('');
    }
    // Each CRLF or lone CR inside the quotes is one LF, and counts one line.
    if (v.indexOf('\n') !== -1 || v.indexOf('\r') !== -1) {
      const breaks = v.match(/\r\n?|\n/g);
      if (breaks !== null) line += breaks.length;
      if (v.indexOf('\r') !== -1) v = v.replace(/\r\n?/g, '\n');
    }
    pos = close + 1;
    if (pos >= n) {
      fVal = v;
      fEnd = 2;
      fAdd = 0;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fVal = v;
      fEnd = 0;
      fAdd = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fVal = v;
      fEnd = 1;
      fAdd = 0;
      return;
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fVal = v;
      fEnd = 1;
      fAdd = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    readUnquoted(v);
    if (fAdd > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields = null;
    const lf = text.indexOf('\n', pos);
    if (lf !== -1) {
      // A whole physical line: fast when it holds no quote and no stray CR.
      let segEnd = lf;
      if (segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
      const qi = text.indexOf('"', pos);
      const ri = text.indexOf('\r', pos);
      const hasQuote = qi !== -1 && qi < lf;
      const hasStrayCR = ri !== -1 && ri < segEnd;
      if (!hasQuote && !hasStrayCR) {
        if (segEnd === pos) {
          pos = lf + 1;
          line += 1;
          continue;
        }
        fields = text.slice(pos, segEnd).split(',');
        pos = lf + 1;
        line += 1;
      }
    } else {
      // The tail after the last line break: fast when it holds no quote and no CR.
      const qi = text.indexOf('"', pos);
      const ri = text.indexOf('\r', pos);
      if (qi === -1 && ri === -1) {
        fields = text.slice(pos).split(',');
        pos = n;
      }
    }

    if (fields === null) {
      // A line with a quote (or a stray CR): read it field by field.
      fields = [];
      let ended;
      let quoted = false;
      do {
        quoted = text.charCodeAt(pos) === 34;
        if (quoted) readQuoted();
        else readUnquoted('');
        fields.push(fVal);
        ended = fEnd;
      } while (ended === 0);
      // A line that held only stray CRs is left with no characters: no record
      // (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
