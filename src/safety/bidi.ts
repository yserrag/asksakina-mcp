/**
 * Bidi isolates for the ar and ur crisis blocks (WO#481, Gem 2 ruling of
 * 21 Oct 2026). The one place the marks are generated: every other module
 * calls ltr() or rtl(). The marks are built from code points, never pasted.
 *
 *   - ltr(): LRI U+2066 ... PDI U+2069, around every URL, every phone number
 *     and every "24/7" inside ar or ur text;
 *   - rtl(): RLI U+2067 ... PDI U+2069, around Arabic-script hours inside a
 *     helpline line.
 *
 * en, id and tr carry no isolate marks (asserted in scripts/test-wo481.ts).
 */

export const LRI = String.fromCodePoint(0x2066)
export const RLI = String.fromCodePoint(0x2067)
export const PDI = String.fromCodePoint(0x2069)

/** Left-to-right isolate. */
export function ltr(s: string): string {
  return `${LRI}${s}${PDI}`
}

/** Right-to-left isolate. */
export function rtl(s: string): string {
  return `${RLI}${s}${PDI}`
}

/** True when every isolate opener has its PDI, in order, with none left open. */
export function isolatesBalanced(s: string): boolean {
  let depth = 0
  for (const ch of s) {
    if (ch === LRI || ch === RLI || ch === '⁨') depth++
    else if (ch === PDI) {
      if (depth === 0) return false
      depth--
    }
  }
  return depth === 0
}

/** True when the text carries any bidi isolate or embedding mark. */
export function hasBidiMarks(s: string): boolean {
  return /[⁦-⁩‪-‮‎‏]/.test(s)
}
