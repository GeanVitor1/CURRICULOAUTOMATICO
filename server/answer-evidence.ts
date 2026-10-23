import { extractSkills, normalize } from "./engine";

export const experienceYearsQuestion = (question:string) =>
  /quantos|how many|anos de experiencia|years of experience/.test(normalize(question));

/** Recognizes explicit durations only. Total career years and course dates do
 * not establish years with an individual technology. Conflicts stay unanswered. */
export function evidencedTechnologyYears(question:string,evidence:string) {
  if (!experienceYearsQuestion(question)) return undefined;
  const skills=extractSkills(question);
  if (skills.length!==1) return undefined;
  const skill=skills[0],found=new Set<string>();
  for(const clause of evidence.split(/\n|[;!?]|\.(?:\s|$)/)) {
    const text=normalize(clause);
    if (/\b(?:nao|not|sem|curso|course|estudo|studying)\b/.test(text))continue;
    const duration=text.match(/\b(\d{1,2}(?:[.,]\d)?)\s*(?:anos|years)(?:\s+(?:de experiencia|of experience))?(?:\s+(?:profissional|professional))?\s+(?:com|em|with|in|using)\s+(.{1,100})/);
    if(duration && extractSkills(duration[2]).includes(skill))found.add(duration[1].replace(',','.'));
    const escaped=normalize(skill).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const explicit=text.match(new RegExp(String.raw`(?:^|[^a-z0-9])${escaped}\s*(?::|=|[-–—]|por|for)\s*(\d{1,2}(?:[.,]\d)?)\s*(?:anos|years)`));
    if(explicit)found.add(explicit[1].replace(',','.'));
  }
  return found.size===1 ? [...found][0] : undefined;
}
