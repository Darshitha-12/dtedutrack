"use client";

export type CyberDTLocale = "en" | "si";

// Topic knowledge for study-related queries
const topicKnowledge: Record<string, { textEn: string; textSi: string; emoji: string }> = {
  photosynthesis: {
    textEn: "Photosynthesis is the process by which plants convert sunlight, water, and carbon dioxide into oxygen and energy-rich glucose. It happens in the chloroplasts, using chlorophyll to capture light. Light-dependent reactions make ATP and NADPH, then the Calvin cycle fixes CO₂ into sugar — it's how plants make their own food!",
    textSi: "ප්‍රභාසංස්ලේෂණය මගින් ශාක හිරු එළිය, ජලය සහ කාබන් ඩයොක්සයිඩ් ඔක්සිජන් සහ ග්ලූකෝස් බවට හරවයි. ක්ලෝරොප්ලාස්ට් තුළ ක්ලෝරොෆිල් මගින් ආලෝකය ග්‍රහණය කරයි. ආලෝක ප්‍රතික්‍රියා ATP සහ NADPH සාදන අතර, කැල්වින් චක්‍රය CO₂ සීනි බවට පත් කරයි — ශාක තමන්ගේම ආහාර සාදන ක්‍රමය මෙයයි!",
    emoji: "🌿"
  },
  cell: {
    textEn: "The cell is the basic structural, functional, and biological unit of all known organisms. It contains a nucleus with DNA, cytoplasm with organelles (mitochondria make energy, ribosomes build proteins), and a membrane that controls what goes in and out. Prokaryotes have no nucleus; eukaryotes do.",
    textSi: "සෛලය සියලුම ජීවීන්ගේ මූලික ව්‍යූහමය සහ ක්‍රියාකාරී ඒකකයයි. DNA ඇති න්‍යෂ්ටියක්, ප්‍රාණ්වය දෙන මයිටොකොන්ඩ්‍රියා සහ ප්‍රෝටීන් සාදන රයිබොසෝම ඇති සෛල ප්ලාස්මයක්, සහ අතරට එන-යන දේ පාලනය කරන පටලයක් එහි ඇත. ප්‍රෝකැරියෝට්වරුන්ට න්‍යෂ්ටියක් නැත; යුකැරියෝට්වරුන්ට ඇත.",
    emoji: "🔬"
  },
  dna: {
    textEn: "DNA (Deoxyribonucleic acid) carries the genetic instructions for the development, functioning, growth, and reproduction of all known organisms. It's a double helix of nucleotides (A-T, G-C pairs). Genes are DNA segments that code for proteins. DNA → RNA → protein is the central dogma of biology!",
    textSi: "DNA (ඩීඔක්සිරයිබොනියුක්ලෙයික් අම්ලය) සියලුම ජීවීන්ගේ වර්ධනයට, ක්‍රියාකාරිත්වයට සහ ප්‍රජනනයට අවශ්‍ය ජානමය උපදෙස් රැගෙන යයි. එය නියුක්ලියොටයිඩ් (A-T, G-C යුගල) ද්විත්ව හෙලික්ස් එකකි. ජාන යනු ප්‍රෝටීන් සඳහා කේතනය වන DNA කොටස් ය. DNA → RNA → ප්‍රෝටීන් යනු ජීව විද්‍යාවේ මූලික මූලධර්මයයි!",
    emoji: "🧬"
  },
  mitosis: {
    textEn: "Mitosis is cell division producing two identical daughter cells (2n → 2n). Stages: Prophase (chromosomes condense), Metaphase (align at equator), Anaphase (sister chromatids separate), Telophase (nuclear membranes reform). It's for growth and repair — meiosis (2n → n) makes gametes instead.",
    textSi: "මයිටෝසිස් යනු සමාන දූස්ථ සෛල දෙකක් සාදන සෛල විභාජනයයි (2n → 2n). අදියර: ප්‍රෝෆේස් (වර්ණදේහ ඝන වේ), මෙටාෆේස් (නිකර්තනයේ පේළි වේ), ඇනාෆේස් (සහෝදර ක්‍රොමැටිඩ් වෙන් වේ), ටෙලෝෆේස් (න්‍යෂ්ටික පටල නැවත සෑදේ). වර්ධනයට හා අලුත්වැඩියාවට මෙය භාවිත වේ — මයෝසිස් (2n → n) ගේමීටා සාදයි.",
    emoji: "🧫"
  },
  enzyme: {
    textEn: "Enzymes are biological catalysts (mostly proteins) that speed up reactions by lowering activation energy. They're specific (lock-and-key / induced fit), work best at optimal pH and temperature, and can be denatured by heat or extreme pH. Examples: amylase digests starch, catalase breaks down hydrogen peroxide.",
    textSi: "එන්සයිම යනු ක්‍රියාකාරී ද්‍රව්‍ය (බොහෝවිට ප්‍රෝටීන්) වන අතර ක්‍රියාකාරකත්ව ශක්තිය අඩු කර ප්‍රතික්‍රියා ඉක්මන් කරයි. ඒවා විශේෂිත වේ (යතුරු-යොදුන / උද්දීපිත ගැළපීම), ශ්‍රේෂ්ඨ pH සහ උෂ්ණත්වයේ හොඳින් ක්‍රියා කරයි, උණුසුම හෝ අන්ත pH වලින් විනාශ විය හැක.",
    emoji: "⚗️"
  },
  exam: {
    textEn: "Exam strategy: 1) Study past papers under timed conditions, 2) Make a revision timetable with spaced repetition (review on Day 1, 3, 7, 14, 30), 3) Use active recall — close the book and write what you remember, 4) Sleep well before the exam; memory consolidates during sleep. You've got this! 💪",
    textSi: "විභාග උපාය: 1) කාල සීමාව යටතේ පැරණි ප්‍රශ්න පත්‍ර ලියන්න, 2) සුමට පුනරීක්ෂණ කාල සටහනක් සාදන්න (දින 1, 3, 7, 14, 30 වලදී නැවත නැරඹීම), 3) සක්‍රීය මතකය භාවිත කරන්න — පොත වසා මතක ඇති දේ ලියන්න, 4) විභාගයට කලින් හොඳින් නිදාගන්න. ඔබට පුළුවන්! 💪",
    emoji: "📝"
  },
};

