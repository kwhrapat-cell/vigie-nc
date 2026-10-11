// Lecture d'un message copié (Facebook, SMS, radio…) pour en tirer
// uniquement le FAIT : le type d'événement et le lieu. Tout se passe sur le
// téléphone ; le texte n'est jamais envoyé ni enregistré. Seul le nom du
// lieu repéré est ensuite envoyé au service de cartes pour le placer.

import type { ReportType } from "./types";

export type RelayableType = Exclude<ReportType, "sos">;

export interface RelayAnalysis {
  type: RelayableType | null;
  typeKeyword: string | null; // mot qui a permis de deviner le type
  place: string | null; // ex. « Radier de la Coulée »
  locality: string | null; // ex. « Mont-Dore »
  road: string | null; // ex. « RT1 »
  label: string | null; // lieu lisible à enregistrer, ex. « Radier de la Coulée, Mont-Dore »
  queries: string[]; // recherches à essayer, de la plus précise à la plus large
}

/** minuscules, sans accents, apostrophes et espaces normalisés */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, " ");
}

// Mots-clés par type, avec un poids : les expressions précises comptent plus
// que les mots isolés. Tout est écrit sans accents (texte normalisé).
const KEYWORDS: Record<RelayableType, [string, number][]> = {
  inondation: [
    ["radier", 5], ["submerge", 4], ["inonde", 4], ["inondation", 4], ["eau sur la route", 4],
    ["crue", 3], ["deborde", 3], ["montee des eaux", 3], ["monte des eaux", 3], ["passage a gue", 3],
    ["coule sur la route", 3], ["l'eau monte", 3], ["infranchissable", 1],
  ],
  route_coupee: [
    ["route coupee", 5], ["route fermee", 5], ["route barree", 5], ["circulation interdite", 4],
    ["ferme a la circulation", 4], ["fermee a la circulation", 4], ["barrage", 3], ["impraticable", 3],
    ["deviation", 2], ["coupee", 2], ["fermee", 1], ["bloquee", 2], ["bloque", 1], ["on ne passe pas", 3],
    ["ca ne passe pas", 3], ["ca passe pas", 3],
  ],
  accident: [
    ["accident", 5], ["accidente", 4], ["carambolage", 5], ["sortie de route", 5], ["tonneau", 4],
    ["collision", 4], ["percute", 4], ["renverse", 3], ["accroche", 3], ["motard au sol", 4],
  ],
  danger: [
    ["arbre tombe", 5], ["arbre en travers", 5], ["eboulement", 5], ["glissement de terrain", 5],
    ["eboulis", 4], ["rochers sur la route", 5], ["pierres sur la route", 5], ["animal sur la route", 4],
    ["vache", 3], ["chevaux", 3], ["cheval", 3], ["cerf", 3], ["huile sur la route", 4], ["gasoil", 3],
    ["feu de brousse", 4], ["incendie", 4], ["fumee", 2], ["cable", 2], ["poteau", 2], ["arbre", 2],
    ["danger", 2], ["attention", 1],
  ],
  travaux: [
    ["travaux", 5], ["pour travaux", 6], ["chantier", 4], ["alternat", 4], ["circulation alternee", 4], ["basculement", 3],
    ["enrobe", 3], ["goudronnage", 3], ["rabotage", 3], ["engins", 2],
  ],
  trafic_dense: [
    ["bouchon", 5], ["embouteillage", 5], ["ralentissement", 4], ["ralenti", 3], ["trafic dense", 5],
    ["a l'arret", 3], ["ca roule mal", 4], ["ca bouchonne", 5], ["pare-choc", 3], ["file", 1],
  ],
  chaussee_degradee: [
    ["nid de poule", 5], ["nids de poule", 5], ["nids-de-poule", 5], ["chaussee degradee", 5],
    ["affaissement", 4], ["route defoncee", 4], ["trou", 2], ["fissure", 2],
  ],
  meteo: [
    ["orage", 4], ["fortes pluies", 4], ["grosse pluie", 3], ["pluie", 2], ["rafales", 3], ["vent fort", 3],
    ["brouillard", 4], ["grele", 4], ["depression", 3], ["cyclone", 3], ["vigilance", 2],
  ],
  autre: [],
};

