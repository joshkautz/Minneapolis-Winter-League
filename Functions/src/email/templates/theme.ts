/**
 * The website's look, as values an email can use. Email clients ignore
 * stylesheets and CSS variables, so these are the site's tokens
 * (`App/src/globals.css`, light theme) resolved to plain colors.
 */

export const COLORS = {
	/** `--background`, slate-50: the page behind every card. */
	background: '#f8fafc',
	/** `--card`. */
	card: '#ffffff',
	/** `--primary` and `--foreground`: the league's navy. */
	navy: '#001638',
	/** `--primary-foreground`. */
	onNavy: '#f8fafc',
	/** `--accent`, sky-300: the league's light blue. */
	sky: '#7dd3fc',
	/** A pale wash of the accent, for callouts. */
	skyWash: '#e0f2fe',
	/** `--muted-foreground`, slate-500. */
	muted: '#64748b',
	/** `--border`, slate-200. */
	border: '#e2e8f0',
} as const

/** The site sets no web font; it uses the platform's, and so do emails. */
export const FONT_STACK =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** `--radius`. */
export const RADIUS = '8px'

/** The wordmark from the site's header, served by the site itself. */
export const LOGO = {
	src: 'https://mplswinterleague.com/mpls-logo-default.png',
	width: 240,
	// 573 × 170 at source.
	height: 71,
} as const
