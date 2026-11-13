"use client";

export type CyberDTLocale = "en" | "si";

/**
 * Common Singlish words (Sinhala written with English letters, e.g.
 * "sailaya ganna kiyanna"). Used to detect that the student is writing
 * Sinhala in Latin script, so Cyber DT replies in Sinhala script.
 * Matched as whole words so English text like "detail" never triggers it.
 */
const SINGLISH_WORDS = [
  // question / helper words
  "kiyanna", "kiyannek", "kiyannko", "kohomda", "kohoma", "kohomd",
  "mokakda", "mokak", "kumakda", "kumak", "krnne", "karanne", "kriya",
  "widiyt", "widiya", "vidiyt", "vidiya", "vidi",
  "ganna", "gena", "dennako", "hdnnko", "hadanna",
  "thawa", "poddak", "hariyat", "hriyat", "samahara", "eka", "oya",
  // biology topics in Singlish
  "sailaya", "saila", "nukliya",
  "prabhasansleshanaya", "prabhasansleshan", "prabhasha", "prabasha",
  "mayaosis", "mayosis", "mayosi",
  "mayitosis", "samawibhajana", "wibhajana",
  "pravenika", "pravenik", "jayana",
  "ensaim", "enzaim",
  "swasana", "shwasana", "nirwaya", "nirvaya",
  "parinamaya", "parinama", "waranaya",
  "parisara", "aharadama", "karbonchakraya",
  "snayu", "pratichara", "molaya",
  "homona", "masika",
  "pratishakti", "pratide", "ennath",
  "wrukka", "vrukka", "muthra",
  "wishaga", "wisaga", "punasiri", "adhyayana",
];

const SINGLISH_RE = new RegExp(`\\b(?:${SINGLISH_WORDS.join("|")})\\b`, "i");

/**
 * Detects the language of a user message:
 *  - Sinhala script (U+0D80–U+0DFF) → Sinhala
 *  - Singlish (Sinhala words in English letters) → Sinhala
 *  - otherwise the app language fallback
 * Cyber DT AI replies in the same language as the question.
 */
export function detectCyberDTLocale(message: string, fallback: CyberDTLocale = "en"): CyberDTLocale {
  if (/[\u0D80-\u0DFF]/.test(message)) return "si";
  if (SINGLISH_RE.test(message)) return "si";
  return fallback;
}

interface TopicEntry {
  /** English keywords matched against the lowercased message. */
  keywords: string[];
  /** Sinhala keywords matched against the raw message. */
  keywordsSi: string[];
  /** Singlish keywords (Sinhala in English letters) matched as whole words. */
  keywordsSinglish: string[];
  textEn: string;
  textSi: string;
  emoji: string;
}

/**
 * Topic knowledge base. Order matters: specific topics (meiosis, mitosis,
 * genetics) come before broader ones (cell, DNA) so that "cell division"
 * matches mitosis instead of the cell topic, and "genetics" matches the
 * genetics topic before DNA's "gene" keyword.
 */
