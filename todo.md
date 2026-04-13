X Early Bird - Be the first team to fully register for the season.
X Close Call - Be the last team to fully register for the season.
X Pillar of Community - Start the season with the most karma.
X Private Property - Start the season with zero karma.
X Welcome - Start the season as a new team.
X Veteran - Start the season as a rolled over team.
X Thin Ice - Roster a previously banned or suspended player.
X Schooled - Lose to a team of high schoolers.
X Imposters - Caught with a player changing their name.
X Merciless - Beat a team by 15 points.
X Speedrun - Participate in a game with at least 27 points scored.
Just Warming Up - Score 5 or fewer points in a game.
Show Off - Score 18 or more points in a game.
Streaker - Win 10 games in a row.
Also a Streaker - Lose 10 games in a row.
Consistent - Score the same number of points twice in one night.
Dishonor - Forfeit a game.
Usurpers - Roll over a team and have no previous captains.
Kings of the North - Have the top ranked player on your team after the season starts.
Addicted - Team exists for 3 seasons in a row.
Dinosaurs - Team has competed in 10 different seasons.
Forefathers - Team played in the inaugural season.
20XX - Play in the 20XX Season.
Improvement - Place higher than you did last season.
Growing Pains - Place lower than you did last season.

---

Add e2e tests that can ideally run with firebae emulator suite.

---

Do you understand? I want to prioritize user experience, accessibility, responsivness, industry standards, and best practices.

For things that are fully deprecated and no longer used, can we just delete them from our code base to clean things up? I want to make sure that we fully remove obsolete, unneccessary, redundant, oudated, legacy code that isn't being used. I also want to ensure that we have files and code organized, structured, and named in a way that makes sense.

Please commit all of our changes with a meaningful commit message and then push them to the remote branch.

Please ensure that this local branch is up-to-date with remote branch. Then, commit all of our changes with meaningful commit messages and then push them to the "main" remote branch. Ensure there are no emojis or mentions of Claude Code in the commit message(s).

Perform a comprehensive audit and analysis of the code base and let me know if you spot any potential issues/problems/bugs or areas for improvement.

2. Add waiver history UI - The new subcollection pattern makes it easy to show users their waiver history across seasons
3. Add admin waiver management - Consider adding admin functions to:
   - View all pending waivers across users
   - Manually mark waivers as signed (for edge cases)
   - Cancel/resend waivers

4. Waiver expiration - Consider adding expiration logic for pending waivers (e.g., 30 days) to clean up stale requests
5. Tests - Add unit tests for:
   - dropboxSignWebhook - validate signature, metadata extraction, status updates
   - onPaymentCreated - waiver creation with metadata
   - dropboxSignSendReminderEmail - rate limiting, authorizationzz

| Function      | File                   | Change                                                         |
| ------------- | ---------------------- | -------------------------------------------------------------- |
| Team create   | create.ts              | Allow before registration opens, block after registration ends |
| Team rollover | rollover.ts            | Allow before registration opens, block after registration ends |
| Team delete   | delete.ts              | Block after registration ends (was: season start)              |
| Manage player | managePlayer.ts        | Block after registration ends (was: season start)              |
| Create offer  | offers/create.ts       | Block after registration ends (was: season start)              |
| Update offer  | offers/updateStatus.ts | Block after registration ends (was: season start)              |