// En cas d'égalité, le plus grave l'emporte.
const PRIORITY: RelayableType[] = [
  "accident",
  "route_coupee",
  "inondation",
  "danger",
  "travaux",
  "trafic_dense",
  "chaussee_degradee",
  "meteo",
];

// Communes et lieux-dits courants (orthographe affichée). La liste n'a pas
// besoin d'être complète : l'utilisateur vérifie toujours sur la carte.
const LOCALITIES = [
  // Grand Nouméa
  "Nouméa", "Dumbéa", "Dumbéa-sur-Mer", "Koutio", "Katiramona", "Nondoué", "Auteuil", "Mont-Dore",
  "Mont-Dore Sud", "Boulari", "La Coulée", "Plum", "Vallon-Dore", "Saint-Louis", "Saint-Michel",
  "Pont-des-Français", "Yahoué", "La Conception", "Robinson", "Mouirange", "Païta", "Tontouta",
  "Savannah", "Tamoa", "Naniouni", "Port-Laguerre", "Ducos", "Magenta", "Rivière-Salée", "Normandie",
  "Tina", "Vallée du Tir", "Montravel", "Kaméré", "Motor Pool", "Ouémo", "Val Plaisance",
  // Grand Sud
  "Yaté", "Goro", "Touaourou", "Waho", "Unia", "Prony", "Plaine des Lacs", "Port-Boisé",
  // Brousse et îles
  "Boulouparis", "La Foa", "Farino", "Sarraméa", "Moindou", "Bourail", "Poya", "Népoui", "Pouembout",
  "Koné", "Voh", "Kaala-Gomen", "Koumac", "Poum", "Ouégoa", "Pouébo", "Hienghène", "Touho",
  "Poindimié", "Ponérihouen", "Houaïlou", "Kouaoua", "Canala", "Thio", "Île des Pins", "Maré",
  "Lifou", "Ouvéa", "Bélep", "Tadine", "Wé",
];

// Les 33 communes : servent à compléter un lieu-dit (« Touaourou, Yaté »).
const COMMUNES = new Set([
  "Nouméa", "Dumbéa", "Mont-Dore", "Païta", "Yaté", "Boulouparis", "La Foa", "Farino", "Sarraméa",
  "Moindou", "Bourail", "Poya", "Pouembout", "Koné", "Voh", "Kaala-Gomen", "Koumac", "Poum", "Ouégoa",
  "Pouébo", "Hienghène", "Touho", "Poindimié", "Ponérihouen", "Houaïlou", "Kouaoua", "Canala", "Thio",
  "Île des Pins", "Maré", "Lifou", "Ouvéa", "Bélep",
]);

const LOCALITY_PATTERNS = LOCALITIES.map((name) => ({
  name,
  // limites de mot, sur le texte normalisé
  re: new RegExp(`(^|[^a-z0-9])${normalize(name).replace(/[-\s]/g, "[-\\s]?")}([^a-z0-9]|$)`, "g"),
}));

const ROAD_RE = /\b(RT|RP|VE|VDE|VDO|VAO)\s?-?\s?(\d{1,2})\b/i;
const SAVEXPRESS_RE = /savexpress|voie express/i;

