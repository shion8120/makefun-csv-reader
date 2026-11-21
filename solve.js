// Fast drop-in replacement for csv-reader 1.0.0's readCsv (variant 3:
// hand-scanned field loop, no per-field result objects). Same answers as
// csv-reader 1.0.0 on every input.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and (for the junk that can
  // follow a quoted field) how many characters an unquoted read kept.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function readUnquoted(value) {
    let added = 0;
    let segStart = pos;
    let i = pos;
    for (;;) {
      if (i >= n) {
        if (i > segStart) { value += text.slice(segStart, i); added += i - segStart; }
        pos = i;
        fValue = value; fEnded = END; fAdded = added;
        return;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        if (i > segStart) { value += text.slice(segStart, i); added += i - segStart; }
        pos = i + 1;
        fValue = value; fEnded = COMMA; fAdded = added;
        return;
      }
      if (c === 10) {
        if (i > segStart) { value += text.slice(segStart, i); added += i - segStart; }
        pos = i + 1;
        line += 1;
        fValue = value; fEnded = LINE_BREAK; fAdded = added;
        return;
      }
      if (c === 13) {
        if (text.charCodeAt(i + 1) === 10) {
          if (i > segStart) { value += text.slice(segStart, i); added += i - segStart; }
          pos = i + 2;
          line += 1;
          fValue = value; fEnded = LINE_BREAK; fAdded = added;
          return;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (i > segStart) { value += text.slice(segStart, i); added += i - segStart; }
        i += 1;
        segStart = i;
        continue;
      }
      i += 1;
    }
  }

  function appendQuotedSegment(value, seg) {
    if (seg.indexOf('\r') === -1) {
      let idx = 0;
      for (;;) {
        const k = seg.indexOf('\n', idx);
        if (k === -1) break;
        line += 1;
        idx = k + 1;
      }
      return value + seg;
    }
    const fixed = seg.replace(/\r\n|\r/g, '\n');
    let idx = 0;
    for (;;) {
      const k = fixed.indexOf('\n', idx);
      if (k === -1) break;
      line += 1;
      idx = k + 1;
    }
    return value + fixed;
  }

  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let segStart = pos + 1;
    pos += 1;
    for (;;) {
      const j = text.indexOf('"', pos);
      if (j === -1) {
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(j + 1) === 34) {
        value = appendQuotedSegment(value, text.slice(segStart, j)) + '"';
        pos = j + 2;
        segStart = pos;
        continue;
      }
      value = appendQuotedSegment(value, text.slice(segStart, j));
      pos = j + 1;
      break;
    }
    if (pos >= n) { fValue = value; fEnded = END; fAdded = 0; return; }
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      fValue = value; fEnded = COMMA; fAdded = 0;
      return;
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      fValue = value; fEnded = LINE_BREAK; fAdded = 0;
      return;
    }
    if (c === '\r' && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value; fEnded = LINE_BREAK; fAdded = 0;
      return;
    }
    readUnquoted(value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  for (;;) {
    while (pos < n) {
      const c = text[pos];
      if (c === '\n') {
        pos += 1;
        line += 1;
      } else if (c === '\r' && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = pos < n && text[pos] === '"';
      if (quoted) readQuoted(); else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

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