const fallbackResponses = [
  { textEn: "That's an interesting question! Cyber DT AI is here to help with your studies. Try asking about photosynthesis, cells, DNA, mitosis or enzymes.", textSi: "බොහොම සිත්ගන්නා ප්‍රශ්නයක්! ඔබේ අධ්‍යයනයට Cyber DT AI සූදානම්. ප්‍රභාසංස්ලේෂණය, සෛල, DNA, මයිටෝසිස් හෝ එන්සයිම ගැන අහලා බලන්න.", emoji: "🤖" },
  { textEn: "I'm Cyber DT AI, your study companion! Ask me about science topics, exams, or how to plan your revision.", textSi: "මම Cyber DT AI, ඔබේ අධ්‍යයන සහායකයා! විද්‍යා මාතෘකා, විභාග හෝ පුනරීක්ෂණ සැලසුම් ගැන අහන්න.", emoji: "🤖" },
  { textEn: "Study hard and stay curious! Knowledge is the key to success. Try one of the quick questions below.", textSi: "උස්සටම අධ්‍යයනය කරන්න සහ දැනීමට කුතහසල් වන්න! දැනුම යනු සාර්ථකත්වයේ යතුරයි. පහළ ඉක්මන් ප්‍රශ්නවලින් එකක් අහලා බලන්න.", emoji: "📚" }
];

export interface CyberDTResponse {
  textEn: string;
  textSi?: string;
  emoji: string;
}

/** Classifies a message into a topic or category */
function classifyMessage(message: string): { category: string; confidence: number } | null {
  const lower = message.toLowerCase();

  if (lower.includes("photo") || lower.includes("plant") || lower.includes("chloro") || lower.includes("light reaction")) {
    return { category: "photosynthesis", confidence: 0.9 };
  }
  if (lower.includes("mito") || lower.includes("meio") || lower.includes("division") || lower.includes("cell cycle")) {
    return { category: "mitosis", confidence: 0.85 };
  }
  if (lower.includes("cell") || lower.includes("organ") || lower.includes("න්‍යෂ්ටි")) {
    return { category: "cell", confidence: 0.85 };
  }
  if (lower.includes("dna") || lower.includes("gene") || lower.includes("genetic") || lower.includes("ජාන")) {
    return { category: "dna", confidence: 0.9 };
  }
  if (lower.includes("enzyme") || lower.includes("catalyst") || lower.includes("එන්සයිම")) {
    return { category: "enzyme", confidence: 0.85 };
  }
  if (lower.includes("exam") || lower.includes("study") || lower.includes("learn") || lower.includes("revise") || lower.includes("විභාග") || lower.includes("පුනරීක්ෂණ")) {
    return { category: "exam", confidence: 0.8 };
  }

  return null;
}

/** Generates a Cyber DT AI response to a message. Always returns a valid response. */
export function generateCyberDTResponse(message: string, locale: CyberDTLocale = "en"): CyberDTResponse {
  const classified = classifyMessage(message);

  // Try topic-specific response
  if (classified) {
    const topic = topicKnowledge[classified.category];
    if (topic) {
      return {
        textEn: topic.textEn,
        textSi: topic.textSi,
        emoji: topic.emoji,
      };
    }
  }

  // Fallback - guaranteed response
  const index = Math.floor(Math.random() * fallbackResponses.length);
  const fallback = fallbackResponses[index] ?? fallbackResponses[0];

  return {
    textEn: fallback.textEn,
    textSi: fallback.textSi,
    emoji: fallback.emoji,
  };
}

/** Renders the response in the chosen language */
export function renderCyberDTResponse(response: CyberDTResponse, locale: CyberDTLocale): string {
  if (locale === "si" && response.textSi) return response.textSi;
  return response.textEn;
}

/** Gets a Cyber DT AI greeting */
export function getCyberDTGreeting(locale: CyberDTLocale = "en"): CyberDTResponse {
  return {
    textEn: "Hello! I'm Cyber DT AI, ready to help with your studies! Ask me anything about biology, exams or revision. 👋",
    textSi: "ආයුබෝවන්! මම Cyber DT AI, ඔබේ අධ්‍යයනයට සූදානම්! ජීව විද්‍යාව, විභාග හෝ පුනරීක්ෂණය ගැන මගෙන් ඕනෑම දෙයක් අහන්න. 👋",
    emoji: "🤖"
  };
}