const topicKnowledge: TopicEntry[] = [
  {
    keywords: [
      "meiosis",
      "reduction division",
      "gamete formation",
      "crossing over",
      "chiasma",
      "independent assortment",
      "non-disjunction",
      "nondisjunction",
      "trisomy",
      "down syndrome",
    ],
    keywordsSi: ["මයෝසිස්", "අඩු විභාජනය", "ගේමීට", "හරස් හුවමාර"],
    keywordsSinglish: ["mayaosis", "mayosis", "mayosi", "adawibhajana", "horas", "huwamara"],
    textEn: `🧬 MEIOSIS — complete answer

Definition: Meiosis (reduction division) is two successive divisions of one diploid cell (2n) that produce four genetically different haploid gametes (n). Purpose: making gametes for sexual reproduction and keeping the chromosome number constant from generation to generation.

The two divisions:
• Meiosis I (reduction division): homologous chromosomes pair up (synapsis) then separate → 2 haploid cells
• Meiosis II (like mitosis): sister chromatids separate → 4 haploid cells

Sources of genetic variation:
1. Crossing over — during prophase I, homologous chromosomes exchange sections of DNA (chiasmata form)
2. Independent assortment — each homologous pair lines up randomly at the equator, so every gamete gets a different random mix of maternal and paternal chromosomes
3. Random fertilisation — any sperm can fuse with any egg

Errors: non-disjunction (chromosomes fail to separate) → gametes with wrong chromosome numbers → e.g. Down syndrome (trisomy 21).

Exam tip: for "how does meiosis produce genetic variation", mention BOTH crossing over AND independent assortment — one sentence each. That's where the marks are.`,
    textSi: `🧬 මයෝසිස් — සම්පූර්ණ උත්තරය

නිර්වචනය: මයෝසිස් (අඩු විභාජනය) යනු ද්විගුණස්‍ය සෛලයක් (2n) දෙවරක් බෙදීමෙන් ජානමය වශයෙන් වෙනස්, ඒකගුණස්‍ය (n) ගේමීට හතරක් සාදන විභාජනයයි. කෘත්‍යය: ලිංගික ප්‍රජනනයට ගේමීට සෑදීම සහ පරම්පරාවෙන් පරම්පරාවට වර්ණදේහ සංඛ්‍යාව එකසේ තබා ගැනීම.

විභාජන දෙක:
• මයෝසිස් I (අඩු විභාජනය): සමජාත වර්ණදේහ යුගල වී වෙන් වේ → ඒකගුණස්‍ය සෛල 2ක්
• මයෝසිස් II (මයිටෝසිස් වගේ): සහෝදර ක්‍රොමැටිඩ් වෙන් වේ → ගේමීට 4ක්

ජාන විවිධත්වය ලැබෙන තැන්:
1. හරස් හුවමාරය — ප්‍රෝපේස් I වලදී සමජාත වර්ණදේහ අතර DNA කොටස් මාරු වේ (කයස්මාටා සෑදේ)
2. ස්වාධීන විසර්ජනය — ෑක් එක් වර්ණදේහ යුගලයක්ම නිකර්තනයේ ඕනෑම පැත්තකට පේළි විය හැක → ගේමීටවලට මව්/පිය වර්ණදේහවල අහම්බ මිශ්‍රණයක් ලැබේ
3. සිදුවන පොහොසත් වීමත් අහම්බෙන්ම — ඕනෑම ශුක්‍රාණුවක් ඕනෑම බිත්තරයක් සමඟ එක් විය හැක

වැරදි වීම්: වර්ණදේහ වෙන් නොවීම (non-disjunction) → වැරදි සංඛ්‍යාවක් ඇති ගේමීට → උදා: ඩවුන් සින්ඩ්‍රෝමය (21 වන වර්ණදේහය තුනක්).

විභාග උපදෙස: "මයෝසිස් ජාන විවිධත්වය ඇති කරන හැටි" ඇහුවොත් — හරස් හුවමාරය සහ ස්වාධීන විසර්ජනය දෙකම ලියන්න, එකකට වාක්‍යයක් බැගින්.`,
    emoji: "🧬",
  },
  {
    keywords: [
      "mitosis",
      "cell division",
      "cell cycle",
      "prophase",
      "metaphase",
      "anaphase",
      "telophase",
      "cytokinesis",
      "spindle fibre",
      "spindle fiber",
    ],
    keywordsSi: ["මයිටෝසිස්", "සම විභාජනය", "විභාජනය", "ප්‍රෝපේස්", "මෙටාපේස්", "ඇනාපේස්", "ටෙලෝපේස්"],
    keywordsSinglish: ["mayitosis", "samawibhajana", "wibhajana"],
    textEn: `🧫 MITOSIS — complete answer

Definition: Mitosis (equational division) is nuclear division producing two genetically identical daughter cells with the same chromosome number as the parent (2n → 2n). Purpose: growth, repair, cell replacement and asexual reproduction.

The four stages:
1. PROPHASE — chromosomes condense and become visible (each = two sister chromatids joined at the centromere), the nuclear membrane breaks down, spindle fibres form
2. METAPHASE — chromosomes line up along the cell equator; spindle fibres attach to centromeres
3. ANAPHASE — spindle fibres shorten; sister chromatids separate and are pulled to opposite poles
4. TELOPHASE — chromatids reach the poles; nuclear membranes reform; chromosomes uncoil

Then CYTOKINESIS: the cytoplasm divides. Animal cells — the membrane furrows inwards; plant cells — a cell plate forms.

Mitosis vs meiosis (learn this table):
• Mitosis: 1 division, 2 cells, 2n → 2n, cells identical — growth and repair
• Meiosis: 2 divisions, 4 cells, 2n → n, cells different — gamete formation

Where: in animals, in most tissues; in plants, mainly at meristems (root and shoot tips).

Exam tip: DNA replication happens in S phase of INTERPHASE, before mitosis starts — never write "chromosomes double during prophase".`,
    textSi: `🧫 මයිටෝසිස් — සම්පූර්ණ උත්තරය

නිර්වචනය: මයිටෝසිස් (සම විභාජනය) යනු මව් සෛලයේ වර්ණදේහ සංඛ්‍යාවම ඇති, ජානමය වශයෙන් සමාන දූ සෛල දෙකක් සාදන න්‍යෂ්ටික විභාජනයයි (2n → 2n). කෘත්‍යය: වර්ධනය, අලුත්වැඩියාව, සෛල මාරුව, අලිංගික ප්‍රජනනය.

අදියර හතර:
1. ප්‍රෝපේස් — වර්ණදේහ ඝන වී දෘශ්‍යමාන වේ (සෑම එකක්ම සෙන්ට්‍රොමියාරයකින් සම්බන්ධ සහෝදර ක්‍රොමැටිඩ් දෙකකි), න්‍යෂ්ටික පටලය කැඩී වැටේ, ත්‍රිකෝණාකාර දාම සෑදේ
2. මෙටාපේස් — වර්ණදේහ සෛලයේ නිකර්තනය මත පේළි ගැසේ; තන්තු සෙන්ට්‍රොමියාර වලට සම්බන්ධ වේ
3. ඇනාපේස් — තන්තු කෙටි වී සහෝදර ක්‍රොමැටිඩ් වෙන් වී ධ්‍රැව දෙක දෙසට ඇදෙයි
4. ටෙලෝපේස් — ක්‍රොමැටිඩ් ධ්‍රැව වලට ළඟා වේ; න්‍යෂ්ටික පටල නැවත සෑදේ; වර්ණදේහ ගැලවී සියුම් වේ

ඉන්පසු සෛලාංග විභාජනය: සත්ත්ව සෛලවල ප්ලාස්ම පටලය මැදින් ඇතුළට ඇදී දෙකට කැපේ; ශාක සෛලවල සෛල බිත්ති තහඩුවක් සෑදී දෙකට වෙන් වේ.

මයිටෝසිස් එදිරිව මයෝසිස් (මේසයම ඉගෙන ගන්න):
• මයිටෝසිස් — විභාජන 1ක්, සෛල 2ක්, වර්ණදේහ සංඛ්‍යාව එලෙසම (2n), සෛල සමානයි → වර්ධනයට/අලුත්වැඩියාවට
• මයෝසිස් — විභාජන 2ක්, සෛල 4ක්, වර්ණදේහ සංඛ්‍යාව අඩු වේ (2n → n), සෛල වෙනස්ය → ගේමීට සෑදීමට

සිදුවන ස්ථානය: සතුන්ගේ බොහෝ පටක වල; ශාකවල මූල/පත්‍රස්ථානීය (මෙරිස්ටම්) ප්‍රදේශවල.

විභාග උපදෙස: DNA ප්‍රතිසංස්ලේෂණය සිදුවන්නේ අන්තර්දියරයේ S කලාපයේදීය — "ප්‍රෝපේස් වලදී වර්ණදේහ දෙගුණ වේ" ලෙස ලිවීම වැරදිය.`,
    emoji: "🧫",
  },
  {
    keywords: [
      "photosynthesis",
      "chlorophyll",
      "chloroplast",
      "calvin cycle",
      "light reaction",
      "light-dependent",
      "light independent",
      "photolysis",
      "rubisco",
      "photosystem",
    ],
    keywordsSi: ["ප්‍රභාසංස්ලේෂණය", "ප්‍රභා", "ක්ලෝරො", "කැල්වින්", "ආලෝක ප්‍රතික්‍රියා"],
    keywordsSinglish: ["prabhasansleshanaya", "prabhasansleshan", "prabhasha", "prabasha", "klorofil"],
    textEn: `🌿 PHOTOSYNTHESIS — complete answer

Definition: Photosynthesis is the process by which green plants convert light energy into chemical energy, using CO₂ and H₂O to make glucose, releasing O₂ as a by-product.

Equation: 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂

Where: chloroplasts — mainly in the palisade and spongy mesophyll cells of the leaf. Chlorophyll in the thylakoid membranes absorbs red and blue light best (green is reflected, so leaves look green).

Stage 1 — LIGHT-DEPENDENT REACTIONS (thylakoid membranes):
• Photolysis: light splits water → O₂ + H⁺ + electrons
• Electrons pass along the electron transport chain (photosystem II → photosystem I)
• ATP and NADPH are produced

Stage 2 — LIGHT-INDEPENDENT REACTIONS / Calvin cycle (stroma):
• CO₂ combines with RuBP (5C) → two 3-carbon molecules (rubisco catalyses this)
• ATP + NADPH reduce them to triose phosphate (G3P)
• G3P → glucose; RuBP is regenerated

Limiting factors: light intensity, CO₂ concentration, temperature, water availability, chlorophyll content.

Exam tip: link structure to function — broad flat leaves (large surface area for light), thin leaves (short diffusion distance), veins (xylem brings water), stomata (gas exchange). That earns the adaptation marks.`,
    textSi: `🌿 ප්‍රභාසංස්ලේෂණය — සම්පූර්ණ උත්තරය

නිර්වචනය: හරිත ශාක ආලෝක ශක්තිය රසායනික ශක්තිය බවට පරිවර්තනය කරමින්, CO₂ සහ ජලය යොදාගෙන ග්ලූකෝස් සාදන ක්‍රියාවලියයි. ඕක්සිජන් අතුරු ඵලයක් ලෙස පිටවේ.

සමීකරණය: 6CO₂ + 6H₂O + ආලෝක ශක්තිය → C₆H₁₂O₆ + 6O₂

සිදුවන ස්ථානය: ක්ලෝරොප්ලාස්ට් — ප්‍රධාන වශයෙන් පත්‍රයේ පැලිසේඩ් සහ ස්පොන්ජි මීසොෆිල් සෛලවල. තයිලකොයිඩ් පටලවල ක්ලෝරොෆිල් රතු සහ නිල් ආලෝකය වැඩිපුර උරා ගනී (කොළ පැහැය පරාවර්තනය වන නිසා පත්‍ර කොළ පැහැ පෙනේ).

අදියර 1 — ආලෝක-යැපෙන ප්‍රතික්‍රියා (තයිලකොයිඩ් පටල):
• ජලයේ ඡායාවර්ජනය: ආලෝකයෙන් ජලය කැඩී → O₂ + H⁺ + ඉලෙක්ට්‍රෝන
• ඉලෙක්ට්‍රෝන පරිවහක දාමය ඔස්සේ ගමන් කරයි
• ATP සහ NADPH නිපදවේ

අදියර 2 — ආලෝක-නොයැපෙන ප්‍රතික්‍රියා / කැල්වින් චක්‍රය (ස්ට්‍රෝමාවේ):
• CO₂, RuBP (C5) සමඟ එක්වී කාබන් 3 සහිත අණු දෙකක් සාදයි (රුබිස්කෝ උත්ප්‍රේරකයයි)
• ATP + NADPH යොදා ඒවා ත්‍රයෝස් පොස්පේට් බවට අඩු කරනු ලැබේ
• ග්ලූකෝස් සෑදේ; RuBP නැවත සෑදේ

සීමා කරන සාධක: ආලෝක තීව්‍රතාව, CO₂ සාන්ද්‍රණය, උෂ්ණත්වය, ජල ලබා ගැනීම, ක්ලෝරොෆිල් ප්‍රමාණය.

විභාග උපදෙස: ව්‍යූහය කෘත්‍යය සමඟ සම්බන්ධ කරන්න — පළල් පත්‍ර (ආලෝකයට විශාල පෘෂ්ඨීය වර්ගඵලයක්), සියුම් පත්‍ර (කෙටි විසරණ දුරක්), නාලිකා (ක්ෂේම දාමයෙන් ජලය), වායුරෝධක (වායු හුවමාරය).`,
    emoji: "🌿",
  },
  {
    keywords: [
      "genetics",
      "mendel",
      "punnett",
      "punnet",
      "allele",
      "genotype",
      "phenotype",
      "dominant",
      "recessive",
      "inheritance",
      "heredity",
      "monohybrid",
      "dihybrid",
      "3:1",
      "9:3:3:1",
    ],
    keywordsSi: ["ප්‍රවේණික", "මෙන්ඩල්", "ජිනෝටයිප්", "ෆීනෝටයිප්", "ඇලීල", "උරුම"],
    keywordsSinglish: ["pravenika", "pravenik", "jayana", "jeenawada"],
    textEn: `📊 MENDELIAN GENETICS — complete answer

Key terms: gene (DNA section coding a protein), allele (different forms of a gene), genotype (alleles present), phenotype (visible trait), dominant (expressed if present — capital letter), recessive (expressed only if homozygous — small letter), homozygous (AA / aa), heterozygous (Aa).

Monohybrid cross (tall × dwarf pea):
P: TT (tall) × tt (dwarf)
F₁: all Tt — all tall, because tall is dominant
F₁ self-cross: Tt × Tt
F₂: genotype ratio 1 TT : 2 Tt : 1 tt — phenotype ratio 3 tall : 1 dwarf

Dihybrid cross (two genes on different chromosomes): phenotype ratio 9 : 3 : 3 : 1 — because the genes assort independently.

Codominance / incomplete dominance: the heterozygote shows both or an intermediate trait (red × white snapdragon → pink).

Sex determination: XX = female, XY = male. The mother always gives an X; the father gives X or Y → boy or girl is a 50 : 50 chance from the father.

How to solve genetics problems:
1. Write the parent phenotypes
2. Write the parent genotypes with letters
3. Draw the Punnett square and complete it
4. State BOTH the genotype ratio AND the phenotype ratio

Exam tip: always show the Punnett square — the marks are in the working, not just the final ratio.`,
    textSi: `📊 මෙන්ඩල් ප්‍රවේණිකය — සම්පූර්ණ උත්තරය

යතුරු වචන: ජානය (ප්‍රෝටීනයක් කේතනය කරන DNA කොටස), ඇලීලය (ජානයක වෙනස් ආකාර), ජිනෝටයිප් (ඇති ඇලීල), ෆීනෝටයිප් (පෙනෙන ලක්ෂණය), ප්‍රබල (තිබ්දා පෙනේ — විශාල අකුර), අව්‍යංග (දෙකම අව්‍යංග නම් පමණක් පෙනේ — කුඩා අකුර), සමයුග්ම (AA / aa), විෂමයුග්ම (Aa).

මොනොහයිබ්‍රිඩ් හරස් කිරීම (උස බෝගා × කෙටි බෝගා):
P: TT (උස) × tt (කෙටි)
F₁: සියල්ලම Tt — සියල්ලම උස (උස ලක්ෂණය ප්‍රබල නිසා)
F₁ නැවත හරස් කිරීම: Tt × Tt
F₂: ජිනෝටයිප් අනුපාතය 1 TT : 2 Tt : 1 tt — ෆීනෝටයිප් අනුපාතය 3 උස : 1 කෙටි

ඩයිහයිබ්‍රිඩ් හරස් කිරීම (වෙනස් වර්ණදේහවල ජාන දෙකක්): ෆීනෝටයිප් අනුපාතය 9 : 3 : 3 : 1 — ජාන ස්වාධීනව විසර්ජනය වන නිසා.

සහ-ප්‍රභලතාව / අපූර්ණ ප්‍රභලතාව: විෂමයුග්ම අවස්ථාවේ ලක්ෂණ දෙකම හෝ මැදි ලක්ෂණයක් පෙනේ (රතු × සුදු → රෝස).

ලිංගය තීරණය: XX = ගැහැණු, XY = පිරිමි. මව සැමවිටම X දෙයි; පියා X හෝ Y දෙයි → දරුවාගේ ලිංගය තීරණය කරන්නේ පියාගෙන් ලැබෙන වර්ණදේහයයි.

ගැටලු විසඳන ක්‍රමය:
1. මාපියන්ගේ ෆීනෝටයිප් ලියන්න
2. ජිනෝටයිප් අකුරු සමඟ ලියන්න
3. පනෙට් කොටුව ඇඳ සම්පූර්ණ කරන්න
4. ජිනෝටයිප් අනුපාතය සහ ෆීනෝටයිප් අනුපාතය දෙකම ලියන්න

විභාග උපදෙස: සෑම විටම පනෙට් කොටුව පෙන්වන්න — ලකුණු ලැබෙන්නේ ක්‍රමලේඛනයටය.`,
    emoji: "📊",
  },
  {
    keywords: [
      "dna",
      "double helix",
      "nucleotide",
      "base pair",
      "replication",
      "gene",
      "genetic code",
      "watson",
      "crick",
      "transcription",
      "translation",
      "mrna",
      "codon",
      "histone",
    ],
    keywordsSi: ["dna", "ඩීඑන්ඒ", "ද්විත්ව හෙලික්ස්", "නියුක්ලියොටයිඩ්", "ප්‍රතිසංස්ලේෂණය"],
    keywordsSinglish: ["deewithwa", "nukliyotaid"],
    textEn: `🧬 DNA — complete answer

Definition: DNA (deoxyribonucleic acid) carries the genetic instructions for the growth, development, functioning and reproduction of all living organisms.

Structure (Watson & Crick, 1953):
• A double helix — two strands twisted around each other
• Each strand is a polymer of nucleotides: deoxyribose sugar + phosphate + nitrogenous base
• Complementary base pairing: A–T (2 hydrogen bonds), G–C (3 hydrogen bonds)
• The two strands are antiparallel (one runs 5'→3', the other 3'→5')

Replication (semi-conservative):
1. Helicase unwinds the helix and breaks the hydrogen bonds
2. Each strand acts as a template
3. Free nucleotides pair with their complementary bases
4. DNA polymerase joins the nucleotides into new strands
5. Result: two identical DNA molecules, each with one old strand and one new strand

From gene to protein:
• Transcription: DNA → mRNA, in the nucleus, by RNA polymerase (RNA uses uracil instead of thymine)
• Translation: mRNA → protein, on ribosomes; tRNA brings amino acids; each codon (3 bases) codes for one amino acid

Exam tip: be ready to explain WHY this structure allows accurate replication — because of complementary base pairing, each strand is a perfect template for the other.`,
    textSi: `🧬 DNA — සම්පූර්ණ උත්තරය

නිර්වචනය: DNA (ඩීඔක්සිරයිබොනියුක්ලෙයික් අම්ලය) සියලුම ජීවීන්ගේ වර්ධනයට, ක්‍රියාකාරිත්වයට සහ ප්‍රජනනයට අවශ්‍ය ජානමය උපදෙස් රැගෙන යන අණුවයි.

ව්‍යූහය (වොට්සන්-ක්‍රික්, 1953):
• ද්විත්ව හෙලික්ස් — එකිනෙක වැටලෙන දාම දෙකක්
• එක් දාමයක් නියුක්ලියොටයිඩ් බහුඅවයවකයි: ඩීඔක්සිරයිබෝස් සීනි + පොස්පේට් කාණ්ඩය + නයිට්‍රජනීය කාබකයක්
• පූරක පාද යුගලනය: A–T (හයිඩ්‍රජන් බන්ධ 2), G–C (හයිඩ්‍රජන් බන්ධ 3)
• දාම දෙක ප්‍රතිසමාන්තර ය (එකක් 5'→3', අනෙක 3'→5')

ප්‍රතිසංස්ලේෂණය (අර්ධ-සංස්ථායී):
1. හෙලිකේස් එන්සයිමය හෙලික්ස් ඇර හයිඩ්‍රජන් බන්ධ කඩයි
2. එක් එක් දාමය අච්චුවක් ලෙස ක්‍රියා කරයි
3. නිදහස් නියුක්ලියොටයිඩ් පූරක පාද සමඟ යුගල වේ
4. DNA පොලිමරේස් නියුක්ලියොටයිඩ් එකිනෙක සම්බන්ධ කරයි
5. ප්‍රතිඵලය: එකසේ ඇති DNA අණු දෙකක් — එකක පැරණි දාමයක්, අලුත් දාමයක්

ජානයෙන් ප්‍රෝටීනයට:
• ප්‍රතිලේඛනය: DNA → mRNA, න්‍යෂ්ටිය තුළ, RNA පොලිමරේස් මගින් (RNA වල තැයිමින් වෙනුවට යුරැසිල්)
• පරිවර්තනය: mRNA → ප්‍රෝටීන්, රයිබොසෝම මත; කෝඩෝනයක් (පාද 3ක්) ඇමයිනෝ අම්ලයක් කේතනය කරයි

විභාග උපදෙස: "මේ ව්‍යූහය නිවැරදි ප්‍රතිසංස්ලේෂණයට ඉඩ දෙන්නේ ඇයි" ඇහුවොත් — පූරක පාද යුගලනය නිසා ෑක් එක් දාමයක්ම අනෙකට සම්පූර්ණ අච්චුවක් වන බව ලියන්න.`,
    emoji: "🧬",
  },
  {
    keywords: [
      "cell",
      "organelle",
      "nucleus",
      "ribosome",
      "mitochondria",
      "golgi",
      "lysosome",
      "vacuole",
      "prokaryote",
      "prokaryotic",
      "eukaryote",
      "eukaryotic",
      "cell membrane",
      "cell wall",
      "er ",
    ],
    keywordsSi: ["සෛල", "න්‍යෂ්ටි", "ඔර්ගනෙල", "රයිබොසෝම", "ලයිසොසෝම", "ගෝල්ගි", "මයිටගකොන්ඩ්"],
    keywordsSinglish: ["sailaya", "saila", "sail", "nukliya"],
    textEn: `🔬 THE CELL — complete answer

Definition: the cell is the basic structural and functional unit of all living organisms. Cell theory: all living things are made of cells, and all cells come from pre-existing cells.

Two types:
• Prokaryotic (bacteria): no true nucleus, no membrane-bound organelles, circular DNA free in the cytoplasm, small (1–5 μm)
• Eukaryotic (plants, animals, fungi): true nucleus (double membrane), membrane-bound organelles, linear DNA, larger (10–100 μm)

Organelles and their jobs:
• Nucleus — stores DNA, controls the cell's activities
• Mitochondrion — aerobic respiration, makes ATP
• Ribosome — protein synthesis
• Rough ER — transports the proteins made on its ribosomes
• Smooth ER — makes lipids, detoxifies
• Golgi apparatus — modifies, packages and secretes proteins
• Lysosome — digestive enzymes; breaks down waste and worn-out organelles
• Chloroplast (plants only) — photosynthesis
• Cell wall (plants only) — cellulose; support and shape
• Large permanent vacuole (plants) — stores water, keeps cells turgid
• Cell membrane — controls entry and exit of substances

Plant vs animal cell: plant cells have a cellulose cell wall, chloroplasts and a large vacuole; animal cells have centrioles instead.

Exam tip: for each organelle learn one function AND one structural adaptation — examiners reward structure-to-function links.`,
    textSi: `🔬 සෛලය — සම්පූර්ණ උත්තරය

නිර්වචනය: සෛලය සියලුම ජීවීන්ගේ මූලික ව්‍යූහමය සහ ක්‍රියාකාරී ඒකකයයි. සෛල වාදය: සෑම ජීවී දෙයක්ම සෛල වලින් සෑදී ඇති අතර සෑම සෛලයක්ම පෙර පැවති සෛලයකින් සෑදේ.

ප්‍රධාන වර්ග දෙක:
• ප්‍රෝකැරියෝටික (බැක්ටීරියා): සැබෑ න්‍යෂ්ටියක් නැත, පටලයෙන් වැසුණු ඔර්ගනෙල නැත, චක්‍රාකාර DNA සෛල ප්ලාස්මයේ නිදහස්ව ඇත, කුඩාය
• යුකැරියෝටික (ශාක, සතුන්): ද්විත්ව පටලයකින් වැසුණු සැබෑ න්‍යෂ්ටියක්, පටලයෙන් වැසුණු ඔර්ගනෙල, රේඛීය DNA, විශාලය

ඔර්ගනෙල සහ කෘත්‍ය:
• න්‍යෂ්ටිය — DNA රඳවා තබයි; සෛලයේ ක්‍රියාකාරකත්වය පාලනය කරයි
• මයිටගකොන්ඩ්‍රියාව — ස්වායු ශ්වසනය; ATP නිපදවයි
• රයිබොසෝමය — ප්‍රෝටීන් සංස්ලේෂණය
• රග් ER — එහි රයිබොසෝම මත සෑදෙන ප්‍රෝටීන් පරිවහනය කරයි
• ස්මූත් ER — ලිපිඩ් සාදයි; විෂ ඉවත් කරයි
• ගෝල්ගි දේහය — ප්‍රෝටීන් වෙනස් කර ඇසුරුම් කර ශ්‍රාවය කරයි
• ලයිසොසෝමය — ජීරක එන්සයිම ඇති; අපද්‍රව්‍ය බිඳ දමයි
• ක්ලෝරොප්ලාස්ට් (ශාක) — ප්‍රභාසංස්ලේෂණය
• සෛල බිත්තිය (ශාක) — සෙලියුලෝස්; සහායකත්වය සහ හැඩය
• විශාල ස්ථිර ශුන්‍යාවකය (ශාක) — ජලය රඳවයි; සෛල තර තබයි
• සෛල පටලය — ඇතුළට/පිටත යන දේ පාලනය කරයි

ශාක සෛලය එදිරිව සත්ත්ව සෛලය: ශාක සෛලයේ සෙලියුලෝස් බිත්තියක්, ක්ලෝරොප්ලාස්ට් සහ විශාල ශුන්‍යාවකයක් ඇත; සත්ත්ව සෛලයේ සෙන්ට්‍රියෝල ඇත.

විභාග උපදෙස: එක් එක් ඔර්ගනෙලයට කෘත්‍යයක් සහ ව්‍යූහමය අනුවර්තනයක් ඉගෙන ගන්න — ව්‍යූහය-කෘත්‍යය සම්බන්ධතාවලට ලකුණු ලැබේ.`,
    emoji: "🔬",
  },
  {
    keywords: [
      "enzyme",
      "catalyst",
      "activation energy",
      "active site",
      "substrate",
      "denature",
      "amylase",
      "catalase",
      "pepsin",
      "lock and key",
      "induced fit",
    ],
    keywordsSi: ["එන්සයිම", "උත්ප්‍රේරක", "සන්ඪාතක", "විකෘත"],
    keywordsSinglish: ["ensaim", "enzaim", "uthprea"],
    textEn: `⚗️ ENZYMES — complete answer

Definition: enzymes are globular proteins that act as biological catalysts — they speed up reactions by lowering the activation energy, and are not used up.

Specificity:
• The active site has a specific 3D shape — only a complementary substrate fits (lock-and-key model)
• Induced-fit model: the active site changes shape slightly to hold the substrate
• Enzyme–substrate complex → products released → the enzyme is reused unchanged

Factors affecting rate:
• Temperature — rate rises to the optimum (~37 °C for human enzymes); above it the enzyme denatures (hydrogen bonds break, active site loses shape) and the rate falls
• pH — each enzyme has an optimum pH (pepsin ≈ 2, amylase ≈ 7); the wrong pH changes active-site charges and shape
• Substrate concentration — rate rises until all active sites are occupied (saturation), then plateaus
• Enzyme concentration — more enzyme = faster, if substrate is plentiful

Examples: amylase (starch → maltose), catalase (H₂O₂ → water + oxygen), pepsin (protein → peptides), DNA polymerase (replication).

Exam tip: in rate graphs, mark the optimum and use the exact word "denatured" to explain the drop after it — that word carries the marks.`,
    textSi: `⚗️ එන්සයිම — සම්පූර්ණ උත්තරය

නිර්වචනය: එන්සයිම යනු ජෛව උත්ප්‍රේරක ලෙස ක්‍රියා කරන ගෝලීය ප්‍රෝටීන ය — ක්‍රියාකාරකත්ව ශක්තිය අඩු කර ප්‍රතික්‍රියා ඉක්මන් කරන අතර එන්සයිමය වැය නොවේ.

විශේෂිත බව:
• ක්‍රියාකාරී ස්ථානයේ විශේෂිත 3D හැඩයක් ඇත — ගැළපෙන සන්ධාතකයක් (substrate) පමණක් ගැළපේ (යතුරු-යොදුන් ආකෘතිය)
• උද්දීපිත-ගැළපුම් ආකෘතිය: සන්ධාතකය බැඳෙන විට ක්‍රියාකාරී ස්ථානය තරමක් හැඩ වෙනස් කරයි
• එන්සයිම-සන්ධාතක සංකීර්ණය → ඵල නිදහස් වේ → එන්සයිමය වෙනස් නොවී නැවත භාවිත වේ

වේගයට බලපාන සාධක:
• උෂ්ණත්වය — ශ්‍රේෂ්ඨ අගය (මිනිස් එන්සයිම වලට ~37 °C) දක්වා වේගය වැඩි වේ; ඊට වඩා උණුසුම් නම් එන්සයිමය විකෘත වේ (හයිඩ්‍රජන් බන්ධ කැඩී ක්‍රියාකාරී ස්ථානයේ හැඩය නැති වේ) → වේගය අඩු වේ
• pH — එක් එන්සයිමයකට ශ්‍රේෂ්ඨ pH අගයක් ඇත (පෙප්සින් ≈ 2, ඇමයිලේස් ≈ 7); වැරදි pH වල හැඩය සහ ආරෝපණ වෙනස් වේ
• සන්ධාතක සාන්ද්‍රණය — සියලු ක්‍රියාකාරී ස්ථාන පිරෙන (සන්චයනය) තුරු වේගය වැඩි වී ඉන්පසු එලෙසම පවතී
• එන්සයිම සාන්ද්‍රණය — සන්ධාතක ඇතිනම් තව තව වේගවත් වේ

උදාහරණ: ඇමයිලේස් (තිරිඟු → මෝල්ටෝස්), කැටලේස් (H₂O₂ → ජලය + ඔක්සිජන්), පෙප්සින් (ප්‍රෝටීන් → පෙප්ටයිඩ්), DNA පොලිමරේස් (ප්‍රතිසංස්ලේෂණය).

විභාග උපදෙස: ප්‍රස්තාරවල ශ්‍රේෂ්ඨ ලක්ෂ්‍යය ලකුණු කර, වේගය අඩු වන හේතුවට "විකෘත විය" (denatured) යන වචනයම භාවිත කරන්න — ලකුණු ඒ වචනයට.`,
    emoji: "⚗️",
  },
  {
    keywords: [
      "respiration",
      "glycolysis",
      "krebs",
      "atp",
      "oxidative phosphorylation",
      "electron transport chain",
      "anaerobic",
      "fermentation",
      "lactate",
      "lactic acid",
      "oxygen debt",
    ],
    keywordsSi: ["ශ්වසනය", "ග්ලයිකොලයිසිස්", "ක්‍රෙබ්ස්", "නිර්වායු"],
    keywordsSinglish: ["swasana", "shwasana", "nirwaya", "nirvaya"],
    textEn: `⚡ RESPIRATION — complete answer

Definition: respiration is the controlled release of energy from glucose to make ATP. It happens in all living cells, all the time.

Aerobic equation: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ~32 ATP

Three stages:
1. GLYCOLYSIS (cytoplasm) — glucose (6C) → 2 pyruvate (3C); net 2 ATP + 2 NADH. Anaerobic step.
2. KREBS CYCLE (mitochondrial matrix) — pyruvate → acetyl CoA, then oxidised in the cycle; CO₂ released; produces NADH, FADH₂ and 2 ATP per glucose.
3. OXIDATIVE PHOSPHORYLATION (inner mitochondrial membrane) — NADH/FADH₂ donate electrons to the transport chain; released energy pumps H⁺ across the membrane; H⁺ flows back through ATP synthase → most of the ATP. Oxygen is the final electron acceptor → water.

Anaerobic respiration (no oxygen):
• Muscle: pyruvate → lactate (causes cramp; oxygen debt)
• Yeast: pyruvate → ethanol + CO₂ (fermentation)
• Only glycolysis runs → just 2 ATP per glucose

Exam tip: "why do cells die without oxygen?" — without O₂ the electron transport chain stops, NADH cannot be reoxidised, so glycolysis and the Krebs cycle halt and no ATP is made.`,
    textSi: `⚡ ශ්වසනය — සම්පූර්ණ උත්තරය

නිර්වචනය: ශ්වසනය යනු ග්ලූකෝස් වලින් ATP නිපදවමින් පාලිත ලෙස ශක්තිය නිදහස් කිරීමයි. සියලුම ජීවී සෛල වල, සැම විටම සිදු වේ.

ස්වායු සමීකරණය: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ATP ~32

අදියර තුන:
1. ග්ලයිකොලයිසිස් (සෛල ප්ලාස්මය) — ග්ලූකෝස් (C6) → පයිරූවේට් 2ක් (C3); ශුද්ධ ATP 2ක් + NADH 2ක්. නිර්වායු පියවරයි.
2. ක්‍රෙබ්ස් චක්‍රය (මයිටගකොන්ඩ්‍රියා මාධ්‍යය) — පයිරූවේට් → ඇසිටයිල් CoA, චක්‍රය තුළ ඔක්සිකරණය වේ; CO₂ නිදහස් වේ; NADH, FADH₂ සහ ATP 2ක් ලැබේ.
3. ඔක්සිකාරක පොස්පොරයිලේෂණය (මයිටගකොන්ඩ්‍රියා අභ්‍යන්තර පටලය) — NADH/FADH₂ වලින් ඉලෙක්ට්‍රෝන දාමයට ලැබේ; ශක්තියෙන් H⁺ පටලය ඔස්සේ පොම්ප වේ; H⁺ නැවත ATP සින්ථේසය හරහා ආපසු ගලා → ATP වැඩි කොටම ලැබේ. ඔක්සිජන් අවසාන ඉලෙක්ට්‍රෝන ග්‍රාහකයයි → ජලය සෑදේ.

නිර්වායු ශ්වසනය (ඔක්සිජන් නැතිව):
• මාංශ පේශි: පයිරූවේට් → ලැක්ටේට් (ලැක්ටික් අම්ලය — ක්‍රෑම්ප් වලට හේතුව; ඔක්සිජන් ණය)
• යීස්ට්: පයිරූවේට් → එතනෝල් + CO₂ (පැණි මැදීම)
• ග්ලයිකොලයිසිස් පමණක් සිදු වේ → ග්ලූකෝස් එකකට ATP 2යි

විභාග උපදෙස: "ඔක්සිජන් නැතුව සෛල මැරෙන්නේ ඇයි?" — ඔක්සිජන් නැති විට ඉලෙක්ට්‍රෝන පරිවහක දාමය නත් වේ; NADH නැවත ඔක්සිකරණය කළ නොහැක; ග්ලයිකොලයිසිස් සහ ක්‍රෙබ්ස් චක්‍රය නත් වේ; ATP සෑදෙන්නේ නැත.`,
    emoji: "⚡",
  },
  {
    keywords: [
      "evolution",
      "natural selection",
      "darwin",
      "speciation",
      "fossil",
      "antibiotic resistance",
      "survival of the fittest",
      "directional selection",
    ],
    keywordsSi: ["පරිණාමය", "ස්වාභාවික වරණය", "ඩාවින්", "පොදු පූර්වජයක්"],
    keywordsSinglish: ["parinamaya", "parinama", "waranaya", "swabawika"],
    textEn: `🌍 EVOLUTION — complete answer

Definition: evolution is the gradual change in the inherited characteristics of a population over many generations. Darwin explained it by natural selection.

Natural selection — step by step:
1. Variation exists within a population (from mutation and sexual reproduction)
2. Resources (food, mates, space) are limited → struggle for existence
3. A selection pressure acts (predators, disease, climate, antibiotics)
4. Individuals with advantageous alleles survive better and reproduce more
5. They pass those alleles on → allele frequency increases over generations
6. Given enough time, the population changes = evolution

Evidence:
• Fossils — show how organisms changed over time (transitional forms)
• Comparative anatomy — homologous structures (same basic origin, different job — e.g. the pentadactyl limb) point to a common ancestor
• Molecular biology — similarities in DNA/proteins between species

Speciation: a population gets geographically isolated → no gene flow → different selection pressures → allele frequencies diverge → eventually the groups can no longer interbreed → new species.

Classic exam example — antibiotic resistance: a random mutation makes one bacterium resistant → it survives the antibiotic while the others die → it reproduces → resistant population. Finishing antibiotic courses and avoiding misuse slows this down.

Exam tip: always write "individuals with advantageous ALLELES survive and REPRODUCE, passing on their alleles" — that sentence is the whole theory.`,
    textSi: `🌍 පරිණාමය — සම්පූර්ණ උත්තරය

නිර්වචනය: පරිණාමය යනු පරම්පරා ගණනාවක් පුරා ජනගහනයක උරුම ලක්ෂණ ක්‍රමයෙන් වෙනස් වීමයි. ඩාවින් මෙය ස්වාභාවික වරණයෙන් පැහැදිලි කළේය.

ස්වාභාවික වරණය — පියවර ගණනාවකින්:
1. ජනගහනය තුළ විවිධත්වයක් ඇත (විකෘති සහ ලිංගික ප්‍රජනනයෙන්)
2. සම්පත් (ආහාර, ලිංගික සහකරුවන්, ඉඩ) සීමිතයි → ජීවත් වීමේ අරගලය
3. වරණ පීඩනයක් ක්‍රියා කරයි (විලෝපිකයෝ, රෝග, දේශගුය, ප්‍රතිජීවක)
4. වාසිදායක ඇලීල ඇති පුද්ගලයෝ වැඩිපුර ජීවත් වී වැඩිපුර ප්‍රජනනය කරයි
5. ඔවුන් ඒ ඇලීල ඊළඟ පරම්පරාවට දෙයි → පරම්පරාවෙන් පරම්පරාවට ඇලීල සංඛ්‍යාතය වැඩි වේ
6. කාලයක් ගත වූ විට ජනගහනය වෙනස් වේ = පරිණාමය

සාක්ෂි:
• දියතල — ජීවීන් කාලයත් සමඟ වෙනස් වූ ආකාරය පෙන්වයි
• සන්සන්දනාත්මක ශාරීර විද්‍යාව — සමසම ව්‍යූහ (එක ම මූලාරම්භය, වෙනස් කෘත්‍ය — උදා: පඤ්චාංගික අත) පොදු පූර්වජයක් හඟවයි
• අණුක ජීව විද්‍යාව — විශේෂ අතර DNA/ප්‍රෝටීන් සමානකම්

විශේෂ සෑදීම: ජනගහනයක් භූගෝලීය වශයෙන් වෙන් වේ → ජාන ගලා ඒම නත් වේ → වෙනස් වරණ පීඩන → ඇලීල සංඛ්‍යාත වෙනස් වේ → අවසානයේ දෙපිරිස අතර ප්‍රජනනය කළ නොහැක → අලුත් විශේෂයකි.

විභාගයට ප්‍රසිද්ධ උදාහරණය — ප්‍රතිජීවක ප්‍රතිරෝධීතාව: අහම්බ විකෘතියකින් එක් බැක්ටීරියාවක් ප්‍රතිජීවකයට ප්‍රතිරෝධී වේ → අනෙක් ඒවා මැරෙන විට එය ජීවත් වී ප්‍රජනනය කරයි → ප්‍රතිරෝධී ජනගහනයක් වේ. ප්‍රතිජීවක වල දුසුරුවීම මෙය ඉක්මන් කරයි.

විභාග උපදෙස: "වාසිදායක ඇලීල ඇති අය ජීවත් වී ප්‍රජනනය කර ඇලීල දෙන නිසා" යන වාක්‍යයම මුළු වාදයයි — එය ලියන්න.`,
    emoji: "🌍",
  },
  {
    keywords: [
      "ecosystem",
      "ecology",
      "food chain",
      "food web",
      "trophic",
      "energy flow",
      "carbon cycle",
      "nitrogen cycle",
      "producer",
      "consumer",
      "decomposer",
      "biodiversity",
      "pollution",
      "population growth",
    ],
    keywordsSi: ["පරිසර පද්ධති", "ආහාර දාම", "කාබන් චක්‍රය", "නයිට්‍රජන් චක්‍රය", "ජෛව විවිධත්වය", "දූෂණය"],
    keywordsSinglish: ["parisara", "parisa", "aharadama", "karbonchakraya"],
    textEn: `🌳 ECOLOGY — complete answer

Levels: individual → population → community → ecosystem.

Key definitions:
• Habitat — where an organism lives
• Population — all individuals of one species in a habitat
• Community — all the populations in a habitat
• Ecosystem — the community together with its physical (abiotic) environment

Energy flow:
• Sun → producers (green plants) → primary consumers → secondary → tertiary
• Only ~10 % of the energy passes to the next trophic level — the rest is lost through respiration (heat), movement, excretion and uneaten parts
• That is why food chains are short (rarely more than 5 levels) and pyramids of energy are always upright

Nutrient cycles:
• Carbon cycle — photosynthesis fixes CO₂; respiration, decomposition and combustion return it; fossil fuels store it
• Nitrogen cycle — nitrogen fixation (bacteria/root nodules) → nitrification → assimilation by plants → feeding → ammonification (decomposers) → denitrification

Interactions: competition (within/between species), predation, mutualism, parasitism.

Exam tip: energy-flow answers need the exact ideas "lost as heat in respiration" and "only about 10 % is transferred to the next level" — write both.`,
    textSi: `🌳 පරිසර පද්ධති — සම්පූර්ණ උත්තරය

මට්ටම්: පුද්ගලයා → ජනගහනය → ප්‍රජාව → පරිසර පද්ධතිය.

යතුරු නිර්වචන:
• වාසස්ථානය — ජීවියෙක් ජීවත් වන තැන
• ජනගහනය — එක් විශේෂයක සියලු පුද්ගලයෝ
• ප්‍රජාව — වාසස්ථානයේ සියලු ජනගහන
• පරිසර පද්ධතිය — ප්‍රජාව + භෞතික (අජෛවික) පරිසරය

ශක්ති ගලාම:
• හිරු → නිෂ්පාදක (හරිත ශාක) → ප්‍රාථමික පාරිභෝක → ද්විතීයික → තෘතීයික
• ඊළඟ පෝෂණ මට්ටමට යන්නේ ශක්තියෙන් ~10 % ක් පමණි — ඉතිරිය ශ්වසනයෙන් (තාපය), චලනයෙන්, විශේෂණයෙන් සහ නොකන කොටස් වලින් නැති වේ
• ඒ නිසාම ආහාර දාම කෙටියි (සාමාන්‍යයෙන් මට්ටම් 5කට වඩා නැති) සහ ශක්ති පිරමීඩ සැමවිටම කුලානයි

පෝෂක චක්‍ර:
• කාබන් චක්‍රය — ප්‍රභාසංස්ලේෂණය CO₂ බැඳ ගනී; ශ්වසනය, දිරාපත් වීම, දහනය නැවත නිදහස් කරයි
• නයිට්‍රජන් චක්‍රය — නයිට්‍රජන් බන්ධනය (බැක්ටීරියා/මූල ගැට) → නයිට්‍රීකරණය → ශාක උරා ගැනීම → ආහාර දාමය → ඇමෝනීකරණය (දිරන්නෝ) → විනයිට්‍රීකරණය

අන්තර්ක්‍රියා: තරගය (එක් විශේෂය තුළ/විශේෂ අතර), විලෝපනය, අන්‍යෝන්‍ය වාසය, පරපෝෂිතවාදය.

විභාග උපදෙස: ශක්ති ගලාම ගැන ලියන විට "ශ්වසනයේදී තාපය ලෙස නැති වේ" සහ "ඊළඟ මට්ටමට සම්ප්‍රේෂණය වන්නේ ~10 % ක් පමණි" යන කරුණු දෙකම ලියන්න.`,
    emoji: "🌳",
  },
  {
    keywords: [
      "nervous system",
      "neurone",
      "neuron",
      "reflex",
      "synapse",
      "brain",
      "spinal cord",
      "impulse",
      "motor neurone",
      "sensory neurone",
      "myelin",
      "acetylcholine",
    ],
    keywordsSi: ["ස්නායු", "ප්‍රතිචාර පථය", "ස්නායු පද්ධති", "සිනැප්ස්", "මොළය", "සුනිකා"],
    keywordsSinglish: ["snayu", "pratichara", "molaya"],
    textEn: `🧠 NERVOUS SYSTEM — complete answer

Structure: CNS (brain + spinal cord) and PNS (nerves). A neurone = cell body + dendrites + axon. The myelin sheath insulates the axon and speeds impulses up.

Reflex arc (learn word-perfect):
stimulus → receptor → sensory neurone → relay neurone (in the spinal cord) → motor neurone → effector (muscle/gland) → response.
Reflexes are fast and automatic and protective — the brain is NOT involved.

Synapse (the gap between two neurones):
1. An impulse reaches the end of the first neurone
2. Vesicles release neurotransmitter (acetylcholine) into the cleft
3. It diffuses across and binds receptors on the next neurone
4. A new impulse starts; an enzyme then breaks the transmitter down
Because only the first side releases transmitter, impulses travel one way only.

Nervous vs hormonal control: nervous = electrical, very fast, short-lived, exact target; hormonal = chemical, slower, longer-lasting, general effect.

Exam tip: for reflex questions, name the five components in order and state "the brain is not involved" — that sentence is worth a mark every time.`,
    textSi: `🧠 ස්නායු පද්ධතිය — සම්පූර්ණ උත්තරය

ව්‍යූහය: මධ්‍යස්නායුක පද්ධතිය (මොළය + සුනිකාව) සහ ප්‍රථ්මස්නායුක පද්ධතිය (ස්නායු). ස්නායුවක් = සෛල කායය + ඩෙන්ඩ්‍රයිට් + ඇක්සනය. මයිලින් උරාව ඇක්සනය තිර කර ප්‍රේරණය ඉක්මන් කරයි.

ප්‍රතිචාර පථය (වචනෙන් වචනය ඉගෙන ගන්න):
උත්තේජය → ග්‍රාහකය → සංවේදී ස්නායුව → සම්බන්ධක ස්නායුව (සුනිකාවේ) → චාලක ස්නායුව → ක්‍රියාකාරී ඉන්ද්‍රියය (මාංශ පේශිය/ග්‍රන්ථිය) → ප්‍රතිචාරය.
ප්‍රතිචාර පථ ඉක්මන්, ස්වයංක්‍රීය සහ ආරක්ෂක ය — මොළය මැදිහත් නොවේ.

සන්නායු සන්ධිය (ස්නායු දෙකක් අතර පරතරය):
1. ප්‍රේරණය පළමු ස්නායුවේ අන්තයට ළඟා වේ
2. කුඩාරු වලින් නියුරෝට්‍රාන්ස්මිටරයක් (ඇසිටයිල්කෝලීන්) නිදහස් වේ
3. එය පරතරය හරහා විසරණය වී ඊළඟ ස්නායුවේ ග්‍රාහක වලට බැඳේ
4. අලුත් ප්‍රේරණයක් ඇති වේ; එන්සයිමයක් ට්‍රාන්ස්මිටරය බිඳ දමයි
නිකුත් කරන්නේ එක් පැත්තක පමණක් නිසා ප්‍රේරණ එක් දිශාවකට පමණක් ගමන් කරයි.

ස්නායුක එදිරිව හෝමෝන පාලනය: ස්නායුක = විද්‍යුත්, ඉතා ඉක්මන්, කෙටි කාලීන, නිශ්චිත ඉලක්කය; හෝමෝන = රසායනික, සෙමින්, දිගු කාලීන, පොදු බලපෑම.

විභාග උපදෙස: ප්‍රතිචාර පථ ප්‍රශ්නවල කොටස් පහ අනුපිළිවෙළින් ලියා "මොළය මැදිහත් නොවේ" යන්නත් ලියන්න — එය සෑම විටම ලකුණකි.`,
    emoji: "🧠",
  },
  {
    keywords: [
      "hormone",
      "endocrine",
      "insulin",
      "glucagon",
      "blood glucose",
      "blood sugar",
      "adrenaline",
      "thyroxine",
      "adh",
      "menstrual",
      "oestrogen",
      "estrogen",
      "progesterone",
      "testosterone",
      "negative feedback",
    ],
    keywordsSi: ["හෝමෝන", "ඉන්සියුලින්", "අන්තරාසර්ථක", "රුධිරයේ සීනි", "මාසික"],
    keywordsSinglish: ["homona", "masika"],
    textEn: `💉 HORMONES — complete answer

Definition: hormones are chemical messengers released by endocrine (ductless) glands directly into the blood. They act only on target organs carrying specific receptors.

Blood glucose control (learn this fully — it is asked every year):
• Blood glucose rises (after a meal) → the pancreas secretes insulin → liver and muscle cells take up glucose and convert it to glycogen → glucose falls
• Blood glucose falls (exercise/fasting) → the pancreas secretes glucagon → liver breaks glycogen back into glucose → glucose rises
• Both routes are negative feedback — the change is reversed back to the normal level

Other key hormones:
• ADH (pituitary) — makes the kidney collecting duct more permeable → water reabsorbed → concentrated urine (osmoregulation)
• Adrenaline (adrenal gland) — fight-or-flight: ↑ heart rate, ↑ breathing rate, glycogen → glucose, pupils dilate
• Thyroxine (thyroid) — sets the metabolic rate
• FSH / LH / oestrogen / progesterone — control the menstrual cycle
• Testosterone — male secondary sexual characteristics

Exam tip: every hormonal answer must name the gland, the hormone, the target organ AND mention negative feedback — four marks live in those four words.`,
    textSi: `💉 හෝමෝන — සම්පූර්ණ උත්තරය

නිර්වචනය: හෝමෝන යනු අන්තරාසර්ථක (නාල නැති) ග්‍රන්ථි වලින් කෙළින්ම රුධිරයට නිදහස් වන රසායනික පණිවිඩකරුවෝ ය. ඒවා ක්‍රියා කරන්නේ විශේෂිත ග්‍රාහක ඇති ඉලක්ක ඉන්ද්‍රියවල පමණි.

රුධිරයේ සීනි පාලනය (සම්පූර්ණයෙන් ඉගෙන ගන්න — ෑක් ෑක් වාරයේම අහනවා):
• ආහාර වේලකින් පසු සීනි ඉහළ යයි → අග්න්‍යාසය ඉන්සියුලින් ශ්‍රාවය කරයි → අක්මාව සහ මාංශ පේශි ග්ලූකෝස් ගෙන ග්ලයිකජන් බවට හරවයි → සීනි අඩු වේ
• ව්‍යායාමයෙන්/උපවාසයෙන් සීනි අඩු වේ → අග්න්‍යාසය ග්ලයිකගන් ශ්‍රාවය කරයි → අක්මාව ග්ලයිකජන් බිඳ ග්ලූකෝස් සාදයි → සීනි ඉහළ යයි
• දෙකම සෘණ ප්‍රතිපෝෂණයි — වෙනස සාමාන්‍ය අගයට ආපසු හැරවේ

වෙනත් වැදගත් හෝමෝන:
• ADH (පිට්යූටරි) — වෘක්කයේ එකතු වන නාලිකා වඩාත් පාරාවශ්‍ය කරයි → ජලය නැවත උරා ගැනේ → සාන්ද්‍රිත මුත්‍රා (ජල සංතුලනය)
• ඇඩ්රනලීන් (ඇඩ්රනල් ග්‍රන්ථිය) — සටන් හෝ පලායෑම: හෘද ස්පන්දනය ↑, හුස්ම ↑, ග්ලයිකජන් → ග්ලූකෝස්, පුපුල් පුළුල් වේ
• තයිරොක්සින් (තයිරොයිඩ්) — පරිවෘත්තීය වේගය පාලනය කරයි
• FSH / LH / ඊස්ට්‍රජන් / ප්‍රොජෙස්ටරෝන් — මාසික චක්‍රය පාලනය කරයි
• ටෙස්ටොස්ටෙරෝන් — පිරිමි ද්විතීයික ලිංගික ලක්ෂණ

විභාග උපදෙස: ෑක් ෑක් හෝමෝන පිළිතුරක ග්‍රන්ථිය, හෝමෝනය, ඉලක්ක ඉන්ද්‍රියය සහ සෘණ ප්‍රතිපෝෂණය — කොටස් හතරම ලියන්න; ලකුණු හතරක් ඒවායින්.`,
    emoji: "💉",
  },
  {
    keywords: [
      "immunity",
      "immune",
      "antibody",
      "antigen",
      "vaccin",
      "pathogen",
      "lymphocyte",
      "white blood cell",
      "phagocyt",
      "hiv",
      "aids",
      "memory cell",
    ],
    keywordsSi: ["ප්‍රතිශක්ති", "ප්‍රතිදේහ", "එන්නත", "ලිම්ෆොසයිට්"],
    keywordsSinglish: ["pratishakti", "pratide", "ennath"],
    textEn: `🛡️ IMMUNITY — complete answer

Lines of defence:
1. Barriers — skin, mucus and cilia, stomach acid, lysozyme in tears
2. Non-specific — phagocytosis (white cells engulf pathogens), inflammation, fever
3. Specific — lymphocytes

Two kinds of lymphocyte:
• B cells — make antibodies: proteins whose binding site is complementary to ONE antigen only, so they clump/neutralise that pathogen specifically
• T cells — killer T cells destroy infected cells; helper T cells activate B cells and phagocytes

Primary vs secondary response:
• First infection — antibodies are made slowly, so you feel ill
• Memory cells stay in the blood for life → second infection — antibodies are made fast and in huge amounts → you feel almost nothing
• Vaccination = weakened/dead pathogen injected → memory cells form WITHOUT the disease

Active vs passive immunity:
• Active — your own antibodies (infection or vaccine): long-lasting
• Passive — antibodies from outside (mother to baby via placenta/breast milk; antiserum injection): immediate but short-lived

HIV destroys helper T cells → the immune system collapses (AIDS) → opportunistic infections.

Exam tip: the word "specific" earns marks — always explain that the antibody's shape is complementary to only one antigen.`,
    textSi: `🛡️ ප්‍රතිශක්තිකරණය — සම්පූර්ණ උත්තරය

ආරක්ෂක මට්ටම්:
1. බාධක — සම, ලෝඩා සහ ලෝමා, බඩවැලේ අම්ලය, කදුළු වල ලයිසොසයිම්
2. අවිශේෂිත — භක්ෂාණ ක්‍රියාව (සුදු රුධිරාණු රෝග කාරක ගිලීම), දැවිල්ල, උණ
3. විශේෂිත — ලිම්ෆොසයිට්

ලිම්ෆොසයිට් වර්ග දෙක:
• B සෛල — ප්‍රතිදේහ සාදයි: බැඳෙන ස්ථානය එක් ප්‍රතිදේහජනකයකට පමණක් පූරක වන ප්‍රෝටීන — ඒ නිසා එම රෝග කාරකය විශේෂිතව අක්‍රීය වේ
• T සෛල — නාශක T සෛල ආසාදිත සෛල විනාශ කරයි; සහායක T සෛල B සෛල සහ භක්ෂාණ සෛල සක්‍රීය කරයි

ප්‍රාථමික එදිරිව ද්විතීයික ප්‍රතිචාරය:
• පළමු ආසාදනය — ප්‍රතිදේහ සෙමින් සෑදේ → ලෙඩ වෙනවා
• මතක සෛල ජීවිතාන්තයම රුධිරයේ රැඳේ → දෙවැනි ආසාදනයේදී ප්‍රතිදේහ ඉක්මනින්, ඉතා වැඩියෙන් සෑදේ → ලෙඩ වෙන්නේ නැහැ
• එන්නත් කිරීම = දුර්වල/මළ රෝග කාරක ඇතුළත් කිරීම → ලෙඩ වීමකින් තොරවම මතක සෛල සෑදේ

සක්‍රීය එදිරිව ක්‍රියාකාරී ප්‍රතිශක්තිය:
• සක්‍රීය — තමන්ගේම ප්‍රතිදේහ (ආසාදනයෙන් හෝ එන්නතෙන්): දිගු කල් පවතී
• ක්‍රියාකාරී (passive) — පිටතින් ලැබෙන ප්‍රතිදේහ (මවගෙන් දරුවාට ගබ්සලය/මව්කිරි හරහා; ප්‍රතිසීරම් එන්නත): ක්ෂණික නමුත් කෙටි කල්

HIV සහායක T සෛල විනාශ කරයි → ප්‍රතිශක්ති පද්ධතිය කඩා වැටේ (AIDS) → අවස්ථාවාදී ආසාදන එයි.

විභාග උපදෙස: "විශේෂිත" (specific) යන වචනයට ලකුණු ලැබේ — ප්‍රතිදේහයේ හැඩය එක් ප්‍රතිදේහජනකයකට පමණක් පූරක වන බව නිතර ලියන්න.`,
    emoji: "🛡️",
  },
  {
    keywords: [
      "kidney",
      "nephron",
      "urine",
      "excretion",
      "urea",
      "dialysis",
      "bowman",
      "glomerulus",
      "glomeruli",
      "collecting duct",
      "loop of henle",
      "osmoregulation",
    ],
    keywordsSi: ["වෘක්ක", "නෙෆ්‍රෝන", "මුත්‍රා", "නික්මීම", "යූරියා", "ජල සංතුලනය"],
    keywordsSinglish: ["wrukka", "vrukka", "muthra"],
    textEn: `🚰 KIDNEY & EXCRETION — complete answer

Excretion = removal of metabolic waste (CO₂, urea, excess water and salts). (Not the same as egestion — removal of undigested food.)

How a nephron makes urine:
1. ULTRA-FILTRATION — blood is filtered at high pressure from the glomerulus into the Bowman's capsule. Water, glucose, salts, amino acids and urea pass through; proteins and blood cells are too big and stay behind.
2. SELECTIVE REABSORPTION — in the proximal tubule, ALL the glucose and amino acids and most water/salts go back into the blood. The loop of Henlé builds a salt gradient so the medulla is concentrated.
3. Collecting duct — ADH controls how much MORE water is reabsorbed here.
4. Urine (urea + excess salts + excess water) → ureter → bladder → urethra.

ADH and osmoregulation (negative feedback):
• Dehydrated (blood too concentrated) → pituitary releases MORE ADH → collecting duct more permeable → more water reabsorbed → small, concentrated urine
• Over-hydrated → LESS ADH → large, dilute urine

Kidney failure: dialysis (blood cleaned through a partially permeable membrane) or a transplant.

Exam tip: "why is there glucose in a diabetic's urine?" — the glucose reabsorption carriers are saturated, because blood glucose is far above normal — the kidney itself is fine.`,
    textSi: `🚰 වෘක්ක සහ නික්මීම — සම්පූර්ණ උත්තරය

නික්මීම = පරිවෘත්තීය අපද්‍රව්‍ය (CO₂, යූරියා, අතිරික්ත ජලය සහ ලුණු) ඉවත් කිරීමයි. (අහාර ජීරණය නොවූ දේ ඉවත් කිරීම — විශේෂණය — මෙයට අයිති නැත.)

නෙෆ්‍රෝනයක් මුත්‍රා සාදන හැටි:
1. අධිපෙරණය — ග්ලොමෙරූලසයේ රුධිරය ඉහළ පීඩනයකින් බෝමන් කැප්සියුලයට පෙරේ. ජලය, ග්ලූකෝස්, ලුණු, ඇමයිනෝ අම්ල සහ යූරියා යනවා; ප්‍රෝටීන් සහ රුධිරාණු ලොකු නිසා ඉතිරි වේ.
2. විශේෂිත නැවත උරා ගැනීම — ආසන්න නාලිකාවේදී සියලුම ග්ලූකෝස් සහ ඇමයිනෝ අම්ල, වැඩි ජලය/ලුණු නැවත රුධිරයට යනවා. හෙන්ලේ ලූපය ලුණු අනුක්‍රමණයක් සාදා මජ්ජාව සාන්ද්‍රිත කරයි.
3. එකතු වන නාලිකාව — ADH මෙහිදී තවත් කොපමණ ජලය උරා ගන්නවද ය පාලනය කරයි.
4. මුත්‍රා (යූරියා + අතිරික්ත ලුණු + අතිරික්ත ජලය) → මුත්‍රාවාහිනීය → මුත්‍රා බහාලය → මුත්‍රාමාර්ගය.

ADH සහ ජල සංතුලනය (සෘණ ප්‍රතිපෝෂණය):
• විජලනය (රුධිරය සාන්ද්‍රිත වේ) → පිට්යූටරි වැඩි ADH නිදහස් කරයි → නාලිකාව වැඩිපුර පාරාවශ්‍ය වේ → වැඩි ජලය නැවත උරා ගැනේ → කුඩා, සාන්ද්‍රිත මුත්‍රා
• ජලය වැඩිපුර → ADH අඩුයි → විශාල, තනුක මුත්‍රා

වෘක්ක අකර්මණ්‍ය වීම: ඩයලිසිස් (අර්ධ පාරාවශ්‍ය පටලයක් හරහා රුධිරය පිරිසිදු කිරීම) හෝ බද්ධ කිරීම.

විභාග උපදෙස: "දියවැඩියා රෝගියෙකුගේ මුත්‍රාවල ග්ලූකෝස් ඇත්තේ ඇයි?" — රුධිර සීනි ඉතා ඉහළ නිසා නැවත උරා ගන්නා වාහක සියල්ල සන්චයනය වී ඇත — වෘක්කයේ දෝෂයක් නොවේ.`,
    emoji: "🚰",
  },
  {
    keywords: [
      "exam",
      "study",
      "revise",
      "revision",
      "prepare",
      "timetable",
      "tips",
      "memoriz",
      "memoris",
      "past paper",
      "how to learn",
      "focus",
    ],
    keywordsSi: ["විභාග", "පුනරීක්ෂණ", "අධ්‍යයන", "කාල සටහන", "ඉගෙන", "උපදෙස"],
    keywordsSinglish: ["wishaga", "wisaga", "punasiri", "adhyayana", "kalhadak"],
    textEn: `📝 EXAM PREPARATION — the complete plan

1. Active recall — close the book and write out everything you remember, then check. Rereading feels productive but teaches you little; testing yourself is what works.
2. Spaced repetition — review each topic on Day 1, 3, 7, 14 and 30. (This app's Smart Revision page schedules exactly this for you.)
3. Past papers — do them TIMED, from the newest 5 years. Question styles repeat far more than you'd expect.
4. Marking schemes — mark your own answers with the official scheme; you learn exactly what earns marks.
5. Weak topics first — rate every topic 1–5; attack the 1s and 2s first, because they improve fastest.
6. Answer structure — definition → explanation → example → labelled diagram. Biology schemes love labelled diagrams.
7. Sleep 7–8 hours — memory consolidates during sleep. An all-nighter before the exam LOWERS your marks.
8. Focus — quiet place, phone in another room, 25–50 minute blocks with short breaks.

Night before: summary sheets only, then sleep early. Morning: light breakfast, arrive early, breathe.

Ask me about any biology topic — photosynthesis, cells, DNA, mitosis, meiosis, enzymes, respiration, genetics, evolution, ecology, nervous system, hormones, immunity or the kidney — and you'll get a complete exam-style answer.`,
    textSi: `📝 විභාග සූදානම — සම්පූර්ණ සැලසුම

1. සක්‍රීය මතකය — පොත වසා මතක ඇති දේ ලියන්න, ඉන්පසු පරීක්ෂා කරන්න. නැවත නැවත කියවීම පහසුයි නමුත් ඉගෙන ගන්නේ අඩුයි; තමන්ව පරීක්ෂා කිරීමය ක්‍රියා කරන්නේ.
2. සුමට පුනරීක්ෂණය — දින 1, 3, 7, 14 සහ 30 වලදී එක් එක් topic නැවත නැරඹිය යුතුය. (මෙම app එකේ "Smart Revision" පිටුව මේ කාලසටහනම ඔබට සාදනවා.)
3. පැරණි ප්‍රශ්න පත්‍ර — කාල සීමාව යටතේ, අලුත්ම අවුරුදු 5 ට ලියන්න. ප්‍රශ්න රටා ඔබ හිතනවට වඩා නැවත නැවත එනවා.
4. ලකුණු දෙන ක්‍රමය — නිල ලකුණු ක්‍රමයෙන් තමන්ගේ උත්තර තමන්ම ලකුණු කරන්න; ලකුණු ලැබෙන තැන් ඉගෙන ගන්නවා.
5. දුර්වල topics පළමුව — සියලු topics 1–5 ලෙස ලකුණු කරන්න; 1 සහ 2 ලැබෙන ඒවා පළමුව අඬන්න — ඒවා වේගයෙන් වැඩි වෙනවා.
6. උත්තර ව්‍යූහය — නිර්වචනය → පැහැදිලි කිරීම → උදාහරණය → ලේබල් කළ රූපයක්. ජීව විද්‍යා ලකුණු ක්‍රම ලේබල් කළ රූප ප්‍රිය කරනවා.
7. පැය 7–8ක් නින්ද — නින්දේදී මතකය ස්ථිර වේ. විභාගයට කලින් දින පුරා නිදාගැනීම ලකුණු අඩු කරනවා.
8. අවධානය — නිශ්ශබ්ද තැනක්, දුරකථනය වෙනත් කාමරයක, මිනිත්තු 25–50 බැගින් කෙටි විවේක සමඟ.

ඉස්සරහට කලින් රාත්‍රිය: සාරාංශ පත්‍ර පමණයි, දිගට නිදාගන්න. උදෑසන: සැහැල්මේ උදේ කෑමක්, පොඩ්ඩක් කලින් එන්න, ගැඹුරු හුස්මක් ගන්න.

ජීව විද්‍යාවේ ඕනෑම topic එකක් ගැන මගෙන් අහන්න — ප්‍රභාසංස්ලේෂණය, සෛලය, DNA, මයිටෝසිස්, මයෝසිස්, එන්සයිම, ශ්වසනය, ප්‍රවේණිකය, පරිණාමය, පරිසර පද්ධති, ස්නායු පද්ධතිය, හෝමෝන, ප්‍රතිශක්තිය හෝ වෘක්ක — සම්පූර්ණ විභාග-මට්ටමේ උත්තරයක් ලැබෙනවා.`,
    emoji: "📝",
  },
];

