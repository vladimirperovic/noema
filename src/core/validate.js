/**
 * Minimalni JSON-Schema validator — pokriva ono što nam treba za todo alate
 * (tip, required, enum, min/max dužine, default). Bez `ajv`/`zod` dependency-ja.
 *
 * Nije potpuna JSON-Schema implementacija — namerno minimalna da ostane čitljiva
 * i predvidljiva. Ako zatreba dublja validacija, lako se proširi.
 */

/**
 * @param {object} schema - JSON-Schema (podset: input shema alata)
 * @param {unknown} data - Podaci za validaciju
 * @returns {{ ok: true; value: any } | { ok: false; errors: string[] }}
 */
export function validateBySchema(schema, data) {
  const errors = [];

  // Ako nije objekat, a šema traži object → greška.
  if (schema.type === "object") {
    if (data == null || typeof data !== "object" || Array.isArray(data)) {
      // Dozvoli null/undefined kao prazan objekat.
      if (data == null) data = {};
      else {
        return { ok: false, errors: ["Očekivan JSON objekat."] };
      }
    }

    // Required polja.
    const required = schema.required ?? [];
    for (const key of required) {
      if (data[key] === undefined) {
        errors.push(`Polje "${key}" je obavezno.`);
      }
    }

    const props = schema.properties ?? {};
    const out = {};
    // Procesiraj svojstva — ugradi defaulte, validiraj prisutne.
    for (const [key, sub] of Object.entries(props)) {
      let val = data[key];
      if (val === undefined) {
        if (sub.default !== undefined) val = sub.default;
        else continue;
      }
      const subErr = checkValue(sub, val, key);
      if (subErr) errors.push(...subErr);
      else out[key] = val;
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value: out };
  }

  // Ne-object top-level šema (ne koristimo, ali za svaki slučaj).
  const subErr = checkValue(schema, data, "(root)");
  if (subErr) return { ok: false, errors: subErr };
  return { ok: true, value: data };
}

function checkValue(schema, val, path) {
  const errs = [];
  const t = schema.type;
  if (t === "string") {
    if (typeof val !== "string") return [`${path}: očekivan string.`];
    if (schema.minLength !== undefined && val.length < schema.minLength) {
      errs.push(`${path}: minimum ${schema.minLength} znakova.`);
    }
    if (schema.maxLength !== undefined && val.length > schema.maxLength) {
      errs.push(`${path}: maksimum ${schema.maxLength} znakova.`);
    }
    if (schema.enum && !schema.enum.includes(val)) {
      errs.push(`${path}: nedozvoljena vrednost. Dozvoljeno: ${schema.enum.join(", ")}.`);
    }
  } else if (t === "boolean") {
    if (typeof val !== "boolean") return [`${path}: očekivan boolean.`];
  } else if (t === "integer" || t === "number") {
    if (typeof val !== "number" || !Number.isFinite(val)) return [`${path}: očekivan broj.`];
    if (t === "integer" && !Number.isInteger(val)) return [`${path}: očekivan celi broj.`];
  } else if (t === "array") {
    if (!Array.isArray(val)) return [`${path}: očekivan niz.`];
    if (schema.items && schema.items.enum) {
      const allowed = new Set(schema.items.enum);
      for (const item of val) {
        if (!allowed.has(item)) {
          errs.push(`${path}: nedozvoljena vrednost "${item}". Dozvoljeno: ${schema.items.enum.join(", ")}.`);
        }
      }
    }
  }
  return errs.length ? errs : null;
}
