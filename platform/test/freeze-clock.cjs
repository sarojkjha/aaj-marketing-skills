// Preloaded (node --require) by the golden-output tests so that engines which
// read "today" give the same answer on every run. Dates the engine is given
// explicitly are untouched; only `new Date()`, `Date()` and `Date.now()` with
// no argument are pinned. Override with AAJ_GOLDEN_NOW=<ISO timestamp>.
'use strict';
const FIXED = Date.parse(process.env.AAJ_GOLDEN_NOW || '2026-10-23T12:00:00Z');
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(FIXED); else super(...args); }
  static now() { return FIXED; }
}
globalThis.Date = new Proxy(FixedDate, {
  apply() { return new RealDate(FIXED).toString(); },
});