export interface CyberDTResponse {
  textEn: string;
  textSi?: string;
  emoji: string;
}

const fallbackResponses: CyberDTResponse[] = [
  {
    textEn: `🤖 I don't have a complete note on that exact question yet — but I can still help!

Topics I answer fully (just ask):
• Photosynthesis • Cells • DNA • Mitosis • Meiosis
• Enzymes • Respiration • Genetics • Evolution
• Ecology • Nervous system • Hormones • Immunity • Kidney

Try: "Explain photosynthesis", "What is mitosis?" or "how do I prepare for exams?" — you'll get a full exam-style answer.`,
    textSi: `🤖 ඒ ප්‍රශ්නය ගැන සම්පූර්ණ note එකක් මගේ දැනුමේ තවම නැහැ — ඒත් උදව් කරන්න පුළුවන්!

මම සම්පූර්ණයෙන් උත්තර දෙන topics (අහන්න):
• ප්‍රභාසංස්ලේෂණය • සෛලය • DNA • මයිටෝසිස් • මයෝසිස්
• එන්සයිම • ශ්වසනය • ප්‍රවේණිකය • පරිණාමය
• පරිසර පද්ධති • ස්නායු පද්ධතිය • හෝමෝන • ප්‍රතිශක්තිය • වෘක්ක

මෙහෙම අහලා බලන්න: "Explain photosynthesis", "සෛලය ගැන කියන්න" — සම්පූර්ණ විභාග-මට්ටමේ උත්තරයක් ලැබෙනවා.`,
    emoji: "🤖",
  },
  {
    textEn: `📚 Good question! For a complete exam-style answer, ask me about one of my full topics:

Photosynthesis, Cells, DNA, Mitosis, Meiosis, Enzymes, Respiration, Genetics, Evolution, Ecology, Nervous system, Hormones, Immunity or the Kidney.

And if you're preparing for exams — ask "how do I study for exams?" for a complete revision plan (active recall, spaced repetition, past papers and more).`,
    textSi: `📚 හොඳ ප්‍රශ්නයක්! සම්පූර්ණ විභාග-මට්ටමේ උත්තරයක් වෙනුවෙන්, මගේ සම්පූර්ණ topics වලින් එකක් ගැන අහන්න:

ප්‍රභාසංස්ලේෂණය, සෛලය, DNA, මයිටෝසිස්, මයෝසිස්, එන්සයිම, ශ්වසනය, ප්‍රවේණිකය, පරිණාමය, පරිසර පද්ධති, ස්නායු පද්ධතිය, හෝමෝන, ප්‍රතිශක්තිය, වෘක්ක.

විභාගයට සූදානම් වන්නේ නම් — "විභාගයට සූදානම් වන්නේ කෙසේද?" ඇහුවොත් සම්පූර්ණ පුනරීක්ෂණ සැලසුමක් ලැබෙනවා (සක්‍රීය මතකය, සුමට පුනරීක්ෂණය, පැරණි ප්‍රශ්න පත්‍ර ආදිය).`,
    emoji: "📚",
  },
  {
    textEn: `🔍 I want to give you a COMPLETE answer — and I do have complete notes for the main A/L biology topics.

Ask me like this:
• "Explain photosynthesis"
• "What is DNA?"
• "Compare mitosis and meiosis"
• "How do enzymes work?"
• "Explain the reflex arc"
• "How is urine made in the kidney?"

Ask any of these and you'll get a full, exam-ready answer with definitions, stages, examples and exam tips.`,
    textSi: `🔍 මම ඔබට සම්පූර්ණ උත්තරයක් දෙන්න කැමතියි — ප්‍රධාන A/L ජීව විද්‍යා topics සඳහා සම්පූර්ණ notes මගේ අතේ තියෙනවා.

මෙහෙම අහන්න:
• "ප්‍රභාසංස්ලේෂණය ගැන කියන්න"
• "DNA යනු කුමක්ද?"
• "මයිටෝසිස් සහ මයෝසිස් සංසන්දනය කරන්න"
• "එන්සයිම ක්‍රියා කරන්නේ කෙසේද?"
• "වෘක්කයේ මුත්‍රා සෑදෙන හැටි පැහැදිලි කරන්න"

මේවායින් එකක් ඇහුවොත් නිර්වචන, අදියර, උදාහරණ සහ විභාග උපදෙස සමඟ සම්පූර්ණ උත්තරයක් ලැබෙනවා.`,
    emoji: "🔍",
  },
];

