"use client";

// Topic knowledge for study-related queries
const topicKnowledge = {
  photosynthesis: {
    textEn: "Photosynthesis is the process by which plants convert sunlight, water, and carbon dioxide into oxygen and energy-rich glucose. It's how plants make their own food!",
    textSi: "ඞඞඞ! බෝජීන උපාධිය බිඳුණු සුද්දේවිත කිරීමට පසුගින් බැඳුම් දැක්වීමට සැකසුම් කරමින්. ඞඞඞ!",
    emoji: "🌿"
  },
  cell: {
    textEn: "The cell is the basic structural, functional, and biological unit of all known organisms. Cells are the smallest unit of life that can replicate independently, and are often called the building blocks of life.",
    textSi: "ඞඞඞ! බලියවන් කොළේන්ද්‍රව්ගේ කල් වෙමින් දිනයක් දෙවිට බලන්නවා ඇත. ඞඞඞ!",
    emoji: "🔬"
  },
  dna: {
    textEn: "DNA (Deoxyribonucleic acid) carries the genetic instructions for the development, functioning, growth, and reproduction of all known organisms and many viruses. It's the blueprint of life!",
    textSi: "DNA (දෙකළොම්ම රතුන) ගුණවේදී පසුගින් ගමනක් නොහිදි. ඞඞඞ!",
    emoji: "🧬"
  }
} as const;

const fallbackResponses = [
  { textEn: "That's an interesting question! Cyber DT AI is here to help with your studies.", textSi: "ඞඞඞ! කොටයේ ක්ෂේත්‍රයේ උද්ධන භාවිතා කරමින්. ඞඞඞ!", emoji: "🤖" },
  { textEn: "I'm Cyber DT AI, your study companion! Ask me about science, exams, or anything else.", textSi: "ඞඞඞ! ඔබ බැඳුම් දර්ශනයක ක්ෂේත්‍ර කිරීමේ කොටයි නැහැ. ඞඞඞ!", emoji: "🤖" },
  { textEn: "Study hard and stay curious! Knowledge is the key to success.", textSi: "ඞඞඞ! පසුබිම සද්ධ සහ උද්ධන භාවිතා කරමින්. ඞඞඞ!", emoji: "📚" }
];

export interface CyberDTResponse {
  textEn: string;
  textSi?: string;
  emoji: string;
}

/** Classifies a message into a topic or category */
function classifyMessage(message: string): { category: string; confidence: number } | null {
  const lower = message.toLowerCase();
  
  if (lower.includes("photo") || lower.includes("plant") || lower.includes("light")) {
    return { category: "photosynthesis", confidence: 0.9 };
  }
  if (lower.includes("cell") || lower.includes("biology") || lower.includes("organ")) {
    return { category: "cell", confidence: 0.85 };
  }
  if (lower.includes("dna") || lower.includes("gene") || lower.includes("genetic")) {
    return { category: "dna", confidence: 0.9 };
  }
  if (lower.includes("exam") || lower.includes("study") || lower.includes("learn")) {
    return { category: "general", confidence: 0.8 };
  }
  
  return null;
}

/** Generates a Cyber DT AI response to a message */
export function generateCyberDTResponse(message: string): CyberDTResponse {
  const language = navigator.languages?.[0]?.startsWith("si") ? "si" : "en";
  const classified = classifyMessage(message);
  
  // Try topic-specific response
  if (classified) {
    const topic = topicKnowledge[classified.category as keyof typeof topicKnowledge];
    if (topic) {
      const response = language === "si" ? topic : { ...topic, textSi: undefined };
      return response as CyberDTResponse;
    }
  }
  
  // Fallback - guaranteed response
  const fallback = fallbackResponses.find(r => r.textEn !== undefined);
  const guaranteedFallback = fallback || {
    textEn: "Cyber DT AI here! How can I help?",
    textSi: undefined,
    emoji: "🤖"
  };
  
  return {
    ...guaranteedFallback,
    textSi: language === "si" ? guaranteedFallback.textSi! : undefined,
    textEn: language === "en" ? guaranteedFallback.textEn! : undefined
  } as CyberDTResponse;
}

/** Gets a random Cyber DT AI greeting */
export function getCyberDTGreeting(): CyberDTResponse {
  const greetings = [
    {
      textEn: "Hello! I'm Cyber DT AI, ready to help with your studies! 👋",
      textSi: "ඞඞඞ! මිනිස් Cyber DT AI, ඔබගේ සඳහා සැකසුම් කරමින්! 👋",
      emoji: "🤖"
    }
  ];
  
  return greetings[0];
}
