/**
 * Minneapolis's calendar and clock — the league's nights, a game's kickoff
 * and the zone dates are shown in — imported from
 * `Functions/src/shared/leagueCalendar.ts`, so the App reads days and
 * times exactly as the server does. That file imports only `gameRules.ts`,
 * which imports nothing.
 */

export {
	leagueTimeIso,
	leagueNights,
	leagueSaturdays,
	leagueWallClock,
	thanksgivingSaturday,
} from '../../../Functions/src/shared/leagueCalendar'