// « radier de la Coulée », « pont de Païta », « col de la Pirogue »…
const NAMED_PLACE_RE =
  /(?<![\p{L}])([Rr]adier|[Pp]ont|[Cc]ol|[Rr]oute|[Rr]ivi[eè]re|[Cc]reek|[Cc]arrefour|[Rr]ond[- ][Pp]oint|[ÉéEe]changeur|[Tt]ribu|[Bb]aie|[Ll]otissement|[Vv]irage|[Cc][ôo]te)\s+((?:de la|de l'|de l’|du|des|de|d'|d’)\s*)?([A-ZÀ-Ý][\p{L}'’-]+(?:[ -](?:[A-ZÀ-Ý][\p{L}'’-]+)){0,2})/u;

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function analyzeRelayText(text: string): RelayAnalysis {
  const norm = normalize(text);

  // 1. Type
  let best: RelayableType | null = null;
  let bestScore = 0;
  let bestKeyword: string | null = null;
  for (const t of PRIORITY) {
    let score = 0;
    let top: [string, number] | null = null;
    for (const [kw, w] of KEYWORDS[t]) {
      if (norm.includes(kw)) {
        score += w;
        if (!top || w > top[1]) top = [kw, w];
      }
    }
    if (score > bestScore) {
      best = t;
      bestScore = score;
      bestKeyword = top?.[0] ?? null;
    }
  }

  // 2. Lieu
  const named = text.match(NAMED_PLACE_RE);
  const place = named
    ? capitalize(`${named[1].toLowerCase()} ${named[2] ? named[2].replace("’", "'") : ""}${named[3]}`.replace(/\s+/g, " ").trim())
    : null;

  // Commune / lieu-dit : le premier cité (le plus long s'ils commencent au
  // même endroit, « Mont-Dore Sud » avant « Mont-Dore »), en ignorant les
  // destinations (« direction Nouméa », « vers Païta »).
  const found: { name: string; index: number }[] = [];
  for (const l of LOCALITY_PATTERNS) {
    l.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = l.re.exec(norm))) {
      const index = m.index + m[1].length;
      const before = norm.slice(Math.max(0, index - 14), index);
      if (!/(direction|vers|sens|destination)( de| du| d')? ?$/.test(before)) {
        found.push({ name: l.name, index });
      }
      l.re.lastIndex = m.index + 1;
    }
  }
  found.sort((a, b) => a.index - b.index || b.name.length - a.name.length);
  // Le lieu-dit le plus précis d'abord, complété par sa commune si elle est citée
  const lieuDit = found.find((f) => !COMMUNES.has(f.name))?.name ?? null;
  const commune = found.find((f) => COMMUNES.has(f.name))?.name ?? null;
  const locality = lieuDit ?? commune;

  const roadMatch = text.match(ROAD_RE);
  const road = roadMatch
    ? `${roadMatch[1].toUpperCase()}${roadMatch[2]}`
    : SAVEXPRESS_RE.test(text)
      ? "Savexpress"
      : null;

  const main = place;
  // Pas de répétition : « Radier de Plum » et non « Radier de Plum, Plum »
  const localityInMain = Boolean(
    main && locality && normalize(main).replace(/[-\s]/g, "").includes(normalize(locality).replace(/[-\s]/g, "")),
  );
  const communeInMain = Boolean(main && commune && normalize(main).includes(normalize(commune)));
  const extraCommune = lieuDit && commune && !communeInMain && !normalize(lieuDit).includes(normalize(commune)) ? commune : null;
  const labelParts = [main ?? road, localityInMain ? null : locality, extraCommune].filter(
    (p): p is string => Boolean(p),
  );
  const label = labelParts.length ? Array.from(new Set(labelParts)).join(", ").slice(0, 80) : null;

  const queries = Array.from(
    new Set(
      [
        main && commune && !communeInMain ? `${main}, ${commune}` : null,
        main && locality && !localityInMain ? `${main}, ${locality}` : null,
        main,
        road && locality ? `${road}, ${locality}` : null,
        lieuDit && commune ? `${lieuDit}, ${commune}` : null,
        locality,
        commune,
        road === "Savexpress" ? "Savexpress, Nouvelle-Calédonie" : null,
      ].filter((q): q is string => Boolean(q)),
    ),
  );

  return { type: best, typeKeyword: bestKeyword, place: main, locality, road, label, queries };
}
