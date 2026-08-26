/**
 * Chat Guards - Security, Jailbreak Prevention, and Out-of-scope Filtering
 */

export function isSimpleGreeting(message: string): boolean {
  const clean = message.toLowerCase().trim();
  if (/\b(thanks|thank|thx|dhonnobad|shukriya)\b/i.test(clean)) {
    return false;
  }
  const greetingRegex =
    /^\s*\b(hi|hello|hey|yo|sup|hola|hi there|hello there|hi bro|hey bro|hello bro|kemon achis|kemon acho|kemon aco|kire|kire bro|ki khobor|good morning|good afternoon|good evening|kemon acis|kemne acho|kemon|assalamu alaikum|salam)\b\s*$/i;
  return (
    greetingRegex.test(clean) ||
    (clean.length <= 15 && /\b(hi|hello|hey|hola|salam)\b/i.test(clean))
  );
}

export function isGratitude(message: string): boolean {
  const clean = message.toLowerCase().trim();
  const gratitudeRegex =
    /\b(thanks|thank\s*you|thx|thank\s*u|dhonnobad|many\s*thanks|shukriya)\b/i;
  return gratitudeRegex.test(clean);
}

export function isRoleHijackingAttempt(message: string): boolean {
  const clean = message.toLowerCase().trim();
  const hijackPatterns = [
    /\b(marketing\s+off|promotion\s+off|branding\s+off)\b/i,
    /\b(act\s+as|work\s+as|be\s+my|become\s+my)\s+(my\s+)?(personal|private|general|coding|developer)\s+assistant\b/i,
    /\b(forget|ignore|disregard|override)\s+(all\s+)?(previous\s+)?(rules|instructions|prompts|identity|company|agency)\b/i,
    /\b(dan\s+mode|jailbreak|unfiltered\s+mode|developer\s+mode)\b/i,
    /\b(ami\s+ja\s+bolbo\s+shunba|kono\s+kotha\s+bolbi\s+na|mukheu\s+anbi\s+na)\b/i,
  ];
  return hijackPatterns.some((p) => p.test(clean));
}

export function isOutOfScopeRequest(message: string): boolean {
  const clean = message.toLowerCase().trim();

  const offTopicPatterns = [
    // Essays, compositions, paragraphs, poems, stories, jokes, animal compositions
    /\b(rochona|rochona\s+likho|essay|composition|paragraph|kobita|poem|story|golpo|joke|chotkula|natok|gaan|song)\b/i,
    /\b(goru|gorur|cow|animal|dog|cat|bird|tree|nature|environment|solar system|sun|moon|earth)\b/i,
    // Explicit user word-count requests (e.g. "500 word", "1000 words", "write 300 words")
    /\b(\d+\s*words?|\d+\s*lines?|\d+\s*page|long\s+paragraph|detailed\s+essay)\b/i,
    /\b(write|create|make|generate)\s+(a|an|me)?\s*(paragraph|essay|composition|article|story|poem|report|summary)\b/i,
    // School / Academic / Homework / Non-business subjects
    /\b(homework|assignment|exam|math|gonit|physics|podartho|chemistry|roshayon|biology|jibobiggan|science|itihas|history|shongbidhan|geography)\b/i,
    // Cooking, recipes, food preparation
    /\b(recipe|cooking|ranna|biryani|cake|khabar|food|diet plan)\b/i,
    // General world trivia / celebrities / sports / politics
    /\b(capital of|rajdhani|president|prime minister|messi|ronaldo|cricket|football|cinema|movie|hero alom)\b/i,
    // General coding / scripts / games / algorithms / software tutorials
    /\b(write|create|make|give|show|generate|build|code)\s+(me\s+)?(a\s+)?(code|script|program|game|function|class|algorithm|component|snippet|app)\b/i,
    /\b(in|using|with)\s+(c#|c\+\+|python|java|javascript|typescript|rust|go|php|ruby|swift|kotlin|c\b|react(\.?js)?|vue|angular|svelte|html|css)/i,
    /\b(snake game|tic tac toe|flappy bird|chess game|calculator|sudoku)\b/i,
    /\b(how\s+to\s+(create|build|make|code|program|develop))\b/i,
  ];

  const inScopeKeywords = [
    "portfolio",
    "project",
    "service",
    "hire",
    "work",
    "experience",
    "pricing",
    "charge",
    "cost",
    "contact",
    "email",
    "phone",
    "location",
    "about",
    "who is",
    "case study",
    "casestudies",
    "tech stack",
    "agency",
    "studio",
  ];

  const hasInScopeKeyword = inScopeKeywords.some((k) => clean.includes(k));
  const isOffTopic = offTopicPatterns.some((p) => p.test(clean));

  return isOffTopic && !hasInScopeKeyword;
}
