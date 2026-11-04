/**
 * Light / dark theme (design spec "Themes"). The choice lives in localStorage on this device; "system" follows
 * the OS setting. One inline script (THEME_SCRIPT, run in <head> before first paint) owns applying it, so the
 * page never flashes the wrong theme and React only reads the result from <html>.
 */
export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEMES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
/** Fired on window after the choice changes in this tab; the inline script re-applies on it. */
export const THEME_EVENT = 'themechange';
/** Browser chrome colour per theme (the page background). */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f1f4f8', dark: '#3b4250' };

export function parseThemeChoice(value: unknown): ThemeChoice {
  return THEMES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'system';
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

/**
 * Applies the saved choice to <html> (class, color-scheme, theme-color meta) and keeps it applied when the OS
 * setting flips, another tab changes it, or this tab fires THEME_EVENT. Transitions are paused for the switch so
 * nothing animates between palettes. Kept dependency-free: it is inlined as a string.
 */
export const THEME_SCRIPT = `(function(){
var K=${JSON.stringify(THEME_STORAGE_KEY)},C=${JSON.stringify(THEME_COLOR)},d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)');
function choice(){try{var v=localStorage.getItem(K);return v==='light'||v==='dark'?v:'system'}catch(e){return 'system'}}
function meta(){var t=d.classList.contains('light')?'light':'dark',el=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<el.length;i++){el[i].setAttribute('content',C[t]);el[i].removeAttribute('media')}}
function apply(animate){var c=choice(),t=c==='system'?(m.matches?'dark':'light'):c;
if(d.classList.contains(t)&&d.dataset.themeChoice===c)return;
var s;if(animate){s=document.createElement('style');s.textContent='*,*::before,*::after{transition:none!important}';document.head.appendChild(s)}
d.classList.remove('light','dark');d.classList.add(t);d.style.colorScheme=t;d.dataset.themeChoice=c;meta();
if(s){getComputedStyle(d).opacity;setTimeout(function(){s.remove()},0)}}
apply(false);
document.addEventListener('DOMContentLoaded',meta);
m.addEventListener('change',function(){apply(true)});
window.addEventListener('storage',function(e){if(e.key===K)apply(true)});
window.addEventListener(${JSON.stringify(THEME_EVENT)},function(){apply(true)});
})();`;
