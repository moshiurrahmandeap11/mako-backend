/**
 * Normalizes any user-entered domain or URL into a clean hostname string.
 * Example inputs:
 * - "https://labtobit-frontend.vercel.app" => "labtobit-frontend.vercel.app"
 * - "labtobit-frontend.vercel.app" => "labtobit-frontend.vercel.app"
 * - "https://labtobit-frontend.vercel.app/" => "labtobit-frontend.vercel.app"
 * - "http://shop.example.com:8080/products?id=1" => "shop.example.com"
 */
export function normalizeDomain(input: string): string {
  if (!input) return '';
  let str = input.trim().toLowerCase();
  
  // Strip protocol (http:// or https://)
  str = str.replace(/^https?:\/\//i, '');
  
  // Strip path, query params, and hash fragments
  str = str.split('/')[0].split('?')[0].split('#')[0];
  
  // Strip port if present (e.g. localhost:3000 -> localhost)
  str = str.split(':')[0];
  
  return str;
}