function matchesTopic(message: string, topic: TopicEntry): boolean {
  const lower = message.toLowerCase();
  for (const kw of topic.keywords) {
    const k = kw.toLowerCase();
    // A trailing space marks a "whole word" intent (e.g. "er " means the
    // organelle ER, not the letters inside "harder"). Match it as a word
    // boundary instead of a substring, otherwise every word ending in "er "
    // falsely triggers the cell topic.
    if (k.endsWith(" ")) {
      if (new RegExp(`\\b${k.trim()}\\b`, "i").test(message)) return true;
    } else if (lower.includes(k)) {
      return true;
    }
  }
  for (const kw of topic.keywordsSi) {
    if (message.includes(kw)) return true;
  }
  // Singlish keywords are matched as whole words so "saila" doesn't match
  // "sailing" and short tokens like "eka" stay safe.
  for (const kw of topic.keywordsSinglish) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(message)) return true;
  }
  return false;
}

/** Deterministic fallback pick, so the same question always gets the same answer. */
function stableFallbackIndex(message: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    hash = (hash * 31 + message.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

/**
 * Generates a complete Cyber DT AI answer for a message.
 * The response contains BOTH languages; render it with
 * renderCyberDTResponse() using the detected locale.
 */
export function generateCyberDTResponse(message: string, _locale: CyberDTLocale = "en"): CyberDTResponse {
  // Study-plan / timetable requests need the real AI (they depend on the
  // student's dates, hours and subjects). When the AI is unavailable and we
  // fall back to this knowledge base, don't pretend to answer a single topic
  // — give an honest "AI is busy" message plus a reusable framework.
  if (/\b(plan|timetable|schedule)\b/i.test(message)) {
    return {
      textEn: `📅 I can't build a custom day-by-day plan right now — the AI service is temporarily busy (Google's free tier is overloaded).

What you can do:
• Try again in a few minutes — the AI usually recovers quickly
• Paste your own free Google AI Studio key (🔑 button) — it has its own separate quota and usually works even when the shared key is busy
• Or ask me one biology topic at a time and I'll give you a full exam-style answer right away

In the meantime, here's a reusable A/L revision framework you can adapt to your own dates:
1. Active recall — close the book and write out everything you remember, then check
2. Spaced repetition — review each topic on Day 1, 3, 7, 14 and 30
3. Past papers — do them TIMED, from the newest 5 years
4. Marking schemes — mark your own answers with the official scheme
5. Weak topics first — rate every topic 1–5, attack the 1s and 2s first
6. Answer structure — definition → explanation → example → labelled diagram
7. Sleep 7–8 hours — memory consolidates during sleep`,
      textSi: `📅 මට දැන් ඔයාට විශේෂිත දවස්-වාර සැලසුමක් හදන්න බැහැ — AI සේවාව දැන් තාවකාලිකව busy (Google එකේ free tier එක overloaded).

ඔයාට කරන්න පුළුවන් දේවල්:
• මිනිත්තු කීපයකින් නැවත try කරන්න — AI එක ඉක්මනින් recover වෙනවා
• ඔයාගේ own free Google AI Studio key එක paste කරන්න (🔑 button) — ඒකට separate quota එකක් තියෙනවා, shared key එක busy වුණත් ඔයාගේ key එකෙන් answer එනවා
• නැත්නම් එක biology topic එකක් ගැන අහන්න — මම සම්පූර්ණ exam-style answer එකක් දෙනවා

ඒ අතරේ, ඔයාට adapt කරගන්න පුළුවන් පොදු A/L අධ්‍යයන රාමුවක්:
1. Active recall — පොත වහලා මතක හැම දෙයක්ම ලියන්න, ඊට පස්සේ check කරන්න
2. Spaced repetition — එක topic එක Day 1, 3, 7, 14, 30 වලදී review කරන්න
3. Past papers — TIMED විදිහට, අලුත්ම අවුරුදු 5
4. Marking schemes — official scheme එකෙන් ඔයාගේම answers mark කරන්න
5. Weak topics first — ෑක් topic එකක් 1–5 rate කරන්න, 1 සහ 2 එවා මුලින්ම attack කරන්න
6. Answer structure — definition → explanation → example → labelled diagram
7. පැය 7–8 නින්ද — නින්දේදී memory consolidate වෙනවා`,
      emoji: "📅",
    };
  }
  for (const topic of topicKnowledge) {
    if (matchesTopic(message, topic)) {
      return { textEn: topic.textEn, textSi: topic.textSi, emoji: topic.emoji };
    }
  }
  return fallbackResponses[stableFallbackIndex(message, fallbackResponses.length)] ?? fallbackResponses[0];
}

/**
 * Honest, actionable reply for when the real AI is reachable but busy (the
 * server returned busy:true — Google's free tier is overloaded or out of
 * quota). Unlike the offline knowledge base this never pretends to answer the
 * question; it tells the student to retry, in their own language.
 */
export function getCyberDTAIBusyResponse(_locale: CyberDTLocale = "en"): CyberDTResponse {
  return {
    textEn: `⚠️ I couldn't finish an answer — the AI service is busy right now (Google's free tier is overloaded or out of quota).

Your question wasn't lost. Tap the ↻ button under this message to try again — it usually works within a minute.

If it keeps happening:
• 🔑 Add your own free Google AI Studio key (key button at the top) — it has a separate quota and works even when the shared key is busy
• Or ask me one A/L Biology topic at a time — those are answered instantly from my built-in notes`,
    textSi: `⚠️ උත්තරය සම්පූර්ණ කරන්න බැරි වුණා — AI සේවාව දැන් busy (Google free tier එක overloaded හෝ quota ඉවරයි).

ඔයාගේ ප්‍රශ්නය නැති වුණේ නැහැ. මේ පණිවිඩය යට ඇති ↻ බොත්තම එබලා නැවත try කරන්න — සාමාන්‍යයෙන් මිනිත්තුවක් ඇතුළත වැඩ කරනවා.

නැවත නැවත වුණොත්:
• 🔑 ඔයාගේම free Google AI Studio key එකක් එකතු කරන්න (උඩ ඇති key බොත්තම) — ඒකට වෙනම quota එකක් තියෙනවා, shared key එක busy වුණත් වැඩ කරනවා
• නැත්නම් එක A/L ජීව විද්‍යා topic එකක් ගැන අහන්න — ඒවා මගේ built-in notes වලින් instant උත්තර දෙනවා`,
    emoji: "⚠️",
  };
}

/** Returns the response text in the requested language (English as a fallback). */
export function renderCyberDTResponse(response: CyberDTResponse, locale: CyberDTLocale): string {
  if (locale === "si") return response.textSi ?? response.textEn;
  return response.textEn;
}

/** Gets a bilingual greeting for the chat start. */
export function getCyberDTGreeting(_locale: CyberDTLocale = "en"): CyberDTResponse {
  return {
    textEn: `👋 Hello! I'm Cyber DT AI — your study companion.

Ask me about any biology topic and I'll give you a COMPLETE exam-style answer: photosynthesis, cells, DNA, mitosis, meiosis, enzymes, respiration, genetics, evolution, ecology, nervous system, hormones, immunity or the kidney.

ඔබ සිංහලෙන් ඇහුවොත් මම සිංහලෙන්ම සම්පූර්ණ උත්තරයක් දෙනවා!`,
    textSi: `👋 ආයුබෝවන්! මම Cyber DT AI — ඔබේ අධ්‍යයන සහායකයා.

ජීව විද්‍යාවේ ඕනෑම topic එකක් ගැන අහපුවහම සම්පූර්ණ විභාග-මට්ටමේ උත්තරයක් මම දෙනවා: ප්‍රභාසංස්ලේෂණය, සෛලය, DNA, මයිටෝසිස්, මයෝසිස්, එන්සයිම, ශ්වසනය, ප්‍රවේණිකය, පරිණාමය, පරිසර පද්ධති, ස්නායු පද්ධතිය, හෝමෝන, ප්‍රතිශක්තිය හෝ වෘක්ක.

ඔබ ඉංග්‍රීසියෙන් ඇහුවත් මම ඉංග්‍රීසියෙන්ම උත්තර දෙනවා!`,
    emoji: "🤖",
  };
}
