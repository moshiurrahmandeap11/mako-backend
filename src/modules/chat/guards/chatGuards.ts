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

/**
 * Out-of-scope requests are handled contextually by the LLM and RAG system prompt
 * across all languages and e-commerce domains without rigid keyword blocking.
 */
export function isOutOfScopeRequest(_message: string): boolean {
  return false;
}
