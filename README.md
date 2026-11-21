# Fast csv-reader drop-in

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/labixiaoge/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/labixiaoge/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

## About

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers every
`{text, header}` input with exactly csv-reader's `{columns, rows, errors}`,
including its broken-row policy (stray CRs, unterminated quotes, quote junk,
short and long rows, blank lines, BOM), but reads the text with
slice/`indexOf` scans instead of one character at a time. A physical line
that holds no quote and no stray CR is one slice plus one native `split(',')`;
only lines that hold a quote (or a stray CR) go through the field-by-field
reader, which itself finds each field's end with `indexOf`.

`main.ts` is the kit's driver: it reads every case from `/input/cases.json`,
answers each one alone with `run()` from `solve.js`, and writes
`/output/answers.json`.

## Files

- `solve.js` — the fast reader; `run(input)` returns csv-reader 1.0.0's answer.
- `main.ts` — the harness driver.
- `package.json` — `{"type": "module"}`.
- `LICENSE` — MIT.
