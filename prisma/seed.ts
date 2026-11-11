import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("========================================");
  console.log("  BioPulse DEMO Seed Script");
  console.log("  ⚠  This is DEMO content only.");
  console.log("========================================\n");

  // Clean existing content
  console.log("Cleaning existing content_subjects cascade...");
  await prisma.contentLearningObjective.deleteMany();
  await prisma.contentSubtopic.deleteMany();
  await prisma.contentTopic.deleteMany();
  await prisma.contentUnit.deleteMany();
  await prisma.contentSubject.deleteMany();
  console.log("Existing content cleared.\n");

  // ─── Subject: Biology ──────────────────────────────────────────────
  console.log("Creating Subject: Biology...");

  const biology = await prisma.contentSubject.create({
    data: {
      id: "bio",
      slug: "biology",
      name: "Biology",
      nameSi: "ජීව විද්‍යාව",
      description:
        "Complete A/L Biology curriculum covering cell biology, molecular biology, genetics, ecology, and more.",
      descriptionSi:
        "කෝෂ ජීව විද්‍යාව, අණුක ජීව විද්‍යාව, ජාන විද්‍යාව, පරිසර විද්‍යාව සහ තවත් බොහෝ දේ ආවරණය කරන සම්පූර්ණ A/L ජීව විද්‍යා පාඨ්‍යක්‍රමය.",
      icon: "🧬",
      color: "#10B981",
      status: "DEMO",
      source: "DEMO",
    },
  });
  console.log("  ✓ Subject: Biology created");

  // ─── Unit 1: Cell Biology ──────────────────────────────────────────
  console.log("\nCreating Unit 1: Cell Biology...");

  const cellBiology = await prisma.contentUnit.create({
    data: {
      id: "unit-cell-biology",
      slug: "cell-biology",
      title: "Cell Biology",
      titleSi: "සිංහල Cell Biology",
      description:
        "Explore the fundamental unit of life — cells. Learn about their structure, organelles, and how they divide.",
      descriptionSi:
        "ජීවයේ මූලික ඒකකය — සෛල ගැන ඉගෙන ගන්න. ඒවායේ ව්‍යුහය, අංග සහ ඒවා බෙදෙන ආකාරය ඉගෙන ගන්න.",
      order: 1,
      estimatedMinutes: 240,
      status: "DEMO",
      source: "DEMO",
      subjectId: biology.id,
    },
  });
  console.log("  ✓ Unit: Cell Biology created");

  // ── Topic 1: Cell Structure ──
  console.log("  Creating Topic 1: Cell Structure...");

  const cellStructure = await prisma.contentTopic.create({
    data: {
      id: "topic-cell-structure",
      slug: "cell-structure",
      title: "Cell Structure",
      titleSi: "සිංහල Cell Structure",
      description:
        "Understand the components of plant and animal cells including organelles, membranes, and cytoplasm.",
      descriptionSi:
        "ශාක සහ සතුන්ගේ සෛලවල සංඝටක ඇතුළත් අංග, ඝනපට, සහ සයිටෝප්ලාස්මය තේරුම් ගන්න.",
      order: 1,
      difficulty: "beginner",
      importance: "high",
      examRelevance: 80,
      estimatedMinutes: 90,
      status: "DEMO",
      source: "DEMO",
      unitId: cellBiology.id,
    },
  });

  // Subtopic: Plant Cell
  const plantCell = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-plant-cell",
      slug: "plant-cell",
      title: "Plant Cell",
      titleSi: "සිංහල Plant Cell",
      description:
        "Structure and organelles unique to plant cells including the cell wall, chloroplasts, and large central vacuole.",
      descriptionSi:
        "සෛල බිත්තිය, හරිතලවක සහ විශාල මධ්‍ය හිස් කුටීරය ඇතුළත් ශාක සෛලවලට ආවේණික ව්‍යුහය සහ අංග.",
      content:
        "Plant cells are eukaryotic cells that have a rigid cell wall, chloroplasts for photosynthesis, and a large central vacuole for storage and maintaining turgor pressure. Key organelles include the nucleus, mitochondria, endoplasmic reticulum, Golgi apparatus, ribosomes, and lysosomes.",
      order: 1,
      estimatedMinutes: 45,
      status: "DEMO",
      source: "DEMO",
      topicId: cellStructure.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-identify-plant-cell-organelles",
        slug: "identify-plant-cell-organelles",
        title: "Identify key plant cell organelles",
        titleSi: "සිංහල Identify key plant cell organelles",
        description: "Label and describe the function of each plant cell organelle including cell wall, chloroplasts, and vacuole.",
        descriptionSi: "සිංහල Label and describe the function of each plant cell organelle",
        order: 1,
        difficulty: "beginner",
        status: "DEMO",
        source: "DEMO",
        subtopicId: plantCell.id,
      },
      {
        id: "lo-compare-plant-animal-cells",
        slug: "compare-plant-animal-cells",
        title: "Compare plant and animal cells",
        titleSi: "සිංහල Compare plant and animal cells",
        description: "Explain the key differences between plant and animal cells in terms of structure and function.",
        descriptionSi: "සිංහල Explain the key differences between plant and animal cells",
        order: 2,
        difficulty: "beginner",
        status: "DEMO",
        source: "DEMO",
        subtopicId: plantCell.id,
      },
    ],
  });

  // Subtopic: Animal Cell
  const animalCell = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-animal-cell",
      slug: "animal-cell",
      title: "Animal Cell",
      titleSi: "සිංහල Animal Cell",
      description:
        "Structure and organelles of animal cells including the nucleus, mitochondria, and centrioles.",
      descriptionSi:
        "න්‍යෂ්ටිය, මයිටොකොන්ඩ්‍රියා සහ සෙන්ට්‍රියෝල ඇතුළත් සතුන්ගේ සෛලවල ව්‍යුහය සහ අංග.",
      content:
        "Animal cells are eukaryotic cells that lack a cell wall but contain centrioles for cell division. They have lysosomes for intracellular digestion, a cytoskeleton for structural support, and smaller vacuoles compared to plant cells. The cell membrane is the outermost layer.",
      order: 2,
      estimatedMinutes: 45,
      status: "DEMO",
      source: "DEMO",
      topicId: cellStructure.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-describe-animal-cell-organelles",
        slug: "describe-animal-cell-organelles",
        title: "Describe animal cell organelles and their functions",
        titleSi: "සිංහල Describe animal cell organelles and their functions",
        description: "List and explain the function of major animal cell organelles.",
        descriptionSi: "සිංහල List and explain the function of major animal cell organelles",
        order: 1,
        difficulty: "beginner",
        status: "DEMO",
        source: "DEMO",
        subtopicId: animalCell.id,
      },
      {
        id: "lo-identify-centrioles-role",
        slug: "identify-centrioles-role",
        title: "Identify the role of centrioles in cell division",
        titleSi: "සිංහල Identify the role of centrioles in cell division",
        description: "Explain how centrioles assist in forming the spindle during cell division.",
        descriptionSi: "සිංහල Explain how centrioles assist in forming the spindle during cell division",
        order: 2,
        difficulty: "beginner",
        status: "DEMO",
        source: "DEMO",
        subtopicId: animalCell.id,
      },
    ],
  });

  // ── Topic 2: Cell Division ──
  console.log("  Creating Topic 2: Cell Division...");

  const cellDivision = await prisma.contentTopic.create({
    data: {
      id: "topic-cell-division",
      slug: "cell-division",
      title: "Cell Division",
      titleSi: "සිංහල Cell Division",
      description:
        "Study the processes of mitosis and meiosis — how cells replicate and produce gametes.",
      descriptionSi:
        "මයිටෝසිස් සහ මයෝසිස් ක්‍රියාවලි අධ්‍යයනය — සෛල ප්‍රතිපාතනය සහ ගැමීට නිෂ්පාදනය කරන ආකාරය.",
      order: 2,
      difficulty: "intermediate",
      importance: "high",
      examRelevance: 90,
      estimatedMinutes: 150,
      status: "DEMO",
      source: "DEMO",
      unitId: cellBiology.id,
    },
  });

  // Subtopic: Mitosis
  const mitosis = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-mitosis",
      slug: "mitosis",
      title: "Mitosis",
      titleSi: "සිංහල Mitosis",
      description:
        "The process of nuclear division producing two genetically identical daughter cells — prophase, metaphase, anaphase, and telophase.",
      descriptionSi:
        "ස්ථානික වශයෙන් සමාන දේහපාලි සෛල දෙකක් නිපදවන න්‍යෂ්ටි බෙදීමේ ක්‍රියාවලිය — ප්‍රෝෆේස්, මෙටාෆේස්, අනාෆේස් සහ ටෙලෝෆේස්.",
      content:
        "Mitosis is a type of cell division that results in two daughter cells each having the same number and kind of chromosomes as the parent nucleus. It is essential for growth, repair, and asexual reproduction. The phases are prophase, prometaphase, metaphase, anaphase, and telophase, followed by cytokinesis.",
      order: 1,
      estimatedMinutes: 75,
      status: "DEMO",
      source: "DEMO",
      topicId: cellDivision.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-describe-phases-of-mitosis",
        slug: "describe-phases-of-mitosis",
        title: "Describe each phase of mitosis in order",
        titleSi: "සිංහල Describe each phase of mitosis in order",
        description: "Name and describe prophase, metaphase, anaphase, and telophase.",
        descriptionSi: "සිංහල Name and describe prophase, metaphase, anaphase, and telophase",
        order: 1,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: mitosis.id,
      },
      {
        id: "lo-explain-role-of-mitosis",
        slug: "explain-role-of-mitosis",
        title: "Explain the biological significance of mitosis",
        titleSi: "සිංහල Explain the biological significance of mitosis",
        description: "Discuss why mitosis is important for growth, repair, and homeostasis.",
        descriptionSi: "සිංහල Discuss why mitosis is important for growth, repair, and homeostasis",
        order: 2,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: mitosis.id,
      },
    ],
  });

  // Subtopic: Meiosis
  const meiosis = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-meiosis",
      slug: "meiosis",
      title: "Meiosis",
      titleSi: "සිංහල Meiosis",
      description:
        "Reduction division producing four haploid gametes — meiosis I and meiosis II, crossing over, and genetic variation.",
      descriptionSi:
        "හප්ලොයිඩ් ගැමීට සියල්ලන්ගෙන් ස්ථානික ලෙස නිපදවන අඩුකිරීමේ බෙදීම — මයෝසිස් I සහ මයෝසිස් II, හරහා යාම, සහ ජාන විවිධත්වය.",
      content:
        "Meiosis is a special type of cell division that reduces the chromosome number by half, producing four haploid cells. It occurs in two stages: meiosis I (separation of homologous chromosomes) and meiosis II (separation of sister chromatids). Crossing over during prophase I introduces genetic variation.",
      order: 2,
      estimatedMinutes: 75,
      status: "DEMO",
      source: "DEMO",
      topicId: cellDivision.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-compare-mitosis-meiosis",
        slug: "compare-mitosis-meiosis",
        title: "Compare and contrast mitosis and meiosis",
        titleSi: "සිංහල Compare and contrast mitosis and meiosis",
        description: "Create a table highlighting differences in purpose, process, and outcomes.",
        descriptionSi: "සිංහල Create a table highlighting differences in purpose, process, and outcomes",
        order: 1,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: meiosis.id,
      },
      {
        id: "lo-explain-crossing-over",
        slug: "explain-crossing-over",
        title: "Explain how crossing over contributes to genetic diversity",
        titleSi: "සිංහල Explain how crossing over contributes to genetic diversity",
        description: "Describe the mechanism of crossing over and its importance.",
        descriptionSi: "සිංහල Describe the mechanism of crossing over and its importance",
        order: 2,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: meiosis.id,
      },
    ],
  });

  // ─── Unit 2: Molecular Biology ─────────────────────────────────────
  console.log("\nCreating Unit 2: Molecular Biology...");

  const molecularBiology = await prisma.contentUnit.create({
    data: {
      id: "unit-molecular-biology",
      slug: "molecular-biology",
      title: "Molecular Biology",
      titleSi: "සිංහල Molecular Biology",
      description:
        "Dive into the molecular mechanisms of life — DNA structure, replication, and protein synthesis.",
      descriptionSi:
        "ජීවයේ අණුක යාන්ත්‍රණයන් ගැන ගැඹුරට යන්න — DNA ව්‍යුහය, ප්‍රතිපාතනය සහ ප්‍රෝටීන සංශ්ලේෂණය.",
      order: 2,
      estimatedMinutes: 300,
      status: "DEMO",
      source: "DEMO",
      subjectId: biology.id,
    },
  });
  console.log("  ✓ Unit: Molecular Biology created");

  // ── Topic 3: DNA Structure ──
  console.log("  Creating Topic 3: DNA Structure...");

  const dnaStructure = await prisma.contentTopic.create({
    data: {
      id: "topic-dna-structure",
      slug: "dna-structure",
      title: "DNA Structure",
      titleSi: "සිංහල DNA Structure",
      description:
        "Learn about the double helix model of DNA, base pairing rules, and the process of DNA replication.",
      descriptionSi:
        "DNA හි ද්විත්ව හෙලික්ස් ආකෘතිය, මූල සම්බන්ධතා නීති සහ DNA ප්‍රතිපාතන ක්‍රියාවලිය ගැන ඉගෙන ගන්න.",
      order: 1,
      difficulty: "intermediate",
      importance: "critical",
      examRelevance: 95,
      estimatedMinutes: 150,
      status: "DEMO",
      source: "DEMO",
      unitId: molecularBiology.id,
    },
  });

  // Subtopic: DNA Double Helix
  const dnaDoubleHelix = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-dna-double-helix",
      slug: "dna-double-helix",
      title: "DNA Double Helix",
      titleSi: "සිංහල DNA Double Helix",
      description:
        "Watson and Crick's model of DNA — the antiparallel sugar-phosphate backbone, nitrogenous base pairing, and hydrogen bonds.",
      descriptionSi:
        "DNA හි වොට්සන් සහ ක්‍රික් ආකෘතිය — ප්‍රතිවිරුද්ධ සීනි-ෆොස්ෆේට් කොඳු ඇටය, නයිට්‍රජනීය මූල සම්බන්ධතා, සහ ස්ථානික සබඳතා.",
      content:
        "DNA is a double-stranded helical molecule composed of nucleotides. Each nucleotide contains a deoxyribose sugar, a phosphate group, and one of four nitrogenous bases: adenine (A), thymine (T), guanine (G), or cytosine (C). The two strands run antiparallel and are held together by hydrogen bonds between complementary base pairs (A-T and G-C).",
      order: 1,
      estimatedMinutes: 75,
      status: "DEMO",
      source: "DEMO",
      topicId: dnaStructure.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-describe-dna-structure",
        slug: "describe-dna-structure",
        title: "Describe the structure of the DNA double helix",
        titleSi: "සිංහල Describe the structure of the DNA double helix",
        description: "Label the components of a nucleotide and explain base pairing rules.",
        descriptionSi: "සිංහල Label the components of a nucleotide and explain base pairing rules",
        order: 1,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: dnaDoubleHelix.id,
      },
      {
        id: "lo-explain-base-pairing",
        slug: "explain-base-pairing",
        title: "Explain Chargaff's base pairing rules",
        titleSi: "සිංහල Explain Chargaff's base pairing rules",
        description: "State Chargaff's rules and explain why A pairs with T and G pairs with C.",
        descriptionSi: "සිංහල State Chargaff's rules and explain why A pairs with T and G pairs with C",
        order: 2,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: dnaDoubleHelix.id,
      },
    ],
  });

  // Subtopic: DNA Replication
  const dnaReplication = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-dna-replication",
      slug: "dna-replication",
      title: "DNA Replication",
      titleSi: "සිංහල DNA Replication",
      description:
        "Semi-conservative replication — unwinding, primer binding, elongation, and proofreading.",
      descriptionSi:
        "අර්ධ-සංරක්ෂිත ප්‍රතිපාතනය — විසුරුම, ප්‍රයෝමක බැඳීම, දිගු කිරීම සහ පරීක්ෂා කිරීම.",
      content:
        "DNA replication is semi-conservative, meaning each new DNA molecule consists of one old strand and one new strand. The process involves helicase unwinding the double helix, primase laying RNA primers, DNA polymerase III adding nucleotides in the 5' to 3' direction, and DNA ligase joining Okazaki fragments on the lagging strand. DNA polymerase I replaces RNA primers with DNA, and proofreading mechanisms ensure accuracy.",
      order: 2,
      estimatedMinutes: 75,
      status: "DEMO",
      source: "DEMO",
      topicId: dnaStructure.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-explain-semiconservative-replication",
        slug: "explain-semiconservative-replication",
        title: "Explain the semi-conservative model of DNA replication",
        titleSi: "සිංහල Explain the semi-conservative model of DNA replication",
        description: "Describe how each new DNA molecule retains one original strand.",
        descriptionSi: "සිංහල Describe how each new DNA molecule retains one original strand",
        order: 1,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: dnaReplication.id,
      },
      {
        id: "lo-identify-replication-enzymes",
        slug: "identify-replication-enzymes",
        title: "Identify the enzymes involved in DNA replication",
        titleSi: "සිංහල Identify the enzymes involved in DNA replication",
        description: "List and describe the function of helicase, primase, DNA polymerase, and ligase.",
        descriptionSi: "සිංහල List and describe the function of helicase, primase, DNA polymerase, and ligase",
        order: 2,
        difficulty: "intermediate",
        status: "DEMO",
        source: "DEMO",
        subtopicId: dnaReplication.id,
      },
    ],
  });

  // ── Topic 4: Protein Synthesis ──
  console.log("  Creating Topic 4: Protein Synthesis...");

  const proteinSynthesis = await prisma.contentTopic.create({
    data: {
      id: "topic-protein-synthesis",
      slug: "protein-synthesis",
      title: "Protein Synthesis",
      titleSi: "සිංහල Protein Synthesis",
      description:
        "The central dogma of molecular biology — transcription of DNA to mRNA and translation at ribosomes.",
      descriptionSi:
        "අණුක ජීව විද්‍යාවේ මධ්‍ය මතය — DNA සිට mRNA ට පරිවර්තනය සහ රයිබොසෝමවල පරිවර්තනය.",
      order: 2,
      difficulty: "advanced",
      importance: "high",
      examRelevance: 85,
      estimatedMinutes: 150,
      status: "DEMO",
      source: "DEMO",
      unitId: molecularBiology.id,
    },
  });

  // Subtopic: Transcription
  const transcription = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-transcription",
      slug: "transcription",
      title: "Transcription",
      titleSi: "සිංහල Transcription",
      description:
        "RNA polymerase binding, initiation, elongation, and termination — producing mRNA from a DNA template.",
      descriptionSi:
        "RNA පොලිමරේස් බැඳීම, ආරම්භය, දිගු කිරීම සහ අවසන් කිරීම — DNA මූලාවරණයෙන් mRNA නිෂ්පාදනය.",
      content:
        "Transcription is the process of copying a segment of DNA into mRNA. RNA polymerase binds to the promoter region, unwinds the DNA, and synthesizes a complementary RNA strand in the 5' to 3' direction. The process has three stages: initiation, elongation, and termination. In eukaryotes, the pre-mRNA undergoes processing including 5' capping, 3' polyadenylation, and splicing to remove introns.",
      order: 1,
      estimatedMinutes: 75,
      status: "DEMO",
      source: "DEMO",
      topicId: proteinSynthesis.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-describe-transcription-process",
        slug: "describe-transcription-process",
        title: "Describe the process of transcription",
        titleSi: "සිංහල Describe the process of transcription",
        description: "Outline the steps of initiation, elongation, and termination in transcription.",
        descriptionSi: "සිංහල Outline the steps of initiation, elongation, and termination in transcription",
        order: 1,
        difficulty: "advanced",
        status: "DEMO",
        source: "DEMO",
        subtopicId: transcription.id,
      },
      {
        id: "lo-explain-rna-processing",
        slug: "explain-rna-processing",
        title: "Explain post-transcriptional RNA processing",
        titleSi: "සිංහල Explain post-transcriptional RNA processing",
        description: "Describe 5' capping, polyadenylation, and splicing of pre-mRNA.",
        descriptionSi: "සිංහල Describe 5' capping, polyadenylation, and splicing of pre-mRNA",
        order: 2,
        difficulty: "advanced",
        status: "DEMO",
        source: "DEMO",
        subtopicId: transcription.id,
      },
    ],
  });

  // Subtopic: Translation
  const translation = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-translation",
      slug: "translation",
      title: "Translation",
      titleSi: "සිංහල Translation",
      description:
        "mRNA decoding at the ribosome — codons, tRNA, amino acids, and polypeptide chain assembly.",
      descriptionSi:
        "රයිබොසෝමයේ mRNA විකේතනය — කෝඩෝන, tRNA, ඇමයිනෝ අම්ල සහ පොලිපෙප්ටයිඩ් දාම සංයෝජනය.",
      content:
        "Translation occurs at ribosomes where mRNA is decoded to synthesize polypeptide chains. Transfer RNA (tRNA) molecules carry specific amino acids to the ribosome, matching their anticodons with mRNA codons. The process involves initiation (small ribosomal subunit binding), elongation (peptide bond formation and translocation), and termination (release factor binding at stop codons). The resulting polypeptide folds into a functional protein.",
      order: 2,
      estimatedMinutes: 75,
      status: "DEMO",
      source: "DEMO",
      topicId: proteinSynthesis.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-explain-translation-process",
        slug: "explain-translation-process",
        title: "Explain the stages of translation at the ribosome",
        titleSi: "සිංහල Explain the stages of translation at the ribosome",
        description: "Describe initiation, elongation, and termination in translation.",
        descriptionSi: "සිංහල Describe initiation, elongation, and termination in translation",
        order: 1,
        difficulty: "advanced",
        status: "DEMO",
        source: "DEMO",
        subtopicId: translation.id,
      },
      {
        id: "lo-read-codon-table",
        slug: "read-codon-table",
        title: "Read and use the genetic codon table",
        titleSi: "සිංහල Read and use the genetic codon table",
        description: "Translate mRNA codons into amino acids using the standard codon table.",
        descriptionSi: "සිංහල Translate mRNA codons into amino acids using the standard codon table",
        order: 2,
        difficulty: "advanced",
        status: "DEMO",
        source: "DEMO",
        subtopicId: translation.id,
      },
    ],
  });

  // ─── Unit 3: Ecology ───────────────────────────────────────────────
  console.log("\nCreating Unit 3: Ecology...");

  const ecology = await prisma.contentUnit.create({
    data: {
      id: "unit-ecology",
      slug: "ecology",
      title: "Ecology",
      titleSi: "සිංහල Ecology",
      description:
        "Understand how organisms interact with each other and their environment — from food chains to biodiversity.",
      descriptionSi:
        "ආහාර දාම සිට ජෛව විවිධත්වය දක්වා — ක්ෂුද්‍ර ජීවීන් එකිනෙකා සහ ඔවුන්ගේ පරිසරය සමඟ අන්තර්ක්‍රියා කරන ආකාරය තේරුම් ගන්න.",
      order: 3,
      estimatedMinutes: 180,
      status: "DEMO",
      source: "DEMO",
      subjectId: biology.id,
    },
  });
  console.log("  ✓ Unit: Ecology created");

  // ── Topic 5: Ecosystems ──
  console.log("  Creating Topic 5: Ecosystems...");

  const ecosystems = await prisma.contentTopic.create({
    data: {
      id: "topic-ecosystems",
      slug: "ecosystems",
      title: "Ecosystems",
      titleSi: "සිංහල Ecosystems",
      description:
        "Explore how energy flows through ecosystems via food chains and food webs.",
      descriptionSi:
        "ආහාර දාම සහ ආහාර ජාල හරහා පරිසර පද්ධති හරහා ශක්තිය ගලා යන ආකාරය ගවේෂණය කරන්න.",
      order: 1,
      difficulty: "beginner",
      importance: "normal",
      examRelevance: 60,
      estimatedMinutes: 90,
      status: "DEMO",
      source: "DEMO",
      unitId: ecology.id,
    },
  });

  // Subtopic: Food Chains
  const foodChains = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-food-chains",
      slug: "food-chains",
      title: "Food Chains",
      titleSi: "සිංහල Food Chains",
      description:
        "Linear sequences of organisms showing energy transfer from producers to consumers to decomposers.",
      descriptionSi:
        "උත්පාදකයන්ගෙන් පරිභෝජකයන්ට සහ වික්ෂෝපකයන්ට ශක්ති හුවමාරුව පෙන්වන ක්ෂුද්‍ර ජීවීන්ගේ සෘජු අනුපිළිවෙල.",
      content:
        "A food chain is a linear sequence of organisms through which nutrients and energy pass as one organism eats another. It starts with producers (plants), followed by primary consumers (herbivores), secondary consumers (carnivores), and tertiary consumers. Decomposers break down dead organic matter, returning nutrients to the soil.",
      order: 1,
      estimatedMinutes: 45,
      status: "DEMO",
      source: "DEMO",
      topicId: ecosystems.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-construct-food-chains",
        slug: "construct-food-chains",
        title: "Construct food chains from given organisms",
        titleSi: "සිංහල Construct food chains from given organisms",
        description: "Draw food chains identifying producers, consumers, and decomposers.",
        descriptionSi: "සිංහල Draw food chains identifying producers, consumers, and decomposers",
        order: 1,
        difficulty: "beginner",
        status: "DEMO",
        source: "DEMO",
        subtopicId: foodChains.id,
      },
    ],
  });

  // Subtopic: Energy Flow
  const energyFlow = await prisma.contentSubtopic.create({
    data: {
      id: "subtopic-energy-flow",
      slug: "energy-flow",
      title: "Energy Flow",
      titleSi: "සිංහල Energy Flow",
      description:
        "The 10% rule, trophic levels, and how energy is lost as heat at each level of the food chain.",
      descriptionSi:
        "10% නීතිය, පෝෂණ මට්ටම් සහ ආහාර දාමයේ සෑම මට්ටමකම ශක්තිය තාපය ලෙස අහිමි වන ආකාරය.",
      content:
        "Energy flows through ecosystems in one direction, from the sun to producers and then through consumers. At each trophic level, approximately 90% of energy is lost as heat through cellular respiration. This is why food chains rarely have more than 4-5 trophic levels. An energy pyramid visually represents the decrease in available energy at each successive level.",
      order: 2,
      estimatedMinutes: 45,
      status: "DEMO",
      source: "DEMO",
      topicId: ecosystems.id,
    },
  });

  await prisma.contentLearningObjective.createMany({
    data: [
      {
        id: "lo-explain-10-percent-rule",
        slug: "explain-10-percent-rule",
        title: "Explain the 10% rule of energy transfer",
        titleSi: "සිංහල Explain the 10% rule of energy transfer",
        description: "Calculate energy available at each trophic level given initial energy.",
        descriptionSi: "සිංහල Calculate energy available at each trophic level given initial energy",
        order: 1,
        difficulty: "beginner",
        status: "DEMO",
        source: "DEMO",
        subtopicId: energyFlow.id,
      },
    ],
  });

  // ── Topic 6: Biodiversity ──
  console.log("  Creating Topic 6: Biodiversity...");

  await prisma.contentTopic.create({
    data: {
      id: "topic-biodiversity",
      slug: "biodiversity",
      title: "Biodiversity",
      titleSi: "සිංහල Biodiversity",
      description:
        "The variety of life on Earth — species diversity, genetic diversity, and ecosystem diversity.",
      descriptionSi:
        "පෘථිවියේ ජීවයේ විවිධත්වය — විශේෂ විවිධත්වය, ජාන විවිධත්වය සහ පරිසර පද්ධති විවිධත්වය.",
      order: 2,
      difficulty: "intermediate",
      importance: "normal",
      examRelevance: 55,
      estimatedMinutes: 90,
      status: "DEMO",
      source: "DEMO",
      unitId: ecology.id,
    },
  });

  // ─── DEMO Questions (Phase 2D) ──────────────────────────────────
  console.log("\nCreating demo questions...");

  await prisma.question.create({
      data: { id: "q-mitosis-1", subjectId: biology.id, unitId: cellBiology.id, topicId: cellDivision.id, type: "MCQ", difficulty: "easy", stem: "Which stage of mitosis is characterized by chromosomes aligning at the metaphase plate?", explanation: "During metaphase, chromosomes align along the metaphase plate (equator) of the cell before being pulled apart in anaphase.", marks: 1, tags: ["mitosis", "cell-division"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-mitosis-1-o1", text: "Prophase", isCorrect: false, order: 0 }, { id: "q-mitosis-1-o2", text: "Metaphase", isCorrect: true, order: 1 }, { id: "q-mitosis-1-o3", text: "Anaphase", isCorrect: false, order: 2 }, { id: "q-mitosis-1-o4", text: "Telophase", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-mitosis-2", subjectId: biology.id, unitId: cellBiology.id, topicId: cellDivision.id, type: "MCQ", difficulty: "medium", stem: "How many daughter cells are produced by a single mitotic division, and what is their chromosome number relative to the parent?", explanation: "Mitosis produces two genetically identical diploid daughter cells, each with the same chromosome number as the parent cell.", marks: 1, tags: ["mitosis"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-mitosis-2-o1", text: "2 cells, half the chromosomes", isCorrect: false, order: 0 }, { id: "q-mitosis-2-o2", text: "4 cells, half the chromosomes", isCorrect: false, order: 1 }, { id: "q-mitosis-2-o3", text: "2 cells, the same number of chromosomes", isCorrect: true, order: 2 }, { id: "q-mitosis-2-o4", text: "4 cells, the same number of chromosomes", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-meiosis-1", subjectId: biology.id, unitId: cellBiology.id, topicId: cellDivision.id, type: "MCQ", difficulty: "medium", stem: "During which phase of meiosis does crossing over occur?", explanation: "Crossing over (exchange of genetic material between homologous chromosomes) occurs during prophase I of meiosis, contributing to genetic variation.", marks: 1, tags: ["meiosis", "genetic-variation"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-meiosis-1-o1", text: "Prophase I", isCorrect: true, order: 0 }, { id: "q-meiosis-1-o2", text: "Metaphase II", isCorrect: false, order: 1 }, { id: "q-meiosis-1-o3", text: "Anaphase I", isCorrect: false, order: 2 }, { id: "q-meiosis-1-o4", text: "Telophase II", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-meiosis-2", subjectId: biology.id, unitId: cellBiology.id, topicId: cellDivision.id, type: "MCQ", difficulty: "hard", stem: "Which statement correctly distinguishes mitosis from meiosis?", explanation: "Mitosis produces two identical diploid cells for growth and repair, whereas meiosis produces four genetically distinct haploid gametes.", marks: 1, tags: ["mitosis", "meiosis"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-meiosis-2-o1", text: "Mitosis produces gametes, meiosis produces body cells", isCorrect: false, order: 0 }, { id: "q-meiosis-2-o2", text: "Meiosis halves the chromosome number; mitosis maintains it", isCorrect: true, order: 1 }, { id: "q-meiosis-2-o3", text: "Both produce four daughter cells", isCorrect: false, order: 2 }, { id: "q-meiosis-2-o4", text: "Crossing over only happens in mitosis", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-cell-structure-1", subjectId: biology.id, unitId: cellBiology.id, topicId: cellStructure.id, type: "MCQ", difficulty: "easy", stem: "Which organelle is the site of photosynthesis in plant cells?", explanation: "Chloroplasts contain chlorophyll and carry out photosynthesis, converting light energy into chemical energy.", marks: 1, tags: ["organelles", "chloroplast"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-cell-structure-1-o1", text: "Mitochondrion", isCorrect: false, order: 0 }, { id: "q-cell-structure-1-o2", text: "Ribosome", isCorrect: false, order: 1 }, { id: "q-cell-structure-1-o3", text: "Chloroplast", isCorrect: true, order: 2 }, { id: "q-cell-structure-1-o4", text: "Golgi apparatus", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-cell-structure-2", subjectId: biology.id, unitId: cellBiology.id, topicId: cellStructure.id, type: "MCQ", difficulty: "medium", stem: "A structure present in animal cells but absent in plant cells is:", explanation: "Centrioles are found in animal cells and are involved in spindle formation during cell division; they are generally absent in higher plant cells.", marks: 1, tags: ["organelles", "centriole"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-cell-structure-2-o1", text: "Cell wall", isCorrect: false, order: 0 }, { id: "q-cell-structure-2-o2", text: "Centriole", isCorrect: true, order: 1 }, { id: "q-cell-structure-2-o3", text: "Chloroplast", isCorrect: false, order: 2 }, { id: "q-cell-structure-2-o4", text: "Large central vacuole", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-dna-1", subjectId: biology.id, unitId: molecularBiology.id, topicId: dnaStructure.id, type: "MCQ", difficulty: "easy", stem: "What is the complementary base pair of adenine (A) in DNA?", explanation: "In DNA, adenine (A) always pairs with thymine (T) via two hydrogen bonds, while guanine (G) pairs with cytosine (C).", marks: 1, tags: ["dna", "base-pairing"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-dna-1-o1", text: "Guanine", isCorrect: false, order: 0 }, { id: "q-dna-1-o2", text: "Cytosine", isCorrect: false, order: 1 }, { id: "q-dna-1-o3", text: "Thymine", isCorrect: true, order: 2 }, { id: "q-dna-1-o4", text: "Uracil", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-dna-2", subjectId: biology.id, unitId: molecularBiology.id, topicId: dnaStructure.id, type: "MCQ", difficulty: "medium", stem: "Which enzyme is responsible for unzipping the DNA double helix during replication?", explanation: "Helicase unwinds and separates the two DNA strands by breaking the hydrogen bonds between base pairs.", marks: 1, tags: ["dna", "replication"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-dna-2-o1", text: "DNA ligase", isCorrect: false, order: 0 }, { id: "q-dna-2-o2", text: "Helicase", isCorrect: true, order: 1 }, { id: "q-dna-2-o3", text: "DNA polymerase", isCorrect: false, order: 2 }, { id: "q-dna-2-o4", text: "Primase", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-protein-1", subjectId: biology.id, unitId: molecularBiology.id, topicId: proteinSynthesis.id, type: "MCQ", difficulty: "medium", stem: "Which molecule carries amino acids to the ribosome during translation?", explanation: "Transfer RNA (tRNA) carries specific amino acids to the ribosome, matching its anticodon with the mRNA codon.", marks: 1, tags: ["protein-synthesis", "translation"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-protein-1-o1", text: "mRNA", isCorrect: false, order: 0 }, { id: "q-protein-1-o2", text: "rRNA", isCorrect: false, order: 1 }, { id: "q-protein-1-o3", text: "tRNA", isCorrect: true, order: 2 }, { id: "q-protein-1-o4", text: "DNA polymerase", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-protein-2", subjectId: biology.id, unitId: molecularBiology.id, topicId: proteinSynthesis.id, type: "MCQ", difficulty: "hard", stem: "RNA processing in eukaryotes removes which regions of the pre-mRNA?", explanation: "During RNA processing, introns (non-coding regions) are removed by splicing, and exons (coding regions) are joined together.", marks: 1, tags: ["protein-synthesis", "rna-processing"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-protein-2-o1", text: "Exons", isCorrect: false, order: 0 }, { id: "q-protein-2-o2", text: "Introns", isCorrect: true, order: 1 }, { id: "q-protein-2-o3", text: "Codons", isCorrect: false, order: 2 }, { id: "q-protein-2-o4", text: "Anticodons", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-eco-1", subjectId: biology.id, unitId: ecology.id, topicId: ecosystems.id, type: "MCQ", difficulty: "easy", stem: "What percentage of energy typically transfers from one trophic level to the next?", explanation: "Approximately 10% of energy is transferred between trophic levels; the rest is lost as heat through respiration.", marks: 1, tags: ["ecology", "energy-flow"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-eco-1-o1", text: "10%", isCorrect: true, order: 0 }, { id: "q-eco-1-o2", text: "50%", isCorrect: false, order: 1 }, { id: "q-eco-1-o3", text: "90%", isCorrect: false, order: 2 }, { id: "q-eco-1-o4", text: "100%", isCorrect: false, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-eco-2", subjectId: biology.id, unitId: ecology.id, topicId: ecosystems.id, type: "MCQ", difficulty: "medium", stem: "In a food chain, which organisms form the first trophic level?", explanation: "Producers (autotrophs such as plants) form the first trophic level, capturing energy from the sun via photosynthesis.", marks: 1, tags: ["ecology", "food-chain"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-eco-2-o1", text: "Primary consumers", isCorrect: false, order: 0 }, { id: "q-eco-2-o2", text: "Decomposers", isCorrect: false, order: 1 }, { id: "q-eco-2-o3", text: "Secondary consumers", isCorrect: false, order: 2 }, { id: "q-eco-2-o4", text: "Producers", isCorrect: true, order: 3 } ] } } });
    await prisma.question.create({
      data: { id: "q-biodiversity-1", subjectId: biology.id, unitId: ecology.id, topicId: "topic-biodiversity", type: "MCQ", difficulty: "easy", stem: "Which type of biodiversity describes the variety of genes within a species?", explanation: "Genetic diversity refers to the variety of genes and alleles within a species, which increases its resilience and adaptability.", marks: 1, tags: ["biodiversity"], status: "PUBLISHED", source: "DEMO", options: { create: [ { id: "q-biodiversity-1-o1", text: "Species diversity", isCorrect: false, order: 0 }, { id: "q-biodiversity-1-o2", text: "Ecosystem diversity", isCorrect: false, order: 1 }, { id: "q-biodiversity-1-o3", text: "Genetic diversity", isCorrect: true, order: 2 }, { id: "q-biodiversity-1-o4", text: "Habitat diversity", isCorrect: false, order: 3 } ] } } });

  // ─── DEMO COMMUNITY & STUDY-TIMER DATA (Phase: Telegram Groups, Study Timers, Real-time Chat) ──
  console.log("\nCreating community & study-timer demo data...");

  // Ensure Subject lookup rows exist (required by StudySession.subjectId)
  const subjectLookups = [
    { id: "bio",   name: "Biology",   icon: "🧬", color: "#10B981" },
    { id: "chem",  name: "Chemistry", icon: "⚗️", color: "#F59E0B" },
    { id: "phy",   name: "Physics",   icon: "⚛️", color: "#3B82F6" },
    { id: "maths", name: "Maths",     icon: "📐", color: "#EF4444" },
  ];
  for (const s of subjectLookups) {
    await prisma.subject.upsert({ where: { id: s.id }, update: {}, create: s });
  }

  // Demo users (for study timers, real-time chat, hierarchy verification)
  const demoUserDefs = [
    { email: "demo.student@biopulse.test", name: "Dilshan Perera" },
    { email: "demo.mate@biopulse.test",    name: "Nadeesha Jaya" },
  ];
  const demoUsers: { id: string }[] = [];
  for (const u of demoUserDefs) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, passwordHash: "demo-invalid-hash" },
    });
    demoUsers.push(user);
  }
  const demoUser = demoUsers[0];

  // Study timers (StudySession records) for the demo user
  const now = Date.now();
  await prisma.studySession.deleteMany({ where: { userId: demoUser.id } });
  await prisma.studySession.createMany({
    data: [
      { userId: demoUser.id, subjectId: "bio",  minutes: 45, completedAt: new Date(now - 86400000 * 2) },
      { userId: demoUser.id, subjectId: "chem", minutes: 60, completedAt: new Date(now - 86400000 * 1) },
      { userId: demoUser.id, subjectId: "bio",  minutes: 90, completedAt: new Date(now - 86400000 * 0) },
      { userId: demoUser.id, subjectId: "phy",  minutes: 30, completedAt: new Date(now) },
    ],
  });

  // A/L Telegram study groups & channels (incl. @BioALQuiz)
  await prisma.telegramGroup.deleteMany();
  await prisma.telegramGroup.createMany({
    data: [
      { name: "Bio A/L Study Hub",       username: "BioALQuiz",      inviteLink: "https://t.me/BioALQuiz",      category: "channel",     memberCount: 12480, isOfficial: true,  description: "Daily Biology MCQs & A/L notes for Sri Lankan students." },
      { name: "A/L Biology Q&A",         username: "BioALQnA",       inviteLink: "https://t.me/BioALQnA",       category: "group",       memberCount: 3420,  isOfficial: false, description: "Ask questions and get answers from top scorers." },
      { name: "Chemistry A/L Group",     username: "ChemAL2027",     inviteLink: "https://t.me/ChemAL2027",     category: "group",       memberCount: 2180,  isOfficial: false, description: "Focused Chemistry revision for the 2027 batch." },
      { name: "Physics A/L Squad",       username: "PhyALRevise",    inviteLink: "https://t.me/PhyALRevise",    category: "group",       memberCount: 1675,  isOfficial: false, description: "Physics past paper discussions and tips." },
      { name: "Combined Maths Corner",   username: "CMathsAL",       inviteLink: "https://t.me/CMathsAL",       category: "channel",     memberCount: 9840,  isOfficial: true,  description: "Weekly revision sheets for Combined Maths." },
      { name: "A/L Study Buddies",       username: "ALStudyBuddies", inviteLink: "https://t.me/ALStudyBuddies", category: "supergroup", memberCount: 5120,  isOfficial: false, description: "Group study marathons and accountability." },
    ],
  });

  // Real-time community chat messages (User -> ChatMessage hierarchy)
  await prisma.chatMessage.deleteMany();
  const chatSeed: { room: string; text: string }[] = [
    { room: "general",  text: "Welcome to the BioPulse community! 👋" },
    { room: "general",  text: "Has anyone tried the new flashcards feature?" },
    { room: "general",  text: "Just finished today's 45 min Biology timer, feeling great!" },
    { room: "BioALQuiz", text: "Remember: photosynthesis happens in the chloroplast, not the mitochondria 👍" },
    { room: "BioALQuiz", text: "Tomorrow's MCQ theme: Genetics. Stay tuned!" },
    { room: "Chemistry", text: "Balancing redox equations is still tricky for me, any tips?" },
    { room: "Chemistry", text: "Try the half-reaction method, it's much easier." },
    { room: "Physics",  text: "Don't forget sig figs in the numerical paper! 🙌" },
  ];
  for (let i = 0; i < chatSeed.length; i++) {
    await prisma.chatMessage.create({
      data: {
        userId: demoUsers[i % demoUsers.length].id,
        room: chatSeed[i].room,
        text: chatSeed[i].text,
        createdAt: new Date(now - (chatSeed.length - i) * 60000),
      },
    });
  }

  // ─── App channels (join & chat in-app) ─────────────────────────────
  console.log("\nCreating app channels...");
  await prisma.groupChannel.deleteMany();
  const appChannels = [
    { name: "Biology A/L Study Room",       slug: "bio-al-study",       description: "Daily Biology revision, MCQs, and doubt-solving with peers.",      category: "study",      isOfficial: true },
    { name: "Chemistry Doubt Central",      slug: "chem-doubt-central", description: "Ask and answer Chemistry questions — reactions, calculations & more.", category: "study",      isOfficial: false },
    { name: "Physics Problem Solving",      slug: "physics-problems",   description: "Work through Physics numericals and past-paper questions together.", category: "study",      isOfficial: false },
    { name: "A/L Exam Motivation",          slug: "exam-motivation",    description: "Daily motivation, study streaks, and accountability check-ins.",    category: "motivation", isOfficial: false },
    { name: "General Community Lounge",     slug: "community-lounge",   description: "Off-topic chat and a friendly space for all BioPulse members.",    category: "general",    isOfficial: false },
  ];
  const createdChannels: { id: string }[] = [];
  for (const c of appChannels) {
    const ch = await prisma.groupChannel.create({ data: c });
    createdChannels.push(ch);
  }

  // Demo users join some channels (memberships)
  await prisma.groupMember.deleteMany();
  const joins = [
    { userId: demoUsers[0].id, channelIndex: 0 },
    { userId: demoUsers[0].id, channelIndex: 1 },
    { userId: demoUsers[0].id, channelIndex: 3 },
    { userId: demoUsers[1].id, channelIndex: 0 },
    { userId: demoUsers[1].id, channelIndex: 2 },
    { userId: demoUsers[1].id, channelIndex: 4 },
  ];
  for (const j of joins) {
    await prisma.groupMember.create({
      data: { userId: j.userId, channelId: createdChannels[j.channelIndex].id },
    });
  }
  // Recompute member counts from actual memberships
  for (const ch of createdChannels) {
    const count = await prisma.groupMember.count({ where: { channelId: ch.id } });
    await prisma.groupChannel.update({ where: { id: ch.id }, data: { memberCount: count } });
  }

  // Demo users also join a few Telegram groups in-app (telegramGroupId memberships)
  const tgJoins: { username: string; userIds: string[] }[] = [
    { username: "BioALQuiz",     userIds: [demoUsers[0].id, demoUsers[1].id] },
    { username: "ChemAL2027",    userIds: [demoUsers[0].id] },
    { username: "ALStudyBuddies", userIds: [demoUsers[1].id] },
  ];
  for (const j of tgJoins) {
    const tg = await prisma.telegramGroup.findUnique({ where: { username: j.username } });
    if (!tg) continue;
    for (const uid of j.userIds) {
      await prisma.groupMember.create({
        data: { userId: uid, telegramGroupId: tg.id },
      });
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────
  const subjectCount = await prisma.contentSubject.count();
  const unitCount = await prisma.contentUnit.count();
  const topicCount = await prisma.contentTopic.count();
  const subtopicCount = await prisma.contentSubtopic.count();
  const objectiveCount = await prisma.contentLearningObjective.count();
  const telegramCount = await prisma.telegramGroup.count();
  const chatCount = await prisma.chatMessage.count();
  const studySessionCount = await prisma.studySession.count({ where: { userId: demoUser.id } });
  const channelCount = await prisma.groupChannel.count();
  const channelMemberCount = await prisma.groupMember.count({ where: { channelId: { not: null } } });
  const tgMemberCount = await prisma.groupMember.count({ where: { telegramGroupId: { not: null } } });

  console.log("\n========================================");
  console.log("  Seeding complete!");
  console.log("========================================");
  console.log(`  Subjects:            ${subjectCount}`);
  console.log(`  Units:               ${unitCount}`);
  console.log(`  Topics:              ${topicCount}`);
  console.log(`  Subtopics:           ${subtopicCount}`);
  console.log(`  Learning Objectives: ${objectiveCount}`);
  console.log(`  Study timers (sessions): ${studySessionCount}`);
  console.log(`  Telegram groups:     ${telegramCount}`);
  console.log(`  Chat messages:       ${chatCount}`);
  console.log(`  App channels:        ${channelCount}`);
  console.log(`  Channel memberships: ${channelMemberCount}`);
  console.log(`  Telegram in-app memberships: ${tgMemberCount}`);
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Seeding failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
