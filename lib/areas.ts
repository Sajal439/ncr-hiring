/**
 * NCR area taxonomy. Order matters: the first pattern that matches an address
 * wins, so put specific micro-markets (Cyber City) before the districts that
 * contain them (Gurugram).
 */
const RULES: Array<[string, RegExp]> = [
  ["Cyber City", /cyber\s?city|cyber greens|cyberpark|dlf phase [23]|sector 24, gurugram/i],
  ["Udyog Vihar", /udyog vihar|sector (18|19|20), gurugram/i],
  ["Golf Course Road", /golf course r|sector (4[23]|53|54), gurugram/i],
  ["Golf Course Ext", /golf course ext|sector (5[5-9]|6[0-9]|7[0-3]), gurugram|badshahpur/i],
  ["Sohna Road", /sohna|sector (4[4-9]|5[0-2]), gurugram/i],
  ["MG Road Gurugram", /mehrauli-gurgaon|sushant lok|sector (2[5-9]|3[0-9]|1[0-7]), gurugram|millennium city/i],
  ["Manesar", /manesar/i],
  ["Gurugram", /gurugram|gurgaon|haryana 12[23]/i],
  ["Noida Sector 62", /sector 6[2-4], noida|noida one|candor techspace/i],
  ["Noida Expressway", /sector 1[23][0-9], noida|noida-greater noida expy|sector (8[0-9]|9[0-9]|7[0-9]), noida/i],
  ["Film City Noida", /film city|sector 16a, noida/i],
  ["Noida", /noida/i],
  ["Greater Noida", /greater noida/i],
  ["Connaught Place", /connaught place|barakhamba|kg marg|janpath|110001/i],
  ["Nehru Place", /nehru place|kalkaji|110019/i],
  ["Okhla", /okhla|mohan cooperative|jasola|sarita vihar|110020|110025|110044|110076/i],
  ["Saket", /saket|malviya nagar|hauz khas|lado sarai|110017|110030/i],
  ["South Delhi", /lajpat nagar|greater kailash|east of kailash|defence colony|vasant kunj|ghitorni|chhatarpur|110024|110048|110065|110070/i],
  ["West Delhi", /kirti nagar|moti nagar|najafgarh|rama rd|naraina|janakpuri|dwarka|mansarover|110015|110058|110077|110028/i],
  ["North Delhi", /pitampura|keshav puram|mukherjee nagar|kamla nagar|rohini|shakurpur|jhandewalan|karol bagh|110034|110035|110055|110009/i],
  ["East Delhi", /patparganj|shahdara|laxmi nagar|110092/i],
  ["Delhi", /delhi/i],
  ["Faridabad", /faridabad/i],
  ["Ghaziabad", /ghaziabad/i],
];

export function areaFor(address: string): string {
  for (const [area, re] of RULES) if (re.test(address)) return area;
  return "Other";
}

/** Roughly the NCR planning region. Anything outside is not our map. */
export function inNCR(lat: number, lng: number): boolean {
  return lat > 28.1 && lat < 29.0 && lng > 76.7 && lng < 77.8;
}
