import {
  cartonLetter,
  isSimpleType,
  NO_FORMAT,
  type BagDraft,
  type CartonDraft,
} from "@/components/inventory/carton-builder";

/** Alias de types de sac acceptés dans la formule. */
const TYPE_ALIASES: Record<string, string> = {
  bulk: "bulk",
  vrac: "bulk",
  sample: "sample",
  echantillon: "sample",
  "lab sample": "lab_sample",
  "laboratory sample": "lab_sample",
  lab: "lab_sample",
  "master case": "packaged",
  mastercase: "packaged",
  carton: "packaged",

  preroll: "preroll",
  "pre roll": "preroll",
  "pre-roll": "preroll",
  prerolls: "preroll",
  package: "packaged",
  mastercase: "packaged",
  packaged: "packaged",
  retention: "retention",
  other: "other",
  autre: "other",
};

/** Alias de tailles de fleur. */
const SIZE_ALIASES: Record<string, string> = {
  trim: "trim",
  big: "big",
  medium: "medium",
  med: "medium",
  small: "small",
  ht: "hand_trim",
  "hand trim": "hand_trim",
  handtrim: "hand_trim",
};

const NO_SIZE = "__no_size__";

const deaccent = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export type FormulaError = { line: number; text: string; message: string };
export type FormulaResult = { cartons: CartonDraft[]; errors: FormulaError[] };

function parseSegment(raw: string): BagDraft | string {
  const seg = raw.trim();
  if (!seg) return "segment vide";

  // NxA[xB] éventuellement suivi de "g", puis des mots (type / taille)
  const m = seg.match(
    /^(\d+)\s*[x*]\s*(\d+(?:[.,]\d+)?)\s*(?:[x*]\s*(\d+(?:[.,]\d+)?))?\s*g?\s*(.*)$/i,
  );
  if (!m) return `format attendu « NxPOIDS [type] [taille] » — reçu « ${seg} »`;

  const copies = Number(m[1]);
  const a = Number(m[2].replace(",", "."));
  const b = m[3] ? Number(m[3].replace(",", ".")) : null;
  let rest = deaccent(m[4] ?? "");

  if (!copies || copies < 1) return `nombre de sacs invalide dans « ${seg} »`;

  // Type de sac
  let type = "bulk";
  let matchedType = "";
  for (const key of Object.keys(TYPE_ALIASES).sort((x, y) => y.length - x.length)) {
    if (rest === key || rest.startsWith(key + " ")) {
      type = TYPE_ALIASES[key];
      matchedType = key;
      break;
    }
  }
  if (matchedType) rest = rest.slice(matchedType.length).trim();

  // Taille de fleur (optionnelle)
  let flowerSize = NO_SIZE;
  if (rest) {
    const size = SIZE_ALIASES[rest];
    if (!size) return `mot inconnu « ${rest} » dans « ${seg} »`;
    flowerSize = size;
  }

  const simple = isSimpleType(type);
  const units = b !== null ? a : 1;
  const unitWeight = b !== null ? b : a;
  const net = units * unitWeight;

  return {
    code: "",
    type,
    copies: String(copies),
    units: String(units),
    unitWeight: String(unitWeight),
    weight: simple ? String(net) : "",
    gross: "",
    formatId: NO_FORMAT,
    flowerSize,
  };
}

/**
 * Parse une saisie multi-lignes en cartons/sacs.
 * Une ligne = un carton : « A: 7x1000 Bulk Big, 1x726 Bulk HT ».
 */
export function parseCartonFormula(input: string, startIndex = 0): FormulaResult {
  const cartons: CartonDraft[] = [];
  const errors: FormulaError[] = [];
  const lines = input.split(/\r?\n/);

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;

    const head = line.match(/^([A-Za-z]{1,3})\s*[:.-]\s*(.+)$/);
    const code = head
      ? head[1].toUpperCase()
      : cartonLetter(startIndex + cartons.length + 1);
    const body = head ? head[2] : line;

    const bags: BagDraft[] = [];
    let failed = false;
    body.split(/[,;]/).forEach((segment) => {
      if (!segment.trim()) return;
      const parsed = parseSegment(segment);
      if (typeof parsed === "string") {
        failed = true;
        errors.push({ line: i + 1, text: line, message: parsed });
        return;
      }
      // Les types « simples » (bulk, sample...) n'ont pas de champ « Nb sacs » :
      // on développe N sacs distincts.
      const n = isSimpleType(parsed.type) ? Number(parsed.copies) || 1 : 1;
      for (let k = 0; k < n; k++) {
        bags.push({ ...parsed, copies: n > 1 ? "1" : parsed.copies, code: String(bags.length + 1) });
      }
    });

    if (failed || bags.length === 0) {
      if (!failed) errors.push({ line: i + 1, text: line, message: "aucun sac reconnu" });
      return;
    }
    cartons.push({ code, location: "", bags });
  });

  return { cartons, errors };
}
